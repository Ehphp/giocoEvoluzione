import type { BodyArea } from './body-areas.ts'
import type { MutationArchetype } from './mutation-archetypes.ts'
import type { VisualTraitId } from './visual-traits.ts'

export type TransformationIntensity = 1 | 2 | 3

export const TRANSFORMATION_INTENSITIES = Object.freeze([1, 2, 3] as const)

export type CreatureTransformationConcept = {
    schemaVersion: 1
    visualTrait: VisualTraitId
    conceptName: string
    evolutionaryFunction: string
    primaryMutation: {
        mutationArchetype: MutationArchetype
        bodyAreas: BodyArea[]
        morphology: string
        material: string
    }
    secondaryMutations: string[]
    identityToPreserve: string[]
    forbiddenChanges: string[]
    intensity: TransformationIntensity
}
