import { composeFluxEvolutionPrompt, composeMinimalFluxEvolutionPrompt } from '../../../shared/creature-transformations/flux-evolution/flux-prompt-composer.ts'
import type { FluxEvolutionPlan } from '../../../shared/creature-transformations/flux-evolution/evolution-plan.ts'
import { createFluxEvolutionSnapshot, type FluxEvolutionSnapshot } from '../../../shared/creature-transformations/flux-evolution/micro-concept.ts'
import type { CreatureSemanticIdentity } from '../../../shared/creature-transformations/contracts.ts'
import { ImageValidator, sha256Hex, type ImageValidationProblem } from '../../../shared/creature-transformations/image-validator.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from '../../../shared/creature-transformations/render-specifications.ts'
import type { SupabaseCreatureTransformationStorageAdapter } from './supabase-creature-transformation-storage.ts'
import { FalFluxImageProvider, FalFluxImageProviderError } from './fal-flux-image-provider.ts'
import { FluxMicroConceptGenerator, FluxMicroConceptGeneratorError } from './flux-micro-concept-generator.ts'

export const FLUX_RAW_RENDER_SPECIFICATION = Object.freeze({ width: 768, height: 1152 })
export const FLUX_PROMPT_TEMPLATE_VERSION = 'flux-micro-v6'
export const FLUX_MINIMAL_PROMPT_TEMPLATE_VERSION = 'flux-minimal-v1'
export const FLUX_MAX_CROP_RETRIES = 2
export const FLUX_SUBJECT_MARGIN_RATIO = 0.06

export type FluxPromptTemplateVersion = typeof FLUX_PROMPT_TEMPLATE_VERSION | typeof FLUX_MINIMAL_PROMPT_TEMPLATE_VERSION

export type FluxImageGenerationServiceErrorCode = 'FLUX_BODY_PLAN_UNSUPPORTED' | 'FLUX_SOURCE_IMAGE_INVALID' | 'FLUX_RESULT_IMAGE_INVALID' | 'FLUX_RESULT_IMAGE_UNCHANGED' | 'FLUX_SUBJECT_CROPPED' | 'FLUX_CONCEPT_NOT_CONFIGURED' | 'FLUX_CONCEPT_TIMEOUT' | 'FLUX_CONCEPT_PROVIDER_ERROR' | 'FLUX_CONCEPT_RESPONSE_INVALID' | 'FAL_FLUX_NOT_CONFIGURED' | 'FAL_FLUX_TIMEOUT' | 'FAL_FLUX_RATE_LIMITED' | 'FAL_FLUX_BAD_REQUEST' | 'FAL_FLUX_PROVIDER_ERROR' | 'FAL_FLUX_RESPONSE_INVALID'

export class FluxImageGenerationServiceError extends Error {
    constructor(readonly code: FluxImageGenerationServiceErrorCode, message: string, readonly problems?: ImageValidationProblem[], options?: { cause?: unknown }) {
        super(message, options)
        this.name = 'FluxImageGenerationServiceError'
    }
}

export type GeneratedFluxImage = Readonly<{
    sourceSha256: string
    promptSha256: string
    prompt: string
    promptTemplateVersion: FluxPromptTemplateVersion
    conceptSnapshot: FluxEvolutionSnapshot
    result: { signedUrl: string, expiresAt: string, mimeType: 'image/png', width: number, height: number, sha256: string, assetReadiness: 'EXPERIMENT_ONLY' }
    generation: { provider: string, model: string, providerRequestId?: string, seed?: number, latencyMs: number, estimatedCostUsd?: number }
    validation: { warnings: string[], cropValidationPassed: true, cropRetryCount: number }
}>

function failedResult(code: 'FLUX_SOURCE_IMAGE_INVALID' | 'FLUX_RESULT_IMAGE_INVALID' | 'FLUX_RESULT_IMAGE_UNCHANGED' | 'FLUX_SUBJECT_CROPPED', message: string, problems: ImageValidationProblem[]): FluxImageGenerationServiceError {
    return new FluxImageGenerationServiceError(code, message, problems)
}

/**
 * The single production generation step: micro-concept, prompt, fal.ai, validation and raw
 * storage. The evolution plan — target, capability, contract and lineage — is resolved by the
 * caller so the reservation, the track and the prompt describe the same evolution.
 */
