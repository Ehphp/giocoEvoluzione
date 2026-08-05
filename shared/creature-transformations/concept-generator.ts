import type { CreatureTransformationConcept, TransformationIntensity } from './concepts.ts'
import type { CreatureSemanticIdentity } from './contracts.ts'
import type { EvolutionFunctionId, EvolutionTargetDefinition, EvolutionTargetId } from './evolution-targets.ts'
import type { VisualTraitDefinition } from './visual-traits.ts'
import type { PreviousCreatureTransformationSummary } from './creature-visual-versions.ts'

export type CreatureConceptGenerationInput = {
    identity: CreatureSemanticIdentity
    visualTrait: VisualTraitDefinition
    evolutionTarget?: EvolutionTargetDefinition
    evolutionTargetId?: EvolutionTargetId
    evolutionFunction?: EvolutionFunctionId
    intensity: TransformationIntensity
    previousTransformations?: readonly PreviousCreatureTransformationSummary[]
    seed?: string
    /** Internal feedback supplied only by retry orchestration. */
    correctionFeedback?: readonly string[]
}

export type ConceptGeneratorMetadata = {
    generator: string
    model?: string
    isMock: boolean
}

export type ConceptGenerationMetadata = ConceptGeneratorMetadata & {
    attempt: number
}

export type GeneratedCreatureConcept = {
    concept: CreatureTransformationConcept
    metadata: ConceptGenerationMetadata
}

export interface CreatureConceptGenerator {
    readonly metadata: ConceptGeneratorMetadata
    generateConcept(input: CreatureConceptGenerationInput): Promise<CreatureTransformationConcept>
}

export type StructuredConceptModelInput = {
    task: 'CREATE_CREATURE_TRANSFORMATION_CONCEPT'
    identity: CreatureSemanticIdentity
    visualTrait: VisualTraitDefinition
    evolutionTarget?: EvolutionTargetDefinition
    evolutionTargetId?: EvolutionTargetId
    evolutionFunction?: EvolutionFunctionId
    intensity: TransformationIntensity
    previousTransformations?: readonly PreviousCreatureTransformationSummary[]
    seed?: string
    correctionFeedback: readonly string[]
}

export interface StructuredConceptModel {
    generateStructuredConcept(input: StructuredConceptModelInput): Promise<unknown>
}

export type CreatureConceptGenerationErrorCode =
    | 'GENERATOR_UNAVAILABLE'
    | 'UNINTERPRETABLE_RESPONSE'
    | 'GENERATOR_DEPENDENCY_FAILED'
    | 'CATALOG_CONFIGURATION_INVALID'

export class CreatureConceptGenerationError extends Error {
    readonly code: CreatureConceptGenerationErrorCode

    constructor(code: CreatureConceptGenerationErrorCode, message: string, options?: { cause?: unknown }) {
        super(message, options)
        this.name = 'CreatureConceptGenerationError'
        this.code = code
    }
}
