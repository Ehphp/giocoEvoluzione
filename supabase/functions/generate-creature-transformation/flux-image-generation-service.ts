import { composeFluxEvolutionPrompt } from '../../../shared/creature-transformations/flux-evolution/flux-prompt-composer.ts'
import type { FluxEvolutionPlan } from '../../../shared/creature-transformations/flux-evolution/evolution-plan.ts'
import { createFluxEvolutionSnapshot, type FluxEvolutionSnapshot } from '../../../shared/creature-transformations/flux-evolution/micro-concept.ts'
import type { CreatureSemanticIdentity } from '../../../shared/creature-transformations/contracts.ts'
import { ImageValidator, sha256Hex, type ImageValidationProblem } from '../../../shared/creature-transformations/image-validator.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from '../../../shared/creature-transformations/render-specifications.ts'
import type { SupabaseCreatureTransformationStorageAdapter } from './supabase-creature-transformation-storage.ts'
import { FalFluxImageProvider, FalFluxImageProviderError } from './fal-flux-image-provider.ts'
import { FluxMicroConceptGenerator, FluxMicroConceptGeneratorError } from './flux-micro-concept-generator.ts'

export const FLUX_RAW_RENDER_SPECIFICATION = Object.freeze({ width: 768, height: 1152 })
export const FLUX_PROMPT_TEMPLATE_VERSION = 'flux-micro-v2'

export type FluxImageGenerationServiceErrorCode = 'FLUX_BODY_PLAN_UNSUPPORTED' | 'FLUX_SOURCE_IMAGE_INVALID' | 'FLUX_RESULT_IMAGE_INVALID' | 'FLUX_RESULT_IMAGE_UNCHANGED' | 'FLUX_CONCEPT_NOT_CONFIGURED' | 'FLUX_CONCEPT_TIMEOUT' | 'FLUX_CONCEPT_PROVIDER_ERROR' | 'FLUX_CONCEPT_RESPONSE_INVALID' | 'FAL_FLUX_NOT_CONFIGURED' | 'FAL_FLUX_TIMEOUT' | 'FAL_FLUX_RATE_LIMITED' | 'FAL_FLUX_BAD_REQUEST' | 'FAL_FLUX_PROVIDER_ERROR' | 'FAL_FLUX_RESPONSE_INVALID'

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
    conceptSnapshot: FluxEvolutionSnapshot
    result: { signedUrl: string, expiresAt: string, mimeType: 'image/png', width: number, height: number, sha256: string, assetReadiness: 'EXPERIMENT_ONLY' }
    generation: { provider: string, model: string, providerRequestId?: string, seed?: number, latencyMs: number, estimatedCostUsd?: number }
    validation: { warnings: string[] }
}>

function failedResult(code: 'FLUX_SOURCE_IMAGE_INVALID' | 'FLUX_RESULT_IMAGE_INVALID' | 'FLUX_RESULT_IMAGE_UNCHANGED', message: string, problems: ImageValidationProblem[]): FluxImageGenerationServiceError {
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
    validator?: ImageValidator
}): Promise<GeneratedFluxImage> {
    const validator = input.validator ?? new ImageValidator()
    let microConcept
    try {
        microConcept = await input.microConceptGenerator.generate({ identity: input.identity, plan: input.plan })
    } catch (error) {
        if (error instanceof FluxMicroConceptGeneratorError) throw new FluxImageGenerationServiceError(error.code, error.message, undefined, { cause: error })
        throw error
    }
    const prompt = composeFluxEvolutionPrompt({
        identity: input.identity,
        anatomyContract: input.plan.anatomyContract,
        microConcept,
        lineage: input.plan.lineage,
    })
    const source = input.source.kind === 'EXPERIMENTAL'
        ? await input.storage.readExperimentalSource(input.source.path)
        : input.source.kind === 'VISUAL'
            ? await input.storage.readVisualVersionSource(input.source.path, input.source.isBaseVersion ?? false)
            : await input.storage.readCanonicalSource(input.source.path, input.source.isBaseVersion ?? false)
    const validSource = await validator.validate({ bytes: source.bytes, mimeType: source.mimeType, renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION })
    if (!validSource.valid) throw failedResult('FLUX_SOURCE_IMAGE_INVALID', 'La sorgente FLUX non ha superato i controlli tecnici.', validSource.problems)
    let generated
    try {
        generated = await input.provider.transform({ prompt, sourcePng: source.bytes })
    } catch (error) {
        if (error instanceof FalFluxImageProviderError) throw new FluxImageGenerationServiceError(error.code, error.message, undefined, { cause: error })
        throw error
    }
    const snapshot = createFluxEvolutionSnapshot({
        ...microConcept,
        evolutionTargetId: input.plan.evolutionTargetId,
        evolutionFunction: input.plan.evolutionFunction,
        capability: input.plan.capability,
        ...(input.plan.bodyPlanMutationId ? { bodyPlanMutationId: input.plan.bodyPlanMutationId } : {}),
        resultBodyPlanId: input.plan.resultBodyPlanId,
        ...(generated.seed === undefined ? {} : { providerSeed: generated.seed }),
    })
    const validOutput = await validator.validate({
        bytes: generated.image, mimeType: 'image/png', renderSpecification: FLUX_RAW_RENDER_SPECIFICATION,
        sourceSha256: validSource.metadata.sha256, requireAlpha: false,
    })
    if (!validOutput.valid) {
        const unchanged = validOutput.problems.some((problem) => problem.code === 'RESULT_IMAGE_UNCHANGED')
        throw failedResult(unchanged ? 'FLUX_RESULT_IMAGE_UNCHANGED' : 'FLUX_RESULT_IMAGE_INVALID', 'Il PNG raw FLUX non ha superato i controlli tecnici.', validOutput.problems)
    }
    const stored = await input.storage.saveRawResult({ profileId: input.profileId, idempotencyKey: input.request.idempotencyKey, image: generated.image })
    return Object.freeze({
        sourceSha256: validSource.metadata.sha256,
        promptSha256: await sha256Hex(new TextEncoder().encode(prompt)),
        prompt,
        conceptSnapshot: snapshot,
        result: { signedUrl: stored.signedUrl, expiresAt: stored.expiresAt, mimeType: 'image/png', width: validOutput.metadata.width, height: validOutput.metadata.height, sha256: validOutput.metadata.sha256, assetReadiness: 'EXPERIMENT_ONLY' },
        generation: { provider: generated.provider, model: generated.model, ...(generated.providerRequestId ? { providerRequestId: generated.providerRequestId } : {}), ...(generated.seed === undefined ? {} : { seed: generated.seed }), latencyMs: generated.latencyMs, ...(generated.estimatedCostUsd === undefined ? {} : { estimatedCostUsd: generated.estimatedCostUsd }) },
        validation: { warnings: ['BACKGROUND_REMOVAL_PENDING_CLIENT'] },
    })
}
