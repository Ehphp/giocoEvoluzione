import type { CreatureTransformationAssetReadiness, GenerateImageErrorResponse, GenerateImageResponse } from '../../../shared/creature-transformations/api-contracts.ts'
import { evaluateCreatureTransformationConcept } from '../../../shared/creature-transformations/concept-evaluation.ts'
import { validateCreatureTransformationConcept } from '../../../shared/creature-transformations/concept-validation.ts'
import type { CreatureIdentityResolver, GenerateImageRequest } from '../../../shared/creature-transformations/contracts.ts'
import { CreatureImageProviderError, type CreatureImageProvider } from '../../../shared/creature-transformations/image-generation.ts'
import { ImagePostProcessingError, type ImagePostProcessor } from '../../../shared/creature-transformations/image-post-processor.ts'
import { ImageValidator, type ImageValidationProblem } from '../../../shared/creature-transformations/image-validator.ts'
import { composeCreatureTransformationPrompt, CREATURE_PROMPT_TEMPLATE_VERSION } from '../../../shared/creature-transformations/prompt-composer.ts'
import type { CreaturePromptTemplateVersion } from '../../../shared/creature-transformations/prompt-composer.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from '../../../shared/creature-transformations/render-specifications.ts'
import { VISUAL_TRAIT_BY_ID } from '../../../shared/creature-transformations/visual-traits.ts'
import type { SupabaseCreatureTransformationStorageAdapter } from './supabase-creature-transformation-storage.ts'
import { sha256Hex } from '../../../shared/creature-transformations/image-validator.ts'

export type GeneratedImageResponse = Omit<GenerateImageResponse, 'requestPersistence'> & {
    sourceSha256: string
    promptSha256: string
    conceptSnapshot: GenerateImageRequest['concept']
}

export type ImageGenerationServiceErrorCode =
    | 'CONCEPT_REJECTED'
    | 'SOURCE_IMAGE_INVALID'
    | 'MOCK_PROVIDER_FAILED'
    | 'IMAGE_PROVIDER_TIMEOUT'
    | 'RESULT_IMAGE_EMPTY'
    | 'RESULT_IMAGE_INVALID'
    | 'RESULT_IMAGE_UNCHANGED'
    | 'POST_PROCESSING_FAILED'
    | 'OPENAI_IMAGE_TIMEOUT'
    | 'OPENAI_IMAGE_RATE_LIMITED'
    | 'OPENAI_IMAGE_MODERATION_BLOCKED'
    | 'OPENAI_IMAGE_BAD_REQUEST'
    | 'OPENAI_IMAGE_PROVIDER_ERROR'
    | 'OPENAI_IMAGE_RESPONSE_INVALID'
    | 'OPENAI_IMAGE_BASE64_INVALID'

export class ImageGenerationServiceError extends Error {
    readonly code: ImageGenerationServiceErrorCode
    readonly problems?: ImageValidationProblem[]

    constructor(code: ImageGenerationServiceErrorCode, message: string, problems?: ImageValidationProblem[], options?: { cause?: unknown }) {
        super(message, options)
        this.name = 'ImageGenerationServiceError'
        this.code = code
        this.problems = problems
    }
}

export type GenerateImageServiceInput = Readonly<{
    profileId: string
    requestId: string
    request: GenerateImageRequest
    resolver: CreatureIdentityResolver
    storage: SupabaseCreatureTransformationStorageAdapter
    provider: CreatureImageProvider
    postProcessor: ImagePostProcessor
    validator?: ImageValidator
    promptTemplateVersion?: CreaturePromptTemplateVersion
}>

function conceptRejected(requestId: string, problems?: GenerateImageErrorResponse['problems']): GenerateImageErrorResponse {
    return {
        success: false,
        requestId,
        code: 'CONCEPT_REJECTED',
        message: 'Il concept reinviato non ha superato i controlli richiesti.',
        ...(problems?.length ? { problems } : {}),
    }
}

