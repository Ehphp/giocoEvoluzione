import type {
    CreatureTransformationApiResponse,
    CreatureTransformationErrorResponse,
    GenerateConceptApiResponse,
    GenerateConceptErrorResponse,
    GenerateImageApiResponse,
} from '../../../shared/creature-transformations/api-contracts.ts'
import type { CreatureConceptGenerator } from '../../../shared/creature-transformations/concept-generator.ts'
import { CreatureConceptGenerationError } from '../../../shared/creature-transformations/concept-generator.ts'
import type { CreatureIdentityResolver } from '../../../shared/creature-transformations/contracts.ts'
import type { CreatureImageProvider } from '../../../shared/creature-transformations/image-generation.ts'
import type { ImagePostProcessor } from '../../../shared/creature-transformations/image-post-processor.ts'
import { ImageValidator } from '../../../shared/creature-transformations/image-validator.ts'
import { generateConceptForAuthenticatedProfile } from './generation-service.ts'
import { ImageGenerationServiceError, generateImageForAuthenticatedProfile } from './image-generation-service.ts'
import type { CreatureTransformationLabPolicy } from './lab-policy.ts'
import { OpenAiStructuredConceptModelError } from './openai-structured-concept-model.ts'
import { parseGenerateConceptRequest, parseGenerateImageRequest } from './request-validation.ts'
import {
    CreatureTransformationStorageError,
    type SupabaseCreatureTransformationStorageAdapter,
} from './supabase-creature-transformation-storage.ts'
import { CreatureIdentityResolutionError } from './supabase-creature-identity-resolver.ts'

export type GenerateConceptEdgeOrchestrationInput = Readonly<{
    profileId: string | null
    requestId: string
    body: unknown
    policy: CreatureTransformationLabPolicy
    resolver: CreatureIdentityResolver
    createGenerator: (mode: 'MOCK' | 'AI') => CreatureConceptGenerator
    now?: () => number
}>

export type GenerateImageEdgeOrchestrationInput = Readonly<{
    profileId: string | null
    requestId: string
    body: unknown
    policy: CreatureTransformationLabPolicy
    resolver: CreatureIdentityResolver
    storage: SupabaseCreatureTransformationStorageAdapter
    createImageProvider: () => CreatureImageProvider
    postProcessor: ImagePostProcessor
    validator?: ImageValidator
}>

export type CreatureTransformationEdgeOrchestrationInput = GenerateConceptEdgeOrchestrationInput & GenerateImageEdgeOrchestrationInput

export type GenerateConceptFailureStatus = Readonly<{
    status: number
    response: GenerateConceptErrorResponse
}>

function failure(requestId: string, code: string, message: string, problems?: CreatureTransformationErrorResponse['problems']): CreatureTransformationErrorResponse {
    return { success: false, requestId, code, message, ...(problems?.length ? { problems } : {}) }
}

export function getGenerateConceptFailureStatus(code: string): number {
    if (code === 'METHOD_NOT_ALLOWED') return 405
    if (code === 'UNAUTHENTICATED') return 401
    if (code === 'LAB_DISABLED' || code === 'CONCEPT_MODE_NOT_ALLOWED' || code === 'IMAGE_PROVIDER_MODE_NOT_ALLOWED' || code === 'CREATURE_NOT_OWNED') return 403
    if (code === 'CREATURE_NOT_FOUND' || code === 'SOURCE_IMAGE_NOT_FOUND') return 404
    if (code === 'AI_RATE_LIMITED') return 429
    if (code === 'AI_NOT_CONFIGURED') return 503
    if (code === 'AI_TIMEOUT' || code === 'IMAGE_PROVIDER_TIMEOUT') return 504
    if (code === 'OPERATION_NOT_IMPLEMENTED' || code === 'REAL_IMAGE_PROVIDER_NOT_IMPLEMENTED') return 501
    if (code === 'CONCEPT_REJECTED' || code === 'CREATURE_IDENTITY_NOT_SUPPORTED' || code === 'CREATURE_IDENTITY_CONFIGURATION_INVALID' || code === 'SOURCE_IMAGE_INVALID' || code === 'RESULT_IMAGE_EMPTY' || code === 'RESULT_IMAGE_INVALID' || code === 'RESULT_IMAGE_UNCHANGED') return 422
    if (code === 'AI_PROVIDER_ERROR' || code === 'MOCK_PROVIDER_FAILED' || code === 'POST_PROCESSING_FAILED' || code === 'STORAGE_UPLOAD_FAILED' || code === 'SIGNED_URL_FAILED') return 502
    if (code === 'INTERNAL_ERROR' || code === 'CREATURE_LOOKUP_FAILED') return 500
    return 400
}

