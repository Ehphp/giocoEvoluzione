import type { PreviousCreatureTransformationSummary } from '../creature-visual-versions.ts'
import { resolveEvolutionDirection, type EvolutionFunctionId, type EvolutionTargetId } from '../evolution-targets.ts'
import type { VisualTraitId } from '../visual-traits.ts'
import { AnatomyContractError, buildAnatomyContract, type AnatomyContract } from './anatomy-contract.ts'
import type { BodyPlanMutationId, EvolutionCapability } from './body-plan-mutations.ts'
import {
    applyBodyPlanMutation,
    bodyPlanStructuralMutations,
    isEvolutionTargetAvailable,
    type BodyPlanId,
    type CreatureBodyPlan,
} from './body-plan-registry.ts'
import {
    buildEvolutionLineageContext,
    recentTargetMutationReferences,
    type EvolutionLineageContext,
    type EvolutionLineageEntry,
} from './evolution-lineage.ts'
import { resolveChromaticDirection, type ChromaticDirection } from './chromatic-directions.ts'

/**
 * Everything a FLUX generation needs, derived server-side from the canonical body plan, the
 * selected target and the adopted history. One authority, so the micro-concept, the prompt and
 * the persisted snapshot can never disagree about what this evolution is allowed to do.
 */
export type FluxEvolutionPlan = Readonly<{
    evolutionTargetId: EvolutionTargetId
    visualTraitId: VisualTraitId
    evolutionFunction: EvolutionFunctionId
    /** Skin-only palette guidance, derived deterministically from the request seed. */
    chromaticDirection?: ChromaticDirection
    capability: EvolutionCapability
    bodyPlanMutationId?: BodyPlanMutationId
    bodyPlanId: BodyPlanId
    /** The canonical body plan once this evolution is adopted. */
    resultBodyPlanId: BodyPlanId
    anatomyContract: AnatomyContract
    lineage: EvolutionLineageContext
    /** Bounded history used exclusively by micro-concept novelty validation, never by the prompt. */
    noveltyReferences: readonly EvolutionLineageEntry[]
}>

export type EvolutionPlanErrorCode =
    'EVOLUTION_TARGET_NOT_AVAILABLE' | 'BODY_PLAN_MUTATION_NOT_AUTHORIZED' | 'EVOLUTION_DIRECTION_UNAVAILABLE'

export class EvolutionPlanError extends Error {
    readonly code: EvolutionPlanErrorCode

    constructor(code: EvolutionPlanErrorCode, message: string, options?: { cause?: unknown }) {
        super(message, options)
        this.name = 'EvolutionPlanError'
        this.code = code
    }
}

function stableIndex(value: string, length: number): number {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
    return (hash >>> 0) % length
}

/**
 * A structural mutation is never implicit: it requires the server policy to authorize the
 * capability, and it must be one the current body plan actually offers on the selected target.
 */
export function selectEvolutionCapability(input: {
    bodyPlan: CreatureBodyPlan
    evolutionTargetId: EvolutionTargetId
    bodyPlanMutationEnabled: boolean
    requestedBodyPlanMutationId?: BodyPlanMutationId
    adoptedBodyPlanMutationIds?: readonly BodyPlanMutationId[]
    seed?: string
}): Readonly<{ capability: EvolutionCapability; bodyPlanMutationId?: BodyPlanMutationId }> {
    if (input.requestedBodyPlanMutationId) {
        if (!input.bodyPlanMutationEnabled) {
            throw new EvolutionPlanError(
                'BODY_PLAN_MUTATION_NOT_AUTHORIZED',
                'Le mutazioni del body-plan non sono abilitate.',
            )
        }
        return Object.freeze({
            capability: 'BODY_PLAN_MUTATION',
            bodyPlanMutationId: input.requestedBodyPlanMutationId,
        })
    }
    if (!input.bodyPlanMutationEnabled) return Object.freeze({ capability: 'ANATOMICAL_MUTATION' })
    const adopted = new Set(input.adoptedBodyPlanMutationIds ?? [])
    const candidates = bodyPlanStructuralMutations(input.bodyPlan, input.evolutionTargetId).filter(
        (mutation) => !adopted.has(mutation.id),
    )
    if (!candidates.length) return Object.freeze({ capability: 'ANATOMICAL_MUTATION' })
    const selected =
        candidates[
            stableIndex(`${input.bodyPlan.id}:${input.evolutionTargetId}:${input.seed ?? ''}`, candidates.length)
        ]!
    return Object.freeze({ capability: 'BODY_PLAN_MUTATION', bodyPlanMutationId: selected.id })
}

