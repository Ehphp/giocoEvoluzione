import type { EvolutionTargetId } from '../evolution-targets.ts'
import type { CreatureBodyPlan } from './body-plan-registry.ts'

export const FLUX_CREATIVE_MODES = Object.freeze(['BASELINE', 'EXPRESSIVE'] as const)
export type FluxCreativeMode = (typeof FLUX_CREATIVE_MODES)[number]

export type AnatomyContract = Readonly<{
    target: EvolutionTargetId
    invariants: readonly string[]
    targetRules: readonly string[]
    /**
     * Positive target-scoped freedom. This is deliberately kept beside the
     * failure conditions so the image model does not read the contract as
     * "make no visible change".
     */
    creativeAllowance: string
    failureConditions: readonly string[]
}>

function freeze(items: readonly string[]): readonly string[] {
    return Object.freeze([...items])
}

function limbInvariant(bodyPlan: CreatureBodyPlan): string {
    const total = bodyPlan.forelimbs + bodyPlan.hindLimbs
    return `Keep exactly ${bodyPlan.forelimbs} forelimbs, ${bodyPlan.hindLimbs} hind limbs and ${total} total limbs.`
}

export function buildAnatomyContract(bodyPlan: CreatureBodyPlan, target: EvolutionTargetId): AnatomyContract {
    const invariants = [
        limbInvariant(bodyPlan),
        `Keep exactly ${bodyPlan.tailCount} tail${bodyPlan.tailCount === 1 ? '' : 's'} and ${bodyPlan.wingCount} wing${bodyPlan.wingCount === 1 ? '' : 's'}.`,
        `Keep the ${bodyPlan.bodyPlan} body plan.`,
    ]
    const commonFailures = [
        'Do not add, duplicate, remove, split or relocate limbs, tails, wings, heads, faces or eyes.',
        'Do not change non-target anatomy, pose, framing or composition.',
    ]
    const byTarget: Record<EvolutionTargetId, { rules: string[], creativeAllowance: string, failures: string[] }> = {
        FORELIMBS: {
            rules: ['Evolve only the existing forelimbs.', 'Keep original forelimb attachment points.', 'Keep hind limbs unchanged.'],
            creativeAllowance: 'Single-focus evolution, not necessarily small: substantially reshape the existing forelimbs through local volume, proportions, material, texture, membranes, ridges or other structures anchored to those limbs. A strong local silhouette change is desired.',
            failures: ['Any added, removed, duplicated, split or relocated limb is invalid.'],
        },
        HIND_LIMBS: {
            rules: ['Evolve only the existing hind limbs.', 'Keep original hind-limb attachment points.', 'Keep forelimbs unchanged.'],
            creativeAllowance: 'Single-focus evolution, not necessarily small: substantially reshape the existing hind limbs through local volume, proportions, material, texture, membranes, ridges or other structures anchored to those limbs. A strong local silhouette change is desired.',
            failures: ['Any added, removed, duplicated, split or relocated limb is invalid.'],
        },
        TAIL: {
            rules: ['Evolve only the existing tail or tails.', 'Keep every tail origin and attachment point unchanged.'],
            creativeAllowance: 'Single-focus evolution, not necessarily small: substantially reshape the existing tail through local volume, proportions, material, texture, fins, fans, ridges or other structures anchored to that tail. A strong local silhouette change is desired.',
            failures: ['Any new, removed, duplicated, split or relocated tail is invalid.'],
        },
        HEAD_AND_SENSES: {
            rules: ['Keep exactly one head, the recognisable face, identity eyes and main skull structure.', 'Limit the evolution to existing head and sensory features.'],
            creativeAllowance: 'Single-focus evolution, not necessarily small: substantially reshape target sensory structures through local material, texture, frills, filaments, crests or other features anchored to the existing head. Keep the recognisable face and identity eyes intact while making the local silhouette clearly evolved.',
            failures: ['Extra heads, faces, eyes or appendages outside the existing head and sensory region are invalid.'],
        },
        TORSO_AND_BACK: {
            rules: ['Evolve only the existing torso and back surface or structures.', 'Keep limb, tail, wing, head and face attachment points unchanged.'],
            creativeAllowance: 'Single-focus evolution, not necessarily small: substantially reshape the torso and back through local volume, proportions, material, texture, plates, membranes, ridges, frills or other structures anchored to the torso. A strong dorsal local silhouette change is desired.',
            failures: ['A global body-plan or whole-creature silhouette replacement, or an unrelated new limb, tail, wing, head, face or eye is invalid.'],
        },
        SKIN: {
            rules: ['Modify only surface, material, texture or pattern on existing anatomy.', 'Keep the body plan and recognisable silhouette stable.'],
            creativeAllowance: 'Single-focus evolution, not necessarily small: make the skin material, texture, pattern and colour treatment striking and clearly readable across the selected surface, while keeping its structural anatomy and silhouette stable.',
            failures: ['New appendages, structural anatomy changes or unnecessary silhouette changes are invalid.'],
        },
    }
    const selected = byTarget[target]
    return Object.freeze({
        target,
        invariants: freeze(invariants),
        targetRules: freeze(selected.rules),
        creativeAllowance: selected.creativeAllowance,
        failureConditions: freeze([...commonFailures, ...selected.failures]),
    })
}
