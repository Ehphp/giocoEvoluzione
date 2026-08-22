import type { EvolutionTargetId } from '../evolution-targets.ts'
import {
    BODY_PLAN_MUTATION_BY_ID,
    type BodyPlanMutationDefinition,
    type BodyPlanMutationId,
} from './body-plan-mutations.ts'

export const BODY_PLAN_IDS = Object.freeze([
    'QUADRUPED',
    'SIX_LIMBED',
    'BIPED',
    'WINGED_BIPED',
    'WINGED_QUADRUPED',
    'FORKED_TAIL_QUADRUPED',
    'SERPENTINE',
    'TENTACLED',
] as const)

export type BodyPlanId = (typeof BODY_PLAN_IDS)[number]

export type CreatureStance = 'QUADRUPEDAL' | 'BIPEDAL' | 'SERPENTINE' | 'RADIAL'

export type CreatureTopology = Readonly<{
    stance: CreatureStance
    headCount: number
    forelimbCount: number
    hindLimbCount: number
    wingCount: number
    tentacleCount: number
    tailCount: number
}>

/** A structural transition is only possible if the source body plan declares it. */
export type BodyPlanStructuralTransition = Readonly<{
    mutationId: BodyPlanMutationId
    resultBodyPlanId: BodyPlanId
}>

export type CreatureBodyPlan = Readonly<{
    id: BodyPlanId
    label: string
    /** Body-plan wording used inside prompts. */
    promptDescription: string
    topology: CreatureTopology
    /**
     * The evolution targets this body plan offers. A creature without limbs never offers
     * `LIMBS_AND_FEET`; a winged creature offers a dedicated `WINGS` target.
     */
    evolutionTargets: readonly EvolutionTargetId[]
    structuralMutations: readonly BodyPlanStructuralTransition[]
}>

const CORE_TARGETS = Object.freeze([
    'TAIL',
    'LIMBS_AND_FEET',
    'HEAD_AND_CROWN',
    'BODY_SHAPE',
    'DORSAL_STRUCTURES',
    'SKIN_AND_COVERING',
] as const satisfies readonly EvolutionTargetId[])

function defineBodyPlan(plan: CreatureBodyPlan): CreatureBodyPlan {
    return Object.freeze({
        ...plan,
        topology: Object.freeze({ ...plan.topology }),
        evolutionTargets: Object.freeze([...plan.evolutionTargets]),
        structuralMutations: Object.freeze(
            plan.structuralMutations.map((transition) => Object.freeze({ ...transition })),
        ),
    })
}

export const BODY_PLANS: Readonly<Record<BodyPlanId, CreatureBodyPlan>> = Object.freeze({
    QUADRUPED: defineBodyPlan({
        id: 'QUADRUPED',
        label: 'Quadrupede',
        promptDescription: 'four-legged quadrupedal body plan',
        topology: {
            stance: 'QUADRUPEDAL',
            headCount: 1,
            forelimbCount: 2,
            hindLimbCount: 2,
            wingCount: 0,
            tentacleCount: 0,
            tailCount: 1,
        },
        evolutionTargets: CORE_TARGETS,
        structuralMutations: [
            { mutationId: 'ADD_LIMB_PAIR', resultBodyPlanId: 'SIX_LIMBED' },
            { mutationId: 'BIPEDAL_TRANSITION', resultBodyPlanId: 'BIPED' },
            { mutationId: 'FORELIMBS_TO_WINGS', resultBodyPlanId: 'WINGED_BIPED' },
            { mutationId: 'TAIL_SPLIT', resultBodyPlanId: 'FORKED_TAIL_QUADRUPED' },
        ],
    }),
    SIX_LIMBED: defineBodyPlan({
        id: 'SIX_LIMBED',
        label: 'Sei arti',
        promptDescription: 'six-limbed body plan',
        topology: {
            stance: 'QUADRUPEDAL',
            headCount: 1,
            forelimbCount: 4,
            hindLimbCount: 2,
            wingCount: 0,
            tentacleCount: 0,
            tailCount: 1,
        },
        evolutionTargets: CORE_TARGETS,
        structuralMutations: [{ mutationId: 'FORELIMBS_TO_WINGS', resultBodyPlanId: 'WINGED_QUADRUPED' }],
    }),
    BIPED: defineBodyPlan({
        id: 'BIPED',
        label: 'Bipede',
        promptDescription: 'upright bipedal body plan',
        topology: {
            stance: 'BIPEDAL',
            headCount: 1,
            forelimbCount: 2,
            hindLimbCount: 2,
            wingCount: 0,
            tentacleCount: 0,
            tailCount: 1,
        },
        evolutionTargets: CORE_TARGETS,
        structuralMutations: [{ mutationId: 'FORELIMBS_TO_WINGS', resultBodyPlanId: 'WINGED_BIPED' }],
    }),
    WINGED_BIPED: defineBodyPlan({
        id: 'WINGED_BIPED',
        label: 'Bipede alato',
        promptDescription: 'two-legged winged body plan',
        topology: {
            stance: 'BIPEDAL',
            headCount: 1,
            forelimbCount: 0,
            hindLimbCount: 2,
            wingCount: 2,
            tentacleCount: 0,
            tailCount: 1,
        },
        evolutionTargets: [...CORE_TARGETS, 'WINGS'],
        structuralMutations: [],
    }),
    WINGED_QUADRUPED: defineBodyPlan({
        id: 'WINGED_QUADRUPED',
        label: 'Quadrupede alato',
        promptDescription: 'four-legged winged body plan',
        topology: {
            stance: 'QUADRUPEDAL',
            headCount: 1,
            forelimbCount: 2,
            hindLimbCount: 2,
            wingCount: 2,
            tentacleCount: 0,
            tailCount: 1,
        },
        evolutionTargets: [...CORE_TARGETS, 'WINGS'],
        structuralMutations: [],
    }),
    FORKED_TAIL_QUADRUPED: defineBodyPlan({
        id: 'FORKED_TAIL_QUADRUPED',
        label: 'Quadrupede bicaudato',
        promptDescription: 'four-legged quadrupedal body plan with two tails',
        topology: {
            stance: 'QUADRUPEDAL',
            headCount: 1,
            forelimbCount: 2,
            hindLimbCount: 2,
            wingCount: 0,
            tentacleCount: 0,
            tailCount: 2,
        },
        evolutionTargets: CORE_TARGETS,
        structuralMutations: [],
    }),
    SERPENTINE: defineBodyPlan({
        id: 'SERPENTINE',
        label: 'Serpentiforme',
        promptDescription: 'limbless serpentine body plan',
        topology: {
            stance: 'SERPENTINE',
            headCount: 1,
            forelimbCount: 0,
            hindLimbCount: 0,
            wingCount: 0,
            tentacleCount: 0,
            tailCount: 1,
        },
        // A creature with no limbs offers no limb target at all.
        evolutionTargets: ['TAIL', 'HEAD_AND_CROWN', 'BODY_SHAPE', 'DORSAL_STRUCTURES', 'SKIN_AND_COVERING'],
        structuralMutations: [],
    }),
    TENTACLED: defineBodyPlan({
        id: 'TENTACLED',
        label: 'Tentacolare',
        promptDescription: 'radial tentacled body plan',
        topology: {
            stance: 'RADIAL',
            headCount: 1,
            forelimbCount: 0,
            hindLimbCount: 0,
            wingCount: 0,
            tentacleCount: 8,
            tailCount: 0,
        },
        evolutionTargets: ['TENTACLES', 'HEAD_AND_CROWN', 'BODY_SHAPE', 'DORSAL_STRUCTURES', 'SKIN_AND_COVERING'],
        structuralMutations: [],
    }),
})

