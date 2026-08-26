import { EVOLUTION_TARGET_BY_ID, type EvolutionTargetId } from '../evolution-targets.ts'
import {
    BODY_PLAN_MUTATION_BY_ID,
    type BodyPlanMutationDefinition,
    type BodyPlanMutationId,
    type EvolutionCapability,
} from './body-plan-mutations.ts'
import {
    applyBodyPlanMutation,
    isEvolutionTargetAvailable,
    type BodyPlanId,
    type CreatureBodyPlan,
    type CreatureTopology,
} from './body-plan-registry.ts'

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
    /** Canonical topology visible in the supplied source image. */
    sourceTopology: CreatureTopology
    /** Canonical topology the generated result must show. */
    resultTopology: CreatureTopology
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

function limbSentence(topology: CreatureTopology, allowPresentationChange = false): string | null {
    const limbs = topology.forelimbCount + topology.hindLimbCount
    if (!limbs) return 'The creature has no limbs; it stays limbless.'
    const pairs = limbs / 2
    const presentationRule = allowPresentationChange
        ? ' Their relative visual positions may adapt only as required by the authorized body-plan mutation; no limb may migrate to a different anatomical region.'
        : ' Keep every limb in its existing anatomical root and body region. Preserve the existing pose, stance, weight distribution and overall body presentation.'
    return Number.isInteger(pairs)
        ? `Keep exactly ${limbs} limbs, in ${pairs} symmetrical pair${pairs === 1 ? '' : 's'}, connected to the same anatomical roots and body regions.${presentationRule}`
        : `Keep exactly ${limbs} limbs connected to the same anatomical roots and body regions.${presentationRule}`
}

function countSentence(count: number, singular: string, plural: string): string | null {
    return count > 0 ? `Keep exactly ${count} ${count === 1 ? singular : plural}.` : null
}

function topologyInvariants(bodyPlan: CreatureBodyPlan, allowPresentationChange = false): string[] {
    const topology = bodyPlan.topology
    return [
        `Keep exactly ${topology.headCount} head${topology.headCount === 1 ? '' : 's'} with the recognisable face of this individual.`,
        limbSentence(topology, allowPresentationChange),
        countSentence(topology.wingCount, 'wing', 'wings'),
        countSentence(topology.tentacleCount, 'tentacle', 'tentacles'),
        countSentence(topology.tailCount, 'tail', 'tails'),
        `Keep the ${bodyPlan.promptDescription}.`,
    ].filter((entry): entry is string => entry !== null)
}

type TargetContract = Readonly<{
    allowances: readonly string[]
    preservation: readonly string[]
    failures: readonly string[]
}>

const TARGET_CONTRACTS: Readonly<Record<EvolutionTargetId, TargetContract>> = Object.freeze({
    TAIL: {
        allowances: [
            'Reshape the existing tail freely: length, thickness, segmentation, tip, fins, fans, ridges, spikes and any structure anchored to that tail.',
            'A strong tail-local silhouette change is wanted; it must not alter the body silhouette outside the tail.',
        ],
        preservation: ['The tail remains connected to the same anatomical root and body region.'],
        failures: ['A split tail or a tail growing from a new anatomical root is invalid.'],
    },
    LIMBS_AND_FEET: {
        allowances: [
            'Treat all existing limbs as one system and evolve them together: length, mass, visible articulation, feet, toes, claws, pads, spurs, membranes and structures anchored to the limbs.',
            'Strong changes of limb proportion, thickness and anatomical reach are wanted. Longer or shorter limbs may naturally make the creature appear taller or shorter within its existing pose; do not change its stance, weight distribution or overall body presentation.',
        ],
        preservation: [
            'Keep every limb connected to its existing anatomical root and body region. Evolve local proportions and geometry in place; do not change relative presentation, stance or visible placement.',
        ],
        failures: [],
    },
    HEAD_AND_CROWN: {
        allowances: [
            'Develop the head crown and sensory apparatus: horns, antlers, antennae, crests, frills, ears, spurs, plates, whiskers and eye-region structures anchored to the existing skull.',
            'The head silhouette may change strongly. Keep the face recognisable as the same individual — that means the same identity, not a pixel-identical head.',
        ],
        preservation: ['Keep one single head, one single face and the existing eye arrangement.'],
        failures: ['A second head, a second face or extra eyes are invalid.'],
    },
    BODY_SHAPE: {
        allowances: [
            'Reshape the body itself: trunk length, overall volume, chest depth, back line, shoulder and hip mass, waist and general silhouette.',
            'The creature may become clearly longer, shorter, heavier or leaner through its trunk morphology and mass distribution. This target is a change of body form, not an added plate or crest or a new presentation of the creature.',
        ],
        preservation: [
            'Keep the head and face recognisable, and keep limb and tail counts and anatomical roots unchanged. Preserve the same base pose, viewpoint, facing direction, overall orientation and composition. Limbs and tail may make only minimal proportional adjustments needed to follow the new trunk shape, without changing the base pose, stance or presentation.',
        ],
        failures: [
            'Plates, crests or spines may only be necessary, subordinate secondary adaptations; they cannot replace the primary body-form mutation or become a new dominant mutation.',
            'Changing pose, stance, facing direction, overall orientation, viewpoint or composition is invalid. The body-form mutation must be achieved by morphology within the existing presentation; only the minimal technical reframing needed to keep the full creature visible is allowed.',
        ],
    },
    DORSAL_STRUCTURES: {
        allowances: [
            'Add or develop structures anchored to the back and spine: spines, crests, ridges, fins, plates, membranes, sails or humps, following the existing spine line.',
            'These structures may be large and may change the upper silhouette strongly.',
        ],
        preservation: ['Keep new dorsal structures biologically rooted along the existing back and spine region.'],
        failures: [
            'Dorsal structures may not become limbs, wings, tails or heads, and related secondary adaptations may not create a new dominant mutation elsewhere.',
        ],
    },
    SKIN_AND_COVERING: {
        allowances: [
            'Rework the surface and covering over the existing anatomy: material, scale shape and grain, plating, fur, feathers, texture, pattern, colour treatment and translucency.',
            'The treatment may be striking and clearly readable at gameplay scale.',
        ],
        preservation: [
            'The covering follows the existing anatomy; keep the body plan and recognisable overall creature silhouette.',
        ],
        failures: ['New appendages or structural anatomy changes are invalid on this target.'],
    },
    WINGS: {
        allowances: [
            'Evolve the existing wings: span, membrane shape, spar structure, feathering, edge profile, folds and structures anchored to the wings.',
            'A strong change of the wing silhouette is wanted.',
        ],
        preservation: [
            'Keep every wing connected to its existing anatomical root and body region; its visible angle and span may adapt locally to the mutation without changing the overall pose, stance, weight distribution or body presentation.',
        ],
        failures: ['Wing structures may not become independently rooted limbs or appendages.'],
    },
    TENTACLES: {
        allowances: [
            'Evolve the existing tentacles as one system: length, section, taper, suckers, barbs, terminal appendages and surface.',
            'Strong changes of tentacle proportion are wanted.',
        ],
        preservation: ['Keep every tentacle connected to the same anatomical root and attachment ring.'],
        failures: ['Terminal tentacle structures may not become independently rooted appendages.'],
    },
})

