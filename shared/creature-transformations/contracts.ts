import type { CreatureTransformationConcept, TransformationIntensity } from './concepts.ts'
import type { VisualTraitId } from './visual-traits.ts'

export type CreatureSemanticIdentity = {
    creatureId: string
    baseCreatureKey: string
    description: string
    identityFeatures: string[]
    styleDefinition: string
}

export type ResolvedCreatureSource = {
    identity: CreatureSemanticIdentity
    sourceImagePath: string
}

export interface CreatureIdentityResolver {
    resolve(input: {
        profileId: string
        creatureId: string
    }): Promise<ResolvedCreatureSource>
}

export type GenerateConceptRequest = {
    operation: 'GENERATE_CONCEPT'
    creatureId: string
    visualTraitId: VisualTraitId
    intensity: TransformationIntensity
    conceptMode: 'MOCK' | 'AI'
    idempotencyKey: string
}

export type GenerateImageRequest = {
    operation: 'GENERATE_IMAGE'
    creatureId: string
    concept: CreatureTransformationConcept
    imageProviderMode: 'MOCK' | 'REAL'
    idempotencyKey: string
}

export type CreatureTransformationRequest = GenerateConceptRequest | GenerateImageRequest
