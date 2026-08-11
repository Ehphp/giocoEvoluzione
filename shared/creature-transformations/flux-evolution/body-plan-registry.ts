export type CreatureBodyPlan = Readonly<{
    bodyPlan: 'quadruped' | 'biped' | 'serpentine' | 'winged_quadruped'
    forelimbs: number
    hindLimbs: number
    tailCount: number
    wingCount: number
}>

function defineBodyPlan(bodyPlan: CreatureBodyPlan): CreatureBodyPlan {
    return Object.freeze({ ...bodyPlan })
}

/**
 * Canonical topology for each supported starter. This is deliberately static:
 * image models must never infer limb counts from a source image.
 */
export const CREATURE_BODY_PLAN_REGISTRY: Readonly<Record<string, CreatureBodyPlan>> = Object.freeze({
    VERDANT_HATCHLING: defineBodyPlan({
        bodyPlan: 'quadruped',
        forelimbs: 2,
        hindLimbs: 2,
        tailCount: 1,
        wingCount: 0,
    }),
})

export function resolveCreatureBodyPlan(baseCreatureKey: string): CreatureBodyPlan | null {
    return CREATURE_BODY_PLAN_REGISTRY[baseCreatureKey] ?? null
}
