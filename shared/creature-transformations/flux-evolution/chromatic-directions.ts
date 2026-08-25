import type { EvolutionTargetId } from '../evolution-targets.ts'

export const CHROMATIC_DIRECTION_IDS = Object.freeze([
    'WARM_DARK',
    'EARTHY',
    'PALE',
    'WARM_SATURATED',
    'DARK_SATURATED',
    'HIGH_CONTRAST',
    'DESATURATED',
    'VIVID_ACCENTED',
] as const)

export type ChromaticDirectionId = (typeof CHROMATIC_DIRECTION_IDS)[number]

export type ChromaticDirection = Readonly<{
    id: ChromaticDirectionId
    description: string
}>

function defineChromaticDirection(direction: ChromaticDirection): ChromaticDirection {
    return Object.freeze(direction)
}

/**
 * Skin-only colour families. They guide pigmentation and patterning, never anatomy, biome or
 * optical material effects.
 */
export const CHROMATIC_DIRECTIONS: readonly ChromaticDirection[] = Object.freeze([
    defineChromaticDirection({
        id: 'WARM_DARK',
        description: 'charcoal, rust and ember tones in a dark, cohesive dominant treatment',
    }),
    defineChromaticDirection({
        id: 'EARTHY',
        description: 'ochre, clay and brown tones in a grounded, cohesive palette',
    }),
    defineChromaticDirection({
        id: 'PALE',
        description: 'ivory, bone and cream tones in a pale, coherent dominant palette',
    }),
    defineChromaticDirection({
        id: 'WARM_SATURATED',
        description: 'crimson, amber and orange tones with clear warm saturation',
    }),
    defineChromaticDirection({
        id: 'DARK_SATURATED',
        description: 'burgundy, violet and near-black tones with deep saturation',
    }),
    defineChromaticDirection({
        id: 'HIGH_CONTRAST',
        description: 'a dark structural base with vivid colour markings in clear contrast',
    }),
    defineChromaticDirection({
        id: 'DESATURATED',
        description: 'stone, ash and muted earth tones with restrained saturation',
    }),
    defineChromaticDirection({
        id: 'VIVID_ACCENTED',
        description: 'vivid magenta, violet and amber accents with a coherent biological base',
    }),
])

export const CHROMATIC_DIRECTION_BY_ID: Readonly<Record<ChromaticDirectionId, ChromaticDirection>> = Object.freeze(
    Object.fromEntries(CHROMATIC_DIRECTIONS.map((direction) => [direction.id, direction])) as Record<
        ChromaticDirectionId,
        ChromaticDirection
    >,
)

function stableIndex(value: string, length: number): number {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
    return (hash >>> 0) % length
}

/**
 * Resolves a stable high-level palette direction for Skin only. This deliberately has no runtime
 * randomness and does not yet inspect the current rendered colours.
 */
export function resolveChromaticDirection(input: {
    evolutionTargetId: EvolutionTargetId
    seed?: string
}): ChromaticDirection | null {
    if (input.evolutionTargetId !== 'SKIN_AND_COVERING') return null
    return CHROMATIC_DIRECTIONS[
        stableIndex(`chromatic-direction:${input.evolutionTargetId}:${input.seed ?? ''}`, CHROMATIC_DIRECTIONS.length)
    ]!
}
