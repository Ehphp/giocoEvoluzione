import { EVOLUTION_TARGET_BY_ID, type EvolutionTargetId } from '../evolution-targets.ts'
import { BODY_PLAN_MUTATION_BY_ID, type BodyPlanMutationDefinition, type BodyPlanMutationId, type EvolutionCapability } from './body-plan-mutations.ts'
import { applyBodyPlanMutation, isEvolutionTargetAvailable, type BodyPlanId, type CreatureBodyPlan, type CreatureTopology } from './body-plan-registry.ts'

/**
 * The anatomy contract is the deterministic half of a FLUX evolution: it states the topology
 * that must survive, what the selected region is positively allowed to do, and the few things
 * that make a result invalid. It prefers precise allowances over a cascade of disclaimers —
 * a contract read as "make no visible change" produces exactly that.
 */
export type AnatomyContract = Readonly<{
    target: EvolutionTargetId
    capability: EvolutionCapability
    bodyPlanId: BodyPlanId
    /** The body plan the result must show. For a structural mutation this is the new plan. */
    resultBodyPlanId: BodyPlanId
    topologyInvariants: readonly string[]
    targetAllowances: readonly string[]
    preservationRules: readonly string[]
    /** Present only when a body-plan mutation is authorized. */
    structuralChange?: string
    bodyPlanMutationId?: BodyPlanMutationId
    failureConditions: readonly string[]
}>

export type AnatomyContractErrorCode = 'EVOLUTION_TARGET_NOT_AVAILABLE' | 'BODY_PLAN_MUTATION_NOT_AUTHORIZED'

export class AnatomyContractError extends Error {
    readonly code: AnatomyContractErrorCode

    constructor(code: AnatomyContractErrorCode, message: string) {
        super(message)
        this.name = 'AnatomyContractError'
        this.code = code
    }
}

function freeze(items: readonly string[]): readonly string[] {
    return Object.freeze(items.filter((item) => item.trim().length > 0))
}

function limbSentence(topology: CreatureTopology): string | null {
    const limbs = topology.forelimbCount + topology.hindLimbCount
    if (!limbs) return 'The creature has no limbs; it stays limbless.'
    const pairs = limbs / 2
    return Number.isInteger(pairs)
        ? `Keep exactly ${limbs} limbs, in ${pairs} symmetrical pair${pairs === 1 ? '' : 's'}, at their current attachment points.`
        : `Keep exactly ${limbs} limbs at their current attachment points.`
}

function countSentence(count: number, singular: string, plural: string): string | null {
    return count > 0 ? `Keep exactly ${count} ${count === 1 ? singular : plural}.` : null
}

function topologyInvariants(bodyPlan: CreatureBodyPlan): string[] {
    const topology = bodyPlan.topology
    return [
        `Keep exactly ${topology.headCount} head${topology.headCount === 1 ? '' : 's'} with the recognisable face of this individual.`,
        limbSentence(topology),
        countSentence(topology.wingCount, 'wing', 'wings'),
        countSentence(topology.tentacleCount, 'tentacle', 'tentacles'),
        countSentence(topology.tailCount, 'tail', 'tails'),
        `Keep the ${bodyPlan.promptDescription}.`,
    ].filter((entry): entry is string => entry !== null)
}

type TargetContract = Readonly<{ allowances: readonly string[], preservation: readonly string[], failures: readonly string[] }>

const RELATED_SECONDARY_ADAPTATIONS = 'The selected target is the primary evolutionary target. Preserve all unrelated anatomy by default. Introduce secondary adaptations only when they are necessary consequences of the primary mutation: biomechanical support, anatomical continuity, posture rebalancing, structural integration or tightly linked visual propagation. If the primary mutation works on its own, change only the selected target. Any secondary adaptation must stay subordinate, less visually prominent and clearly derived from the primary mutation; no gratuitous changes outside the selected target to the head, limbs, torso, posture, colour, silhouette or body plan.'