function resultFailure(validation: Awaited<ReturnType<ImageValidator['validate']>>): ImageGenerationServiceError {
    const problems = validation.valid ? [] : validation.problems
    if (problems.some((entry) => entry.code === 'IMAGE_EMPTY')) {
        return new ImageGenerationServiceError('RESULT_IMAGE_EMPTY', 'Il provider non ha restituito un immagine.', problems)
    }
    if (problems.some((entry) => entry.code === 'RESULT_IMAGE_UNCHANGED')) {
        return new ImageGenerationServiceError('RESULT_IMAGE_UNCHANGED', 'Il risultato del provider non puo coincidere con la sorgente.', problems)
    }
    return new ImageGenerationServiceError('RESULT_IMAGE_INVALID', 'Il PNG restituito non ha superato i controlli tecnici.', problems)
}

function uniqueWarnings(warnings: readonly string[]): string[] {
    return [...new Set(warnings)]
}

function onlyAlphaIsMissing(validation: Awaited<ReturnType<ImageValidator['validate']>>): boolean {
    return !validation.valid && validation.problems.length === 1 && validation.problems[0].code === 'PNG_ALPHA_REQUIRED'
}

function safeConceptSnapshot(concept: GenerateImageRequest['concept']): GenerateImageRequest['concept'] {
    const snapshot = JSON.parse(JSON.stringify(concept)) as GenerateImageRequest['concept']
    const serialized = JSON.stringify(snapshot)
    if (serialized.length > 16384) throw new ImageGenerationServiceError('CONCEPT_REJECTED', 'Il concept controllato e troppo grande per il benchmark.')
    return snapshot
}