function mapThrownError(requestId: string, error: unknown): CreatureTransformationErrorResponse {
    if (error instanceof CreatureIdentityResolutionError) return failure(requestId, error.code, error.message)
    if (error instanceof CreatureTransformationStorageError) return failure(requestId, error.code, error.message)
    if (error instanceof ImageGenerationServiceError) return failure(requestId, error.code, error.message, error.problems)
    if (error instanceof OpenAiStructuredConceptModelError) {
        const message = error.code === 'AI_NOT_CONFIGURED'
            ? 'La modalita AI non e configurata.'
            : 'La generazione AI non e disponibile.'
        return failure(requestId, error.code, message)
    }
    if (error instanceof CreatureConceptGenerationError && error.cause instanceof OpenAiStructuredConceptModelError) {
        return mapThrownError(requestId, error.cause)
    }
    if (error instanceof CreatureConceptGenerationError) {
        return failure(requestId, 'AI_PROVIDER_ERROR', 'La generazione AI non ha prodotto un concept utilizzabile.')
    }
    return failure(requestId, 'INTERNAL_ERROR', 'Errore interno durante la trasformazione della creatura.')
}

export async function orchestrateGenerateConcept(
    input: GenerateConceptEdgeOrchestrationInput,
): Promise<GenerateConceptApiResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')

    const parsed = parseGenerateConceptRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    if (!input.policy.enabled) return failure(input.requestId, 'LAB_DISABLED', 'Il laboratorio trasformazioni non e abilitato.')
    if (!input.policy.allowedConceptModes.has(parsed.request.conceptMode)) {
        return failure(input.requestId, 'CONCEPT_MODE_NOT_ALLOWED', 'La modalita concept richiesta non e autorizzata.')
    }

    try {
        return await generateConceptForAuthenticatedProfile({
            profileId: input.profileId,
            requestId: input.requestId,
            request: parsed.request,
            resolver: input.resolver,
            generator: input.createGenerator(parsed.request.conceptMode),
            now: input.now,
        })
    } catch (error) {
        return mapThrownError(input.requestId, error)
    }
}

export async function orchestrateGenerateImage(
    input: GenerateImageEdgeOrchestrationInput,
): Promise<GenerateImageApiResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')

    const parsed = parseGenerateImageRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    if (!input.policy.enabled) return failure(input.requestId, 'LAB_DISABLED', 'Il laboratorio trasformazioni non e abilitato.')
    if (parsed.request.imageProviderMode === 'REAL') {
        return failure(input.requestId, 'REAL_IMAGE_PROVIDER_NOT_IMPLEMENTED', 'Il provider immagini reale non e implementato.')
    }
    if (!input.policy.allowedImageProviderModes.has(parsed.request.imageProviderMode)) {
        return failure(input.requestId, 'IMAGE_PROVIDER_MODE_NOT_ALLOWED', 'La modalita immagini richiesta non e autorizzata.')
    }

    try {
        return await generateImageForAuthenticatedProfile({
            profileId: input.profileId,
            requestId: input.requestId,
            request: parsed.request,
            resolver: input.resolver,
            storage: input.storage,
            provider: input.createImageProvider(),
            postProcessor: input.postProcessor,
            ...(input.validator ? { validator: input.validator } : {}),
        })
    } catch (error) {
        return mapThrownError(input.requestId, error)
    }
}

export async function orchestrateCreatureTransformation(
    input: CreatureTransformationEdgeOrchestrationInput,
): Promise<CreatureTransformationApiResponse> {
    const operation = input.body && typeof input.body === 'object' && !Array.isArray(input.body)
        ? (input.body as { operation?: unknown }).operation
        : undefined
    if (operation === 'GENERATE_IMAGE') return orchestrateGenerateImage(input)
    return orchestrateGenerateConcept(input)
}