const TARGET_CONTRACTS: Readonly<Record<EvolutionTargetId, TargetContract>> = Object.freeze({
    TAIL: {
        allowances: [
            'Reshape the existing tail freely: length, thickness, segmentation, tip, fins, fans, ridges, spikes and any structure anchored to that tail.',
            'A strong change of the tail silhouette is wanted.',
        ],
        preservation: [RELATED_SECONDARY_ADAPTATIONS, 'The tail keeps its origin on the body.'],
        failures: ['A second tail, a split tail or a tail growing from a different attachment point is invalid.'],
    },
    LIMBS_AND_FEET: {
        allowances: [
            'Treat all existing limbs as one system and evolve them together: length, mass, visible articulation, feet, toes, claws, pads, spurs, membranes and structures anchored to the limbs.',
            'Strong changes of limb proportion, thickness and stance height are wanted.',
        ],
        preservation: [RELATED_SECONDARY_ADAPTATIONS, 'The limb count and every limb attachment point stay exactly as they are.'],
        failures: ['Any added, removed, duplicated or relocated limb is invalid.'],
    },
    HEAD_AND_CROWN: {
        allowances: [
            'Develop the head crown and sensory apparatus: horns, antlers, antennae, crests, frills, ears, spurs, plates, whiskers and eye-region structures anchored to the existing skull.',
            'The head silhouette may change strongly. Keep the face recognisable as the same individual — that means the same identity, not a pixel-identical head.',
        ],
        preservation: [RELATED_SECONDARY_ADAPTATIONS, 'One single head, one single face and the existing eye arrangement.'],
        failures: ['A second head, a second face or extra eyes are invalid.'],
    },
    BODY_SHAPE: {
        allowances: [
            'Reshape the body itself: trunk length, overall volume, chest depth, back line, shoulder and hip mass, waist and general silhouette.',
            'The creature may become clearly longer, shorter, heavier, leaner or differently balanced. This target is a change of body form, not an added plate or crest.',
        ],
        preservation: [
            `${RELATED_SECONDARY_ADAPTATIONS} Head, face, limb count, tail count and every attachment point stay as they are; limbs and tail only follow the new body proportions when necessary.`,
            'Keep the existing covering material and colour treatment recognisable unless a secondary surface adaptation is necessary to integrate the body transformation.',
        ],
        failures: [
            'New limbs, new tails or new heads are invalid on this target.',
            'Plates, crests or spines may only be necessary, subordinate secondary adaptations; they cannot replace the primary body-form mutation or become a new dominant mutation.',
        ],
    },
    DORSAL_STRUCTURES: {
        allowances: [
            'Add or develop structures anchored to the back and spine: spines, crests, ridges, fins, plates, membranes, sails or humps, following the existing spine line.',
            'These structures may be large and may change the upper silhouette strongly.',
        ],
        preservation: [RELATED_SECONDARY_ADAPTATIONS],
        failures: ['Dorsal structures may not become limbs, wings, tails or heads, and related secondary adaptations may not create a new dominant mutation elsewhere.'],
    },
    SKIN_AND_COVERING: {
        allowances: [
            'Rework the surface and covering over the existing anatomy: material, scale shape and grain, plating, fur, feathers, texture, pattern, colour treatment and translucency.',
            'The treatment may be striking and clearly readable at gameplay scale.',
        ],
        preservation: [`${RELATED_SECONDARY_ADAPTATIONS} The body plan stays the same and the creature silhouette remains recognisable; the covering follows the existing anatomy.`],
        failures: ['New appendages or structural anatomy changes are invalid on this target.'],
    },
    WINGS: {
        allowances: [
            'Evolve the existing wings: span, membrane shape, spar structure, feathering, edge profile, folds and structures anchored to the wings.',
            'A strong change of the wing silhouette is wanted.',
        ],
        preservation: [RELATED_SECONDARY_ADAPTATIONS, 'The wing count and wing attachment points stay exactly as they are.'],
        failures: ['An added or removed wing pair is invalid.'],
    },
    TENTACLES: {
        allowances: [
            'Evolve the existing tentacles as one system: length, section, taper, suckers, barbs, terminal appendages and surface.',
            'Strong changes of tentacle proportion are wanted.',
        ],
        preservation: [RELATED_SECONDARY_ADAPTATIONS, 'The tentacle count and their attachment ring stay exactly as they are.'],
        failures: ['An added or removed tentacle is invalid.'],
    },
})

