import type { EvolutionTargetId } from '../evolution-targets.ts'

/**
 * What an evolution is allowed to do to the creature's topology.
 *
 * `ANATOMICAL_MUTATION` is the normal case: the number of heads, limbs, tails and wings and
 * their attachment points are invariant, while the shape of the selected region is free.
 * `BODY_PLAN_MUTATION` is the intentional exception: one catalogued structural transformation
 * may change the topology, and everything it does not name still has to be preserved.
 */
export const EVOLUTION_CAPABILITIES = Object.freeze(['ANATOMICAL_MUTATION', 'BODY_PLAN_MUTATION'] as const)

export type EvolutionCapability = (typeof EVOLUTION_CAPABILITIES)[number]

export const BODY_PLAN_MUTATION_IDS = Object.freeze([
    'ADD_LIMB_PAIR',
    'BIPEDAL_TRANSITION',
    'FORELIMBS_TO_WINGS',
    'TAIL_SPLIT',
] as const)

export type BodyPlanMutationId = (typeof BODY_PLAN_MUTATION_IDS)[number]

export type BodyPlanMutationDefinition = Readonly<{
    id: BodyPlanMutationId
    label: string
    /** The evolution target a structural mutation belongs to, so unlocking stays target-driven. */
    evolutionTargetId: EvolutionTargetId
    /** Positive, precise instruction for the image model. */
    structuralChange: string
    /** Structure the mutation must still respect while the topology changes. */
    structuralGuardrails: readonly string[]
}>

function defineBodyPlanMutation(definition: BodyPlanMutationDefinition): BodyPlanMutationDefinition {
    return Object.freeze({ ...definition, structuralGuardrails: Object.freeze([...definition.structuralGuardrails]) })
}

/**
 * The catalogue is deliberately explicit and closed: a structural mutation exists only if it is
 * listed here and offered by the current body plan (see `body-plan-registry.ts`).
 */
export const BODY_PLAN_MUTATIONS = Object.freeze([
    defineBodyPlanMutation({
        id: 'ADD_LIMB_PAIR',
        label: 'Nuovo paio di arti',
        evolutionTargetId: 'LIMBS_AND_FEET',
        structuralChange:
            'Grow one additional symmetrical pair of limbs, integrated into the existing limb system and consistent with it in material, proportion and articulation.',
        structuralGuardrails: [
            'The new pair is symmetrical, plausibly attached to the trunk and clearly readable as belonging to this creature.',
            'Existing limbs keep their attachment points.',
        ],
    }),
    defineBodyPlanMutation({
        id: 'BIPEDAL_TRANSITION',
        label: 'Transizione bipede',
        evolutionTargetId: 'BODY_SHAPE',
        structuralChange:
            'Rebuild the posture into an upright bipedal stance: the hind limbs become the weight-bearing legs, the trunk rotates towards vertical and the forelimbs become free arms.',
        structuralGuardrails: [
            'Keep the same number of limbs; only their role, orientation and proportion change.',
            'Keep the head, face and tail recognisable on the new posture.',
        ],
    }),
    defineBodyPlanMutation({
        id: 'FORELIMBS_TO_WINGS',
        label: 'Arti anteriori in ali',
        evolutionTargetId: 'LIMBS_AND_FEET',
        structuralChange:
            'Convert the front limb pair into a pair of wings: the limb skeleton stretches into wing spars carrying a continuous membrane or feathered surface.',
        structuralGuardrails: [
            'The wings replace that limb pair at its original attachment points; no extra pair appears.',
            'Remaining limbs, head and tail keep their current structure.',
        ],
    }),
    defineBodyPlanMutation({
        id: 'TAIL_SPLIT',
        label: 'Coda biforcata',
        evolutionTargetId: 'TAIL',
        structuralChange:
            'Split the tail into two tails that separate from a shared base and develop as a matched pair.',
        structuralGuardrails: [
            'Both tails start from the original tail attachment point.',
            'No other appendage is duplicated.',
        ],
    }),
] as const)

export const BODY_PLAN_MUTATION_BY_ID: Readonly<Record<BodyPlanMutationId, BodyPlanMutationDefinition>> = Object.freeze(
    Object.fromEntries(BODY_PLAN_MUTATIONS.map((mutation) => [mutation.id, mutation])) as Record<
        BodyPlanMutationId,
        BodyPlanMutationDefinition
    >,
)

export function isBodyPlanMutationId(value: unknown): value is BodyPlanMutationId {
    return typeof value === 'string' && (BODY_PLAN_MUTATION_IDS as readonly string[]).includes(value)
}

export function isEvolutionCapability(value: unknown): value is EvolutionCapability {
    return typeof value === 'string' && (EVOLUTION_CAPABILITIES as readonly string[]).includes(value)
}
