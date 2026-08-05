import type { BodyArea } from './body-areas.ts'
import type { EvolutionFunctionId, EvolutionTargetId } from './evolution-targets.ts'
import type { MutationArchetype } from './mutation-archetypes.ts'
import type { VisualTraitId } from './visual-traits.ts'

export type TransformationIntensity = 1 | 2 | 3

export const TRANSFORMATION_INTENSITIES = Object.freeze([1, 2, 3] as const)

export const COLOR_EVOLUTION_MODES = Object.freeze(['PRESERVE', 'EXPAND', 'SHIFT'] as const)
export type ColorEvolutionMode = (typeof COLOR_EVOLUTION_MODES)[number]

export type ColorEvolution = Readonly<{
    /** PRESERVE keeps the established palette; EXPAND adds related visible hues; SHIFT changes the dominant palette. */
    mode: ColorEvolutionMode
    dominantColor: string
    secondaryColors: readonly string[]
    accentColors: readonly string[]
    surfaceEffects: readonly string[]
    affectedBodyAreas: readonly BodyArea[]
    intensity: 0 | TransformationIntensity
    biologicalRationale: string
}>

export const CONSERVATIVE_COLOR_EVOLUTION: ColorEvolution = Object.freeze({
    mode: 'PRESERVE',
    dominantColor: 'established palette',
    secondaryColors: Object.freeze([]),
    accentColors: Object.freeze([]),
    surfaceEffects: Object.freeze([]),
    affectedBodyAreas: Object.freeze([]),
    intensity: 0,
    biologicalRationale: 'No chromatic adaptation is requested for this evolution.',
})

export type CreatureTransformationConcept = {
    /** Schema v1 concepts are retained for existing adopted versions. */
    schemaVersion: 1 | 2
    visualTrait: VisualTraitId
    /** Present for target-based evolutions introduced by schema v2. */
    evolutionTargetId?: EvolutionTargetId
    evolutionFunction?: EvolutionFunctionId
    conceptName: string
    evolutionaryFunction: string
    primaryMutation: {
        mutationArchetype: MutationArchetype
        bodyAreas: BodyArea[]
        /** At most one supporting area; schema-v1 concepts omit it. */
        supportingBodyAreas?: BodyArea[]
        morphology: string
        material: string
    }
    secondaryMutations: string[]
    identityToPreserve: string[]
    forbiddenChanges: string[]
    intensity: TransformationIntensity
    /** Optional so persisted schema-v1 concepts keep their conservative palette behaviour. */
    colorEvolution?: ColorEvolution
}

export function resolveColorEvolution(concept: Pick<CreatureTransformationConcept, 'colorEvolution'>): ColorEvolution {
    return concept.colorEvolution ?? CONSERVATIVE_COLOR_EVOLUTION
}
