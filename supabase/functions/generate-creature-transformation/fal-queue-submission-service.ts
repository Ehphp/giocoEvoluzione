import { composeLockedDynamicFluxEvolutionPrompt } from '../../../shared/creature-transformations/flux-evolution/flux-prompt-composer.ts'
import { createFluxEvolutionSnapshot, isFluxEvolutionSnapshot, type FluxMicroConcept } from '../../../shared/creature-transformations/flux-evolution/micro-concept.ts'
import type { FluxEvolutionPlan } from '../../../shared/creature-transformations/flux-evolution/evolution-plan.ts'
import type { CreatureSemanticIdentity } from '../../../shared/creature-transformations/contracts.ts'
import { ImageValidator, sha256Hex } from '../../../shared/creature-transformations/image-validator.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from '../../../shared/creature-transformations/render-specifications.ts'
import type { SupabaseCreatureTransformationStorageAdapter } from './supabase-creature-transformation-storage.ts'
import { FalFluxImageProvider, FalFluxImageProviderError } from './fal-flux-image-provider.ts'
import { FluxMicroConceptGenerator, FluxMicroConceptGeneratorError } from './flux-micro-concept-generator.ts'
import { FluxImageGenerationServiceError } from './flux-image-generation-service.ts'
import type { FalQueueSource, SeedreamProductionParameters } from './fal-queue-workflow.ts'
import { visualContinuityBrief, visualRepairBrief, type VisualInspection } from '../../../shared/creature-transformations/visual-inspection.ts'

export function fluxMicroConceptFromSnapshot(value: unknown): FluxMicroConcept | null {
    if (!isFluxEvolutionSnapshot(value)) return null
    return Object.freeze({
        conceptName: value.conceptName,
        mutationIdea: value.mutationIdea,
        visualDetails: value.visualDetails,
        ...(value.avoid?.length ? { avoid: value.avoid } : {}),
    })
}

/** The production Seedream route is intentionally pinned to the locked dynamic composer. */
export async function composeSeedreamQueuePrompt(input: { identity: CreatureSemanticIdentity, plan: FluxEvolutionPlan, concept: FluxMicroConcept, framingAttempt: number, repairBrief?: string | null }) {
    const lockedPrompt = composeLockedDynamicFluxEvolutionPrompt({
        identity: input.identity,
        anatomyContract: input.plan.anatomyContract,
        microConcept: input.concept,
        framingAttempt: input.framingAttempt,
    })
    const prompt = input.repairBrief ? `${lockedPrompt}\n\n${input.repairBrief}` : lockedPrompt
    return Object.freeze({ prompt, promptSha256: await sha256Hex(new TextEncoder().encode(prompt)) })
}

async function validateFluxSource(input: { storage: SupabaseCreatureTransformationStorageAdapter, source: FalQueueSource, validator: ImageValidator }): Promise<string> {
    const source = input.source.kind === 'EXPERIMENTAL'
        ? await input.storage.readExperimentalSource(input.source.path)
        : input.source.kind === 'VISUAL'
            ? await input.storage.readVisualVersionSource(input.source.path, input.source.isBaseVersion)
            : await input.storage.readCanonicalSource(input.source.path, input.source.isBaseVersion)
    const valid = await input.validator.validate({
        bytes: source.bytes,
        mimeType: source.mimeType,
        renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
        // The provider receives the starter as a reference image and produces its own locked
        // portrait output. Do not reject a valid canonical source merely for being square.
        allowNonStandardDimensions: true,
    })
    if (!valid.valid) throw new FluxImageGenerationServiceError('FLUX_SOURCE_IMAGE_INVALID', 'La sorgente FLUX non ha superato i controlli tecnici.', valid.problems)
    return valid.metadata.sha256
}

function signedSource(input: { storage: SupabaseCreatureTransformationStorageAdapter, source: FalQueueSource, expiresInSeconds: number }) {
    return input.storage.createVisualVersionSignedUrl({ assetPath: input.source.path, isBaseVersion: input.source.isBaseVersion, expiresInSeconds: input.expiresInSeconds })
}

/**
 * Same source validation, evolution plan and micro-concept as FLUX; only the provider payload
 * and the locked presentation composer differ. The queue workflow persists those choices.
 */
export async function submitSeedreamEvolutionForAuthenticatedProfile(input: {
    identity: CreatureSemanticIdentity
    plan: FluxEvolutionPlan
    source: FalQueueSource
    storage: SupabaseCreatureTransformationStorageAdapter
    microConceptGenerator: FluxMicroConceptGenerator
    provider: FalFluxImageProvider
    webhookUrl: string
    parameters: SeedreamProductionParameters
    sourceUrlTtlSeconds: number
    visualInspection?: VisualInspection | null
    validator?: ImageValidator
}) {
    const validator = input.validator ?? new ImageValidator()
    let microConcept: FluxMicroConcept
    try {
        microConcept = await input.microConceptGenerator.generate({ identity: input.identity, plan: input.plan, visualContinuity: visualContinuityBrief(input.visualInspection) })
    } catch (error) {
        if (error instanceof FluxMicroConceptGeneratorError) throw new FluxImageGenerationServiceError(error.code, error.message, undefined, { cause: error })
        throw error
    }
    const sourceSha256 = await validateFluxSource({ storage: input.storage, source: input.source, validator })
    const sourceUrl = (await signedSource({ storage: input.storage, source: input.source, expiresInSeconds: input.sourceUrlTtlSeconds })).signedUrl
    const composed = await composeSeedreamQueuePrompt({ identity: input.identity, plan: input.plan, concept: microConcept, framingAttempt: 0, repairBrief: visualRepairBrief(input.visualInspection) })
    let submission
    try {
        submission = await input.provider.submitSeedreamEvolution({ prompt: composed.prompt, sourceUrl, imageSize: input.parameters.imageSize, webhookUrl: input.webhookUrl })
    } catch (error) {
        if (error instanceof FalFluxImageProviderError) throw new FluxImageGenerationServiceError(error.code, error.message, undefined, { cause: error })
        throw error
    }
    return Object.freeze({
        sourceSha256,
        prompt: composed.prompt,
        promptSha256: composed.promptSha256,
        promptTemplateVersion: 'seedream-locked-dynamic-v1',
        conceptSnapshot: createFluxEvolutionSnapshot({
            ...microConcept,
            evolutionTargetId: input.plan.evolutionTargetId,
            evolutionFunction: input.plan.evolutionFunction,
            capability: input.plan.capability,
            ...(input.plan.bodyPlanMutationId ? { bodyPlanMutationId: input.plan.bodyPlanMutationId } : {}),
            resultBodyPlanId: input.plan.resultBodyPlanId,
        }),
        submission,
    })
}
