export const CREATURE_TRANSFORMATION_LAB_HASH = '#creature-transformation-lab'

export function canShowCreatureTransformationLab(input: {
    enabled: boolean
    hasAuthenticatedCreature: boolean
    hash: string
}): boolean {
    return input.enabled && input.hasAuthenticatedCreature && input.hash === CREATURE_TRANSFORMATION_LAB_HASH
}

