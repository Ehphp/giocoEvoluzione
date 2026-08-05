import { describe, expect, it } from 'vitest'

import type { CreatureTransformationConcept } from './concepts.ts'
import {
    type CreatureConceptGenerationInput,
    type CreatureConceptGenerator,
    CreatureConceptGenerationError,
} from './concept-generator.ts'
import { createValidConcept, TEST_CREATURE_IDENTITY } from './concept-test-fixtures.ts'
import { generateValidatedCreatureConcept } from './generate-validated-concept.ts'
import { MockCreatureConceptGenerator } from './mock-concept-generator.ts'
import { AiCreatureConceptGenerator } from './ai-concept-generator.ts'
import { VISUAL_TRAIT_BY_ID } from './visual-traits.ts'

const input = {
    identity: TEST_CREATURE_IDENTITY,
    visualTrait: VISUAL_TRAIT_BY_ID.IMPACT_ADAPTATION,
    intensity: 2 as const,
    seed: 'orchestration',
}

function createSequenceGenerator(outputs: CreatureTransformationConcept[]) {
    const calls: CreatureConceptGenerationInput[] = []
    const generator: CreatureConceptGenerator = {
        metadata: { generator: 'sequence-generator', isMock: false },
        async generateConcept(request) {
            calls.push(request)
            return outputs[Math.min(calls.length - 1, outputs.length - 1)]
        },
    }
    return { generator, calls }
}

describe('generateValidatedCreatureConcept', () => {
    it('returns the first valid and balanced concept with generator metadata', async () => {
        const result = await generateValidatedCreatureConcept({
            generator: new MockCreatureConceptGenerator(),
            input,
        })

        expect(result).toMatchObject({ success: true, attempts: 1, metadata: { isMock: true, attempt: 1 } })
    })

    it('retries once with structural feedback and accepts the corrected result', async () => {
        const invalid = { ...createValidConcept(), intensity: 1 } as unknown as CreatureTransformationConcept
        const { generator, calls } = createSequenceGenerator([invalid, createValidConcept()])

        const result = await generateValidatedCreatureConcept({ generator, input })

        expect(result).toMatchObject({ success: true, attempts: 2, metadata: { attempt: 2 } })
        expect(calls).toHaveLength(2)
        expect(calls[1].correctionFeedback?.join(' ')).toContain('INVALID_INTENSITY')
    })

    it('retries a malformed AI structured response instead of treating it as a provider outage', async () => {
        let calls = 0
        const generator = new AiCreatureConceptGenerator({
            async generateStructuredConcept() {
                calls += 1
                return calls === 1 ? { schemaVersion: 1 } : createValidConcept()
            },
        })

        const result = await generateValidatedCreatureConcept({ generator, input })

        expect(result).toMatchObject({ success: true, attempts: 2 })
    })

    it('returns a normal failed result after both attempts and never selects a fallback generator', async () => {
        const invalid = { ...createValidConcept(), intensity: 1 } as unknown as CreatureTransformationConcept
        const { generator, calls } = createSequenceGenerator([invalid])

        const result = await generateValidatedCreatureConcept({ generator, input })

        expect(result).toMatchObject({ success: false, attempts: 2 })
        expect(calls).toHaveLength(2)
        if (!result.success) expect(result.problems.map((problem) => problem.code)).toContain('INVALID_INTENSITY')
    })

    it('propagates technical generator failures', async () => {
        const failure = new CreatureConceptGenerationError('GENERATOR_UNAVAILABLE', 'Generatore non disponibile')
        const generator: CreatureConceptGenerator = {
            metadata: { generator: 'unavailable-generator', isMock: false },
            async generateConcept() {
                throw failure
            },
        }

        await expect(generateValidatedCreatureConcept({ generator, input })).rejects.toBe(failure)
    })
})