export async function generateImageForAuthenticatedProfile(
    input: GenerateImageServiceInput,
): Promise<GeneratedImageResponse | GenerateImageErrorResponse> {
    const validator = input.validator ?? new ImageValidator()
    const resolvedCreature = await input.resolver.resolve({
        profileId: input.profileId,
        creatureId: input.request.creatureId,
    })

    const requestedVisualTrait = VISUAL_TRAIT_BY_ID[input.request.concept.visualTrait]
    const requestedIntensity = input.request.concept.intensity
    if (!requestedVisualTrait || (requestedIntensity !== 1 && requestedIntensity !== 2 && requestedIntensity !== 3)) {
        return conceptRejected(input.requestId)
    }
    const validation = validateCreatureTransformationConcept(input.request.concept, {
        requestedVisualTrait,
        requestedIntensity,
        identity: resolvedCreature.identity,
        previousTransformations: resolvedCreature.previousTransformations,
    })
    if (!validation.valid) return conceptRejected(input.requestId, validation.problems)

    const evaluation = evaluateCreatureTransformationConcept(validation.concept, { identity: resolvedCreature.identity })
    if (!evaluation.acceptable) return conceptRejected(input.requestId, evaluation.problems)

    let prompt: string
    try {
        const composed = composeCreatureTransformationPrompt({
            identity: resolvedCreature.identity,
            concept: validation.concept,
            renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
            templateVersion: input.promptTemplateVersion ?? CREATURE_PROMPT_TEMPLATE_VERSION,
            previousTransformations: resolvedCreature.previousTransformations,
        })
        prompt = composed.prompt
    } catch {
        return conceptRejected(input.requestId)
    }

    const promptSha256 = await sha256Hex(new TextEncoder().encode(prompt))
    const conceptSnapshot = safeConceptSnapshot(validation.concept)
    const source = await input.storage.readCanonicalSource(resolvedCreature.sourceImagePath, resolvedCreature.sourceIsBaseVersion)
    const validatedSource = await validator.validate({
        bytes: source.bytes,
        mimeType: source.mimeType,
        renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
    })
    if (!validatedSource.valid) {
        throw new ImageGenerationServiceError('SOURCE_IMAGE_INVALID', 'La sorgente canonica non ha superato i controlli tecnici.', validatedSource.problems)
    }

    let generated
    try {
        generated = await input.provider.transformCreature({
            requestId: input.requestId,
            idempotencyKey: input.request.idempotencyKey,
            prompt,
            source: {
                bytes: source.bytes,
                mimeType: source.mimeType,
                width: validatedSource.metadata.width,
                height: validatedSource.metadata.height,
                sha256: validatedSource.metadata.sha256,
            },
            renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
        })
    } catch (error) {
        if (error instanceof CreatureImageProviderError) {
            const diagnostics = [
                error.providerErrorCode ? `codice provider: ${error.providerErrorCode}` : null,
                error.providerErrorParam ? `parametro: ${error.providerErrorParam}` : null,
            ].filter((value): value is string => value !== null)
            const providerDiagnostic = diagnostics.length ? ` (${diagnostics.join('; ')})` : ''
            throw new ImageGenerationServiceError(error.code, `Il provider immagini non e disponibile.${providerDiagnostic}`, undefined, { cause: error })
        }
        throw new ImageGenerationServiceError('MOCK_PROVIDER_FAILED', 'Il provider immagini mock non e disponibile.', undefined, { cause: error })
    }

    const firstValidation = await validator.validate({
        bytes: generated.image,
        mimeType: generated.mimeType,
        renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
        sourceSha256: validatedSource.metadata.sha256,
        isMock: generated.isMock,
        profile: generated.isMock ? 'FINAL_CREATURE_ASSET' : 'PROVIDER_RAW_RESULT',
    })
    if (!firstValidation.valid) throw resultFailure(firstValidation)

    let processed
    try {
        processed = await input.postProcessor.process({
            image: generated.image,
            mimeType: generated.mimeType,
            metadata: firstValidation.metadata,
            warnings: uniqueWarnings([...generated.warnings, ...firstValidation.warnings]),
            renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
        })
    } catch (error) {
        if (error instanceof ImagePostProcessingError) {
            throw new ImageGenerationServiceError('POST_PROCESSING_FAILED', 'Il post-processing dell immagine non e riuscito.', undefined, { cause: error })
        }
        throw new ImageGenerationServiceError('POST_PROCESSING_FAILED', 'Il post-processing dell immagine non e riuscito.', undefined, { cause: error })
    }

    const finalValidation = await validator.validate({
        bytes: processed.image,
        mimeType: processed.mimeType,
        renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
        sourceSha256: validatedSource.metadata.sha256,
        isMock: generated.isMock,
        profile: 'FINAL_CREATURE_ASSET',
    })
    if (!finalValidation.valid && !onlyAlphaIsMissing(finalValidation)) throw resultFailure(finalValidation)

    const assetReadiness: CreatureTransformationAssetReadiness = finalValidation.valid ? 'FINAL_ASSET' : 'EXPERIMENT_ONLY'
    const outputMetadata = finalValidation.valid ? finalValidation.metadata : firstValidation.metadata
    const outputWarnings = uniqueWarnings([
        ...generated.warnings,
        ...firstValidation.warnings,
        ...processed.warnings,
        ...(finalValidation.valid ? finalValidation.warnings : ['RAW_RESULT_ALPHA_MISSING']),
    ])

    const stored = await input.storage.saveResult({
        profileId: input.profileId,
        idempotencyKey: input.request.idempotencyKey,
        image: processed.image,
    })

    return {
        success: true,
        requestId: input.requestId,
        result: {
            signedUrl: stored.signedUrl,
            expiresAt: stored.expiresAt,
            mimeType: outputMetadata.mimeType,
            width: outputMetadata.width,
            height: outputMetadata.height,
            sha256: outputMetadata.sha256,
            assetReadiness,
        },
        generation: {
            provider: generated.provider,
            model: generated.model,
            isMock: generated.isMock,
            ...(generated.providerRequestId ? { providerRequestId: generated.providerRequestId } : {}),
            latencyMs: generated.latencyMs,
            ...(generated.estimatedCostUsd === undefined ? {} : { estimatedCostUsd: generated.estimatedCostUsd }),
        },
        validation: {
            warnings: outputWarnings,
        },
        sourceSha256: validatedSource.metadata.sha256,
        promptSha256,
        conceptSnapshot,
    }
}
