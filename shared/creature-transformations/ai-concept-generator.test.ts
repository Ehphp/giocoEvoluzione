import { describe, expect, it, vi } from 'vitest'

import { AiCreatureConceptGenerator } from './ai-concept-generator.ts'
import { CreatureConceptGenerationError, type StructuredConceptModel } from './concept-generator.ts'
import { createValidConcept, TEST_CREATURE_IDENTITY } from './concept-test-fixtures.ts'
import { VISUAL_TRAIT_BY_ID } from './visual-traits.ts'

const input = {
    identity: TEST_CREATURE_IDENTITY,
    visualTrait: VISUAL_TRAIT_BY_ID.IMPACT_ADAPTATION,
    intensity: 2 as const,
    seed: 'structured-seed',
    correctionFeedback: ['INVALID_INTENSITY: ripristina il valore richiesto'],
}

describe('AiCreatureConceptGenerator', () => {
    it('adapts a provider-independent structured model and validates its output', async () => {
        const model: StructuredConceptModel = {
            generateStructuredConcept: vi.fn(async () => createValidConcept()),
        }
        const generator = new AiCreatureConceptGenerator(model, { generatorName: 'structured-adapter', modelName: 'test-model' })

        await expect(generator.generateConcept(input)).resolves.toEqual(createValidConcept())
        expect(model.generateStructuredConcept).toHaveBeenCalledWith(expect.objectContaining({
            task: 'CREATE_CREATURE_TRANSFORMATION_CONCEPT',
            seed: 'structured-seed',
            correctionFeedback: input.correctionFeedback,
            visualTrait: VISUAL_TRAIT_BY_ID.IMPACT_ADAPTATION,
        }))
        expect(generator.metadata).toEqual({ generator: 'structured-adapter', model: 'test-model', isMock: false })
    })

    it('reports an uninterpretable structured response as a domain error', async () => {
        const generator = new AiCreatureConceptGenerator({
            async generateStructuredConcept() {
                return { schemaVersion: 1 }
            },
        })

        await expect(generator.generateConcept(input)).rejects.toMatchObject({
            code: 'UNINTERPRETABLE_RESPONSE',
        } satisfies Partial<CreatureConceptGenerationError>)
    })

    it('wraps provider dependency failures without assuming a provider SDK', async () => {
        const dependencyFailure = new Error('offline')
        const generator = new AiCreatureConceptGenerator({
            async generateStructuredConcept() {
                throw dependencyFailure
            },
        })

        await expect(generator.generateConcept(input)).rejects.toMatchObject({
            code: 'GENERATOR_DEPENDENCY_FAILED',
            cause: dependencyFailure,
        } satisfies Partial<CreatureConceptGenerationError>)
    })
})