/**
 * Base topology for each supported starter. This is deliberately static: an image model must
 * never infer limb counts from a source image.
 */
export const CREATURE_BASE_BODY_PLAN_IDS: Readonly<Record<string, BodyPlanId>> = Object.freeze({
    VERDANT_HATCHLING: 'QUADRUPED',
})

export function isBodyPlanId(value: unknown): value is BodyPlanId {
    return typeof value === 'string' && (BODY_PLAN_IDS as readonly string[]).includes(value)
}

export function getBodyPlan(bodyPlanId: BodyPlanId): CreatureBodyPlan {
    return BODY_PLANS[bodyPlanId]
}

export function resolveBaseCreatureBodyPlan(baseCreatureKey: string): CreatureBodyPlan | null {
    const bodyPlanId = CREATURE_BASE_BODY_PLAN_IDS[baseCreatureKey]
    return bodyPlanId ? BODY_PLANS[bodyPlanId] : null
}

export function bodyPlanStructuralMutations(
    bodyPlan: CreatureBodyPlan,
    evolutionTargetId?: EvolutionTargetId,
): BodyPlanMutationDefinition[] {
    return bodyPlan.structuralMutations.flatMap((transition) => {
        const mutation = BODY_PLAN_MUTATION_BY_ID[transition.mutationId]
        if (!mutation) return []
        return !evolutionTargetId || mutation.evolutionTargetId === evolutionTargetId ? [mutation] : []
    })
}

export function allowsBodyPlanMutation(bodyPlan: CreatureBodyPlan, mutationId: BodyPlanMutationId): boolean {
    return bodyPlan.structuralMutations.some((transition) => transition.mutationId === mutationId)
}

/** The body plan a creature has after a structural mutation is adopted. */
export function applyBodyPlanMutation(
    bodyPlan: CreatureBodyPlan,
    mutationId: BodyPlanMutationId,
): CreatureBodyPlan | null {
    const transition = bodyPlan.structuralMutations.find((entry) => entry.mutationId === mutationId)
    return transition ? BODY_PLANS[transition.resultBodyPlanId] : null
}

/**
 * Canonical anatomical state of a creature: its starter topology plus every structural mutation
 * already adopted, in adoption order. A structural mutation therefore changes the contract of
 * every later generation, not just the history metadata.
 */
export function resolveCanonicalBodyPlan(input: {
    baseCreatureKey: string
    adoptedBodyPlanMutationIds?: readonly BodyPlanMutationId[]
}): CreatureBodyPlan | null {
    const base = resolveBaseCreatureBodyPlan(input.baseCreatureKey)
    if (!base) return null
    return (input.adoptedBodyPlanMutationIds ?? []).reduce<CreatureBodyPlan>(
        // An unsupported transition is ignored: the canonical plan never becomes unresolvable
        // because of a historical row.
        (plan, mutationId) => applyBodyPlanMutation(plan, mutationId) ?? plan,
        base,
    )
}

export function isEvolutionTargetAvailable(bodyPlan: CreatureBodyPlan, evolutionTargetId: EvolutionTargetId): boolean {
    return bodyPlan.evolutionTargets.includes(evolutionTargetId)
}