const ANATOMICAL_FAILURES = Object.freeze([
    'Adding, removing, duplicating or relocating heads, limbs, wings, tentacles or tails is invalid.',
    'The primary mutation must be clearly readable on the selected target. Preserve all unrelated anatomy by default. Secondary adaptations are valid only when they are necessary consequences of that mutation, and must remain subordinate; a new dominant mutation or gratuitous redesign outside the selected target is invalid.',
    'Changing pose, viewpoint, composition or illustrated style is invalid unless a minimal reframing or subject-scale adjustment is necessary to keep the complete creature and mutated target fully visible with comfortable canvas margin.',
])

const STRUCTURAL_FAILURES = Object.freeze([
    'Only the structural change described above may alter the topology; every other count and attachment point is preserved.',
    'The primary mutation must be clearly readable on the selected target. Preserve all unrelated anatomy by default; any secondary adaptation must be a necessary, subordinate consequence of it.',
    'Changing pose, viewpoint, composition or illustrated style is invalid unless a minimal reframing or subject-scale adjustment is necessary to keep the complete creature and mutated target fully visible with comfortable canvas margin.',
])

function resolveAuthorizedMutation(input: {
    bodyPlan: CreatureBodyPlan
    evolutionTargetId: EvolutionTargetId
    capability: EvolutionCapability
    bodyPlanMutationId?: BodyPlanMutationId
}): BodyPlanMutationDefinition | null {
    if (input.capability === 'ANATOMICAL_MUTATION') {
        if (input.bodyPlanMutationId) {
            throw new AnatomyContractError('BODY_PLAN_MUTATION_NOT_AUTHORIZED', 'Una mutazione strutturale richiede la capability BODY_PLAN_MUTATION.')
        }
        return null
    }
    const mutation = input.bodyPlanMutationId ? BODY_PLAN_MUTATION_BY_ID[input.bodyPlanMutationId] : undefined
    if (!mutation) throw new AnatomyContractError('BODY_PLAN_MUTATION_NOT_AUTHORIZED', 'La capability BODY_PLAN_MUTATION richiede una mutazione strutturale del catalogo.')
    if (mutation.evolutionTargetId !== input.evolutionTargetId) {
        throw new AnatomyContractError('BODY_PLAN_MUTATION_NOT_AUTHORIZED', 'La mutazione strutturale non appartiene al target selezionato.')
    }
    if (!applyBodyPlanMutation(input.bodyPlan, mutation.id)) {
        throw new AnatomyContractError('BODY_PLAN_MUTATION_NOT_AUTHORIZED', 'Il body-plan corrente non prevede questa mutazione strutturale.')
    }
    return mutation
}

export function buildAnatomyContract(input: {
    bodyPlan: CreatureBodyPlan
    evolutionTargetId: EvolutionTargetId
    capability?: EvolutionCapability
    bodyPlanMutationId?: BodyPlanMutationId
}): AnatomyContract {
    const capability: EvolutionCapability = input.capability ?? 'ANATOMICAL_MUTATION'
    if (!isEvolutionTargetAvailable(input.bodyPlan, input.evolutionTargetId)) {
        throw new AnatomyContractError('EVOLUTION_TARGET_NOT_AVAILABLE', 'Il target evolutivo non e disponibile per il body-plan corrente.')
    }
    const mutation = resolveAuthorizedMutation({ ...input, capability })
    const resultBodyPlan = mutation ? applyBodyPlanMutation(input.bodyPlan, mutation.id)! : input.bodyPlan
    const target = EVOLUTION_TARGET_BY_ID[input.evolutionTargetId]
    const contract = TARGET_CONTRACTS[input.evolutionTargetId]
    return Object.freeze({
        target: input.evolutionTargetId,
        capability,
        bodyPlanId: input.bodyPlan.id,
        resultBodyPlanId: resultBodyPlan.id,
        topologyInvariants: freeze(topologyInvariants(resultBodyPlan)),
        targetAllowances: freeze([`Work on ${target.promptRegion}.`, ...contract.allowances]),
        preservationRules: freeze(mutation ? [RELATED_SECONDARY_ADAPTATIONS, ...mutation.structuralGuardrails] : contract.preservation),
        ...(mutation ? { structuralChange: mutation.structuralChange, bodyPlanMutationId: mutation.id } : {}),
        failureConditions: freeze(mutation ? STRUCTURAL_FAILURES : [...ANATOMICAL_FAILURES, ...contract.failures]),
    })
}
