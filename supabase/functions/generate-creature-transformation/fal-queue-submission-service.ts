import { composeFluxEvolutionPrompt, composeFluxEvolutionPromptV5, composeFluxEvolutionPromptV6, composeLockedDynamicFluxEvolutionPrompt, composeMinimalFluxEvolutionPrompt } from '../../../shared/creature-transformations/flux-evolution/flux-prompt-composer.ts'
import { createFluxEvolutionSnapshot, isFluxEvolutionSnapshot, type FluxMicroConcept } from '../../../shared/creature-transformations/flux-evolution/micro-concept.ts'
import type { FluxEvolutionPlan } from '../../../shared/creature-transformations/flux-evolution/evolution-plan.ts'
import type { CreatureSemanticIdentity } from '../../../shared/creature-transformations/contracts.ts'
import { ImageValidator, sha256Hex } from '../../../shared/creature-transformations/image-validator.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from '../../../shared/creature-transformations/render-specifications.ts'
import type { SupabaseCreatureTransformationStorageAdapter } from './supabase-creature-transformation-storage.ts'
import { FalFluxImageProvider, FalFluxImageProviderError } from './fal-flux-image-provider.ts'
import { FluxMicroConceptGenerator, FluxMicroConceptGeneratorError } from './flux-micro-concept-generator.ts'
import { FLUX_MINIMAL_PROMPT_TEMPLATE_VERSION, FLUX_PREVIOUS_PROMPT_TEMPLATE_VERSION, FLUX_RESTORED_PROMPT_TEMPLATE_VERSION, type FluxPromptTemplateVersion, FluxImageGenerationServiceError } from './flux-image-generation-service.ts'
import type { FalQueueSource, SeedreamProductionParameters } from './fal-queue-workflow.ts'
import { visualContinuityBrief, visualRepairBrief, type VisualInspection } from '../../../shared/creature-transformations/visual-inspection.ts'

function composePrompt(input: { identity: CreatureSemanticIdentity, plan: FluxEvolutionPlan, concept: FluxMicroConcept, promptTemplateVersion: FluxPromptTemplateVersion, framingAttempt: number }): string {
    if (input.promptTemplateVersion === FLUX_MINIMAL_PROMPT_TEMPLATE_VERSION) return composeMinimalFluxEvolutionPrompt(input.concept, input.framingAttempt)
    if (input.promptTemplateVersion === FLUX_RESTORED_PROMPT_TEMPLATE_VERSION) return composeFluxEvolutionPromptV5({ identity: input.identity, anatomyContract: input.plan.anatomyContract, microConcept: input.concept, lineage: input.plan.lineage, framingAttempt: input.framingAttempt })
    if (input.promptTemplateVersion === FLUX_PREVIOUS_PROMPT_TEMPLATE_VERSION) return composeFluxEvolutionPromptV6({ identity: input.identity, anatomyContract: input.plan.anatomyContract, microConcept: input.concept, lineage: input.plan.lineage, framingAttempt: input.framingAttempt })
    return composeFluxEvolutionPrompt({ identity: input.identity, anatomyContract: input.plan.anatomyContract, microConcept: input.concept, lineage: input.plan.lineage, framingAttempt: input.framingAttempt })
}

export function fluxMicroConceptFromSnapshot(value: unknown): FluxMicroConcept | null {
    if (!isFluxEvolutionSnapshot(value)) return null
    return Object.freeze({
        conceptName: value.conceptName,
        mutationIdea: value.mutationIdea,
        visualDetails: value.visualDetails,
        ...(value.avoid?.length ? { avoid: value.avoid } : {}),
    })
}

export async function composeFluxQueuePrompt(input: { identity: CreatureSemanticIdentity, plan: FluxEvolutionPlan, concept: FluxMicroConcept, promptTemplateVersion: FluxPromptTemplateVersion, framingAttempt: number }) {
    const prompt = composePrompt(input)
    return Object.freeze({ prompt, promptSha256: await sha256Hex(new TextEncoder().encode(prompt)) })
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
    const valid = await input.validator.validate({ bytes: source.bytes, mimeType: source.mimeType, renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION })
    if (!valid.valid) throw new FluxImageGenerationServiceError('FLUX_SOURCE_IMAGE_INVALID', 'La sorgente FLUX non ha superato i controlli tecnici.', valid.problems)
    return valid.metadata.sha256
}

function signedSource(input: { storage: SupabaseCreatureTransformationStorageAdapter, source: FalQueueSource, expiresInSeconds: number }) {
    return input.storage.createVisualVersionSignedUrl({ assetPath: input.source.path, isBaseVersion: input.source.isBaseVersion, expiresInSeconds: input.expiresInSeconds })
}

/** Submission deliberately finishes before Fal inference and has no generated-image buffer. */
export async function submitFluxQueueForAuthenticatedProfile(input: {
    identity: CreatureSemanticIdentity
    plan: FluxEvolutionPlan
    source: FalQueueSource
    storage: SupabaseCreatureTransformationStorageAdapter
    microConceptGenerator: FluxMicroConceptGenerator
    provider: FalFluxImageProvider
    webhookUrl: string
    promptTemplateVersion: FluxPromptTemplateVersion
    sourceUrlTtlSeconds: number
    validator?: ImageValidator
}) {
    const validator = input.validator ?? new ImageValidator()
    let microConcept: FluxMicroConcept
    try {
        microConcept = await input.microConceptGenerator.generate({ identity: input.identity, plan: input.plan })
    } catch (error) {
        if (error instanceof FluxMicroConceptGeneratorError) throw new FluxImageGenerationServiceError(error.code, error.message, undefined, { cause: error })
        throw error
    }
    const sourceSha256 = await validateFluxSource({ storage: input.storage, source: input.source, validator })
    const sourceUrl = (await signedSource({ storage: input.storage, source: input.source, expiresInSeconds: input.sourceUrlTtlSeconds })).signedUrl
    const composed = await composeFluxQueuePrompt({ identity: input.identity, plan: input.plan, concept: microConcept, promptTemplateVersion: input.promptTemplateVersion, framingAttempt: 0 })
    let submission
    try {
        submission = await input.provider.submitFlux({ prompt: composed.prompt, sourceUrl, webhookUrl: input.webhookUrl })
    } catch (error) {
        if (error instanceof FalFluxImageProviderError) throw new FluxImageGenerationServiceError(error.code, error.message, undefined, { cause: error })
        throw error
    }
    return Object.freeze({
        sourceSha256,
        prompt: composed.prompt,
        promptSha256: composed.promptSha256,
        promptTemplateVersion: input.promptTemplateVersion,
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
