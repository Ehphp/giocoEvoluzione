import type { EvolutionTargetId } from '../evolution-targets.ts'
import type { CreatureBodyPlan } from './body-plan-registry.ts'

export type AnatomyContract = Readonly<{
    target: EvolutionTargetId
    invariants: readonly string[]
    targetRules: readonly string[]
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
    const byTarget: Record<EvolutionTargetId, { rules: string[], failures: string[] }> = {
        FORELIMBS: {
            rules: ['Evolve only the existing forelimbs.', 'Keep original forelimb attachment points.', 'Keep hind limbs unchanged.'],
            failures: ['Any added, removed, duplicated, split or relocated limb is invalid.'],
        },
        HIND_LIMBS: {
            rules: ['Evolve only the existing hind limbs.', 'Keep original hind-limb attachment points.', 'Keep forelimbs unchanged.'],
            failures: ['Any added, removed, duplicated, split or relocated limb is invalid.'],
        },
        TAIL: {
            rules: ['Evolve only the existing tail or tails.', 'Keep every tail origin and attachment point unchanged.'],
            failures: ['Any new, removed, duplicated, split or relocated tail is invalid.'],
        },
        HEAD_AND_SENSES: {
            rules: ['Keep exactly one head, the recognisable face, identity eyes and main skull structure.', 'Limit the evolution to existing head and sensory features.'],
            failures: ['Extra heads, faces, eyes or unrelated appendages are invalid.'],
        },
        TORSO_AND_BACK: {
            rules: ['Evolve only the existing torso and back surface or structures.', 'Keep limb, tail, wing, head and face attachment points unchanged.'],
            failures: ['A global silhouette replacement or new appendage is invalid.'],
        },
        SKIN: {
            rules: ['Modify only surface, material, texture or pattern on existing anatomy.', 'Keep the body plan and recognisable silhouette stable.'],
            failures: ['New appendages, structural anatomy changes or unnecessary silhouette changes are invalid.'],
        },
    }
    const selected = byTarget[target]
    return Object.freeze({
        target,
        invariants: freeze(invariants),
        targetRules: freeze(selected.rules),
        failureConditions: freeze([...commonFailures, ...selected.failures]),
    })
}