export function buildFluxEvolutionPlan(input: {
    bodyPlan: CreatureBodyPlan
    evolutionTargetId: EvolutionTargetId
    previousTransformations: readonly PreviousCreatureTransformationSummary[]
    seed?: string
    bodyPlanMutationEnabled?: boolean
    requestedBodyPlanMutationId?: BodyPlanMutationId
    adoptedBodyPlanMutationIds?: readonly BodyPlanMutationId[]
}): FluxEvolutionPlan {
    if (!isEvolutionTargetAvailable(input.bodyPlan, input.evolutionTargetId)) {
        throw new EvolutionPlanError(
            'EVOLUTION_TARGET_NOT_AVAILABLE',
            'Il target evolutivo non e disponibile per il body-plan corrente.',
        )
    }
    const capability = selectEvolutionCapability({
        bodyPlan: input.bodyPlan,
        evolutionTargetId: input.evolutionTargetId,
        bodyPlanMutationEnabled: input.bodyPlanMutationEnabled === true,
        ...(input.requestedBodyPlanMutationId
            ? { requestedBodyPlanMutationId: input.requestedBodyPlanMutationId }
            : {}),
        ...(input.adoptedBodyPlanMutationIds ? { adoptedBodyPlanMutationIds: input.adoptedBodyPlanMutationIds } : {}),
        ...(input.seed ? { seed: input.seed } : {}),
    })
    const direction = resolveEvolutionDirection({
        evolutionTargetId: input.evolutionTargetId,
        previousTransformations: input.previousTransformations,
        ...(input.seed ? { seed: input.seed } : {}),
    })
    if (!direction)
        throw new EvolutionPlanError(
            'EVOLUTION_DIRECTION_UNAVAILABLE',
            'Il target evolutivo non ha una direzione funzionale generabile.',
        )
    let anatomyContract: AnatomyContract
    try {
        anatomyContract = buildAnatomyContract({
            bodyPlan: input.bodyPlan,
            evolutionTargetId: input.evolutionTargetId,
            capability: capability.capability,
            ...(capability.bodyPlanMutationId ? { bodyPlanMutationId: capability.bodyPlanMutationId } : {}),
        })
    } catch (error) {
        if (error instanceof AnatomyContractError)
            throw new EvolutionPlanError(error.code, error.message, { cause: error })
        throw error
    }
    const resultBodyPlan = capability.bodyPlanMutationId
        ? (applyBodyPlanMutation(input.bodyPlan, capability.bodyPlanMutationId) ?? input.bodyPlan)
        : input.bodyPlan
    const chromaticDirection = resolveChromaticDirection({
        evolutionTargetId: input.evolutionTargetId,
        ...(input.seed ? { seed: input.seed } : {}),
    })
    return Object.freeze({
        evolutionTargetId: input.evolutionTargetId,
        visualTraitId: direction.visualTraitId,
        evolutionFunction: direction.evolutionFunction,
        ...(chromaticDirection ? { chromaticDirection } : {}),
        capability: capability.capability,
        ...(capability.bodyPlanMutationId ? { bodyPlanMutationId: capability.bodyPlanMutationId } : {}),
        bodyPlanId: input.bodyPlan.id,
        resultBodyPlanId: resultBodyPlan.id,
        anatomyContract,
        lineage: buildEvolutionLineageContext({
            evolutionTargetId: input.evolutionTargetId,
            previousTransformations: input.previousTransformations,
        }),
        noveltyReferences: recentTargetMutationReferences({
            evolutionTargetId: input.evolutionTargetId,
            previousTransformations: input.previousTransformations,
        }),
    })
}
