import type { GenerateConceptApiResponse, GenerateConceptErrorResponse } from '../../../shared/creature-transformations/api-contracts.ts'
import type { CreatureConceptGenerator } from '../../../shared/creature-transformations/concept-generator.ts'
import { CreatureConceptGenerationError } from '../../../shared/creature-transformations/concept-generator.ts'
import type { CreatureIdentityResolver } from '../../../shared/creature-transformations/contracts.ts'
import { generateConceptForAuthenticatedProfile } from './generation-service.ts'
import type { CreatureTransformationLabPolicy } from './lab-policy.ts'
import { OpenAiStructuredConceptModelError } from './openai-structured-concept-model.ts'
import { parseGenerateConceptRequest } from './request-validation.ts'
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

export type GenerateConceptFailureStatus = Readonly<{
    status: number
    response: GenerateConceptErrorResponse
}>

function failure(requestId: string, code: string, message: string, problems?: GenerateConceptErrorResponse['problems']): GenerateConceptErrorResponse {
    return { success: false, requestId, code, message, ...(problems?.length ? { problems } : {}) }
}

export function getGenerateConceptFailureStatus(code: string): number {
    if (code === 'METHOD_NOT_ALLOWED') return 405
    if (code === 'UNAUTHENTICATED') return 401
    if (code === 'LAB_DISABLED' || code === 'CONCEPT_MODE_NOT_ALLOWED' || code === 'CREATURE_NOT_OWNED') return 403
    if (code === 'CREATURE_NOT_FOUND') return 404
    if (code === 'AI_RATE_LIMITED') return 429
    if (code === 'AI_NOT_CONFIGURED') return 503
    if (code === 'AI_TIMEOUT') return 504
    if (code === 'OPERATION_NOT_IMPLEMENTED') return 501
    if (code === 'CONCEPT_REJECTED' || code === 'CREATURE_IDENTITY_NOT_SUPPORTED' || code === 'CREATURE_IDENTITY_CONFIGURATION_INVALID') return 422
    if (code === 'AI_PROVIDER_ERROR') return 502
    if (code === 'INTERNAL_ERROR' || code === 'CREATURE_LOOKUP_FAILED') return 500
    return 400
}

function mapThrownError(requestId: string, error: unknown): GenerateConceptErrorResponse {
    if (error instanceof CreatureIdentityResolutionError) {
        return failure(requestId, error.code, error.message)
    }
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
    return failure(requestId, 'INTERNAL_ERROR', 'Errore interno durante la generazione del concept.')
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
