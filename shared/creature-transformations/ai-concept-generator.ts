import type { CreatureTransformationConcept } from './concepts.ts'
import {
    type ConceptGeneratorMetadata,
    type CreatureConceptGenerationInput,
    type CreatureConceptGenerator,
    CreatureConceptGenerationError,
    type StructuredConceptModel,
} from './concept-generator.ts'
import { validateCreatureTransformationConcept } from './concept-validation.ts'
import { VISUAL_TRAIT_BY_ID } from './visual-traits.ts'

export type AiCreatureConceptGeneratorOptions = Readonly<{
    generatorName?: string
    modelName?: string
}>

export class AiCreatureConceptGenerator implements CreatureConceptGenerator {
    readonly metadata: ConceptGeneratorMetadata
    private readonly model: StructuredConceptModel

    constructor(
        model: StructuredConceptModel,
        options: AiCreatureConceptGeneratorOptions = {},
    ) {
        this.model = model
        this.metadata = Object.freeze({
            generator: options.generatorName ?? 'ai-creature-concept-generator',
            ...(options.modelName ? { model: options.modelName } : {}),
            isMock: false,
        })
    }

    async generateConcept(input: CreatureConceptGenerationInput): Promise<CreatureTransformationConcept> {
        const controlledTrait = VISUAL_TRAIT_BY_ID[input.visualTrait.id]
        if (controlledTrait !== input.visualTrait) {
            throw new CreatureConceptGenerationError(
                'CATALOG_CONFIGURATION_INVALID',
                'Il Visual Trait del generatore deve provenire dal catalogo controllato.',
            )
        }

        let candidate: unknown
        try {
            candidate = await this.model.generateStructuredConcept({
                task: 'CREATE_CREATURE_TRANSFORMATION_CONCEPT',
                identity: input.identity,
                visualTrait: controlledTrait,
                intensity: input.intensity,
                previousTransformations: input.previousTransformations,
                seed: input.seed,
                correctionFeedback: input.correctionFeedback ?? [],
            })
        } catch (error) {
            if (error instanceof CreatureConceptGenerationError) throw error
            throw new CreatureConceptGenerationError(
                'GENERATOR_DEPENDENCY_FAILED',
                'Il modello strutturato non ha restituito una risposta utilizzabile.',
                { cause: error },
            )
        }

        const validation = validateCreatureTransformationConcept(candidate, {
            requestedVisualTrait: controlledTrait,
            requestedIntensity: input.intensity,
            identity: input.identity,
            previousTransformations: input.previousTransformations,
        })
        if (!validation.valid) {
            throw new CreatureConceptGenerationError(
                'UNINTERPRETABLE_RESPONSE',
                'Il modello ha restituito un concept non valido.',
                { cause: validation.problems },
            )
        }
        return validation.concept
    }
}