export async function generateFluxImageForAuthenticatedProfile(input: {
    profileId: string
    requestId: string
    request: { creatureId: string, idempotencyKey: string }
    identity: CreatureSemanticIdentity
    plan: FluxEvolutionPlan
    /** Canonical active visual, or a server-validated Lab source. */
    source: { kind: 'CANONICAL' | 'EXPERIMENTAL' | 'VISUAL', path: string, isBaseVersion?: boolean }
    storage: SupabaseCreatureTransformationStorageAdapter
    microConceptGenerator: FluxMicroConceptGenerator
    provider: FalFluxImageProvider
    promptTemplateVersion?: FluxPromptTemplateVersion
    validator?: ImageValidator
}): Promise<GeneratedFluxImage> {
    const validator = input.validator ?? new ImageValidator()
    const promptTemplateVersion = input.promptTemplateVersion ?? FLUX_MINIMAL_PROMPT_TEMPLATE_VERSION
    let microConcept
    try {
        microConcept = await input.microConceptGenerator.generate({ identity: input.identity, plan: input.plan })
    } catch (error) {
        if (error instanceof FluxMicroConceptGeneratorError) throw new FluxImageGenerationServiceError(error.code, error.message, undefined, { cause: error })
        throw error
    }
    const source = input.source.kind === 'EXPERIMENTAL'
        ? await input.storage.readExperimentalSource(input.source.path)
        : input.source.kind === 'VISUAL'
            ? await input.storage.readVisualVersionSource(input.source.path, input.source.isBaseVersion ?? false)
            : await input.storage.readCanonicalSource(input.source.path, input.source.isBaseVersion ?? false)
    const validSource = await validator.validate({ bytes: source.bytes, mimeType: source.mimeType, renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION })
    if (!validSource.valid) throw failedResult('FLUX_SOURCE_IMAGE_INVALID', 'La sorgente FLUX non ha superato i controlli tecnici.', validSource.problems)
    let prompt = ''
    let generated: Awaited<ReturnType<FalFluxImageProvider['transform']>> | null = null
    let validOutput: Awaited<ReturnType<ImageValidator['validate']>> | null = null
    let cropRetryCount = 0
    for (let attempt = 0; attempt <= FLUX_MAX_CROP_RETRIES; attempt += 1) {
        prompt = promptTemplateVersion === FLUX_MINIMAL_PROMPT_TEMPLATE_VERSION
            ? composeMinimalFluxEvolutionPrompt(microConcept, attempt)
            : composeFluxEvolutionPrompt({ identity: input.identity, anatomyContract: input.plan.anatomyContract, microConcept, lineage: input.plan.lineage, framingAttempt: attempt })
        console.info('flux.crop_validation.attempt', { requestId: input.requestId, attempt: attempt + 1, maxAttempts: FLUX_MAX_CROP_RETRIES + 1 })
        try {
            generated = await input.provider.transform({ prompt, sourcePng: source.bytes })
        } catch (error) {
            if (error instanceof FalFluxImageProviderError) throw new FluxImageGenerationServiceError(error.code, error.message, undefined, { cause: error })
            throw error
        }
        validOutput = await validator.validate({
            bytes: generated.image, mimeType: 'image/png', renderSpecification: FLUX_RAW_RENDER_SPECIFICATION,
            sourceSha256: validSource.metadata.sha256, requireAlpha: false, requireSubjectMargin: FLUX_SUBJECT_MARGIN_RATIO,
        })
        const bounds = validOutput.valid ? validOutput.metadata.foregroundBounds : undefined
        console.info('flux.crop_validation.result', { requestId: input.requestId, attempt: attempt + 1, valid: validOutput.valid, bounds, problems: validOutput.valid ? [] : validOutput.problems.map((entry) => entry.code) })
        if (validOutput.valid) break
        const cropped = validOutput.problems.some((entry) => entry.code === 'FLUX_SUBJECT_CROPPED')
        const cropValidationFailed = cropped || validOutput.problems.some((entry) => entry.code === 'PNG_FOREGROUND_DETECTION_FAILED')
        if (cropValidationFailed && attempt < FLUX_MAX_CROP_RETRIES) {
            cropRetryCount += 1
            console.warn('flux.crop_validation.retry', { requestId: input.requestId, nextAttempt: attempt + 2, reason: cropped ? 'FLUX_SUBJECT_CROPPED' : 'PNG_FOREGROUND_DETECTION_FAILED' })
            continue
        }
        const unchanged = validOutput.problems.some((entry) => entry.code === 'RESULT_IMAGE_UNCHANGED')
        if (cropped) console.error('flux.crop_validation.failed', { requestId: input.requestId, attempts: attempt + 1, reason: 'FLUX_SUBJECT_CROPPED' })
        throw failedResult(cropped ? 'FLUX_SUBJECT_CROPPED' : unchanged ? 'FLUX_RESULT_IMAGE_UNCHANGED' : 'FLUX_RESULT_IMAGE_INVALID', cropped ? 'Il soggetto FLUX resta troppo vicino al bordo dopo i retry di framing.' : 'Il PNG raw FLUX non ha superato i controlli tecnici.', validOutput.problems)
    }
    if (!generated || !validOutput?.valid) throw new FluxImageGenerationServiceError('FLUX_SUBJECT_CROPPED', 'La validazione del framing FLUX non ha prodotto un risultato valido.')
    const snapshot = createFluxEvolutionSnapshot({
        ...microConcept,
        evolutionTargetId: input.plan.evolutionTargetId,
        evolutionFunction: input.plan.evolutionFunction,
        capability: input.plan.capability,
        ...(input.plan.bodyPlanMutationId ? { bodyPlanMutationId: input.plan.bodyPlanMutationId } : {}),
        resultBodyPlanId: input.plan.resultBodyPlanId,
        ...(generated.seed === undefined ? {} : { providerSeed: generated.seed }),
    })
    const stored = await input.storage.saveRawResult({ profileId: input.profileId, idempotencyKey: input.request.idempotencyKey, image: generated.image })
    return Object.freeze({
        sourceSha256: validSource.metadata.sha256,
        promptSha256: await sha256Hex(new TextEncoder().encode(prompt)),
        prompt,
        promptTemplateVersion,
        conceptSnapshot: snapshot,
        result: { signedUrl: stored.signedUrl, expiresAt: stored.expiresAt, mimeType: 'image/png', width: validOutput.metadata.width, height: validOutput.metadata.height, sha256: validOutput.metadata.sha256, assetReadiness: 'EXPERIMENT_ONLY' },
        generation: { provider: generated.provider, model: generated.model, ...(generated.providerRequestId ? { providerRequestId: generated.providerRequestId } : {}), ...(generated.seed === undefined ? {} : { seed: generated.seed }), latencyMs: generated.latencyMs, ...(generated.estimatedCostUsd === undefined ? {} : { estimatedCostUsd: generated.estimatedCostUsd }) },
        validation: { warnings: ['BACKGROUND_REMOVAL_PENDING_CLIENT'], cropValidationPassed: true, cropRetryCount },
    })
}