const ANATOMICAL_FAILURES = Object.freeze([
    'Treat any violation of HARD INVARIANTS, STRICT FRAMING, TARGET STRUCTURE BOUNDARY or NON-TARGET PRESERVATION as an invalid result.',
])

const STRUCTURAL_FAILURES = Object.freeze([
    'Only the AUTHORIZED BODY-PLAN MUTATION may alter topology; treat any other violation of HARD INVARIANTS, STRICT FRAMING, TARGET STRUCTURE BOUNDARY or NON-TARGET PRESERVATION as an invalid result.',
])

function resolveAuthorizedMutation(input: {
    bodyPlan: CreatureBodyPlan
    evolutionTargetId: EvolutionTargetId
    capability: EvolutionCapability
    bodyPlanMutationId?: BodyPlanMutationId
}): BodyPlanMutationDefinition | null {
    if (input.capability === 'ANATOMICAL_MUTATION') {
        if (input.bodyPlanMutationId) {
            throw new AnatomyContractError(
                'BODY_PLAN_MUTATION_NOT_AUTHORIZED',
                'Una mutazione strutturale richiede la capability BODY_PLAN_MUTATION.',
            )
        }
        return null
    }
    const mutation = input.bodyPlanMutationId ? BODY_PLAN_MUTATION_BY_ID[input.bodyPlanMutationId] : undefined
    if (!mutation)
        throw new AnatomyContractError(
            'BODY_PLAN_MUTATION_NOT_AUTHORIZED',
            'La capability BODY_PLAN_MUTATION richiede una mutazione strutturale del catalogo.',
        )
    if (mutation.evolutionTargetId !== input.evolutionTargetId) {
        throw new AnatomyContractError(
            'BODY_PLAN_MUTATION_NOT_AUTHORIZED',
            'La mutazione strutturale non appartiene al target selezionato.',
        )
    }
    if (!applyBodyPlanMutation(input.bodyPlan, mutation.id)) {
        throw new AnatomyContractError(
            'BODY_PLAN_MUTATION_NOT_AUTHORIZED',
            'Il body-plan corrente non prevede questa mutazione strutturale.',
        )
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
        throw new AnatomyContractError(
            'EVOLUTION_TARGET_NOT_AVAILABLE',
            'Il target evolutivo non e disponibile per il body-plan corrente.',
        )
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
        sourceTopology: Object.freeze({ ...input.bodyPlan.topology }),
        resultTopology: Object.freeze({ ...resultBodyPlan.topology }),
        topologyInvariants: freeze(topologyInvariants(resultBodyPlan, mutation?.id === 'BIPEDAL_TRANSITION')),
        targetAllowances: freeze([`Work on ${target.promptRegion}.`, ...contract.allowances]),
        preservationRules: freeze(mutation ? mutation.structuralGuardrails : contract.preservation),
        ...(mutation ? { structuralChange: mutation.structuralChange, bodyPlanMutationId: mutation.id } : {}),
        failureConditions: freeze(mutation ? STRUCTURAL_FAILURES : [...ANATOMICAL_FAILURES, ...contract.failures]),
    })
}
