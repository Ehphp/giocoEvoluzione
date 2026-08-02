import { describe, expect, it } from 'vitest'

import { validateCreatureTransformationConcept } from './concept-validation.ts'
import { createValidConcept, TEST_CREATURE_IDENTITY } from './concept-test-fixtures.ts'
import { VISUAL_TRAIT_BY_ID } from './visual-traits.ts'

const context = {
    requestedVisualTrait: VISUAL_TRAIT_BY_ID.IMPACT_ADAPTATION,
    requestedIntensity: 2 as const,
    identity: TEST_CREATURE_IDENTITY,
}

function getProblemCodes(candidate: unknown): string[] {
    const result = validateCreatureTransformationConcept(candidate, context)
    return result.valid ? [] : result.problems.map((problem) => problem.code)
}

describe('validateCreatureTransformationConcept', () => {
    it('accepts a complete concept that matches its requested context', () => {
        const result = validateCreatureTransformationConcept(createValidConcept(), context)

        expect(result.valid).toBe(true)
        if (result.valid) expect(result.concept).toEqual(createValidConcept())
    })

    it('rejects malformed objects and unknown fields', () => {
        expect(getProblemCodes(null)).toContain('INVALID_CONCEPT')
        expect(getProblemCodes({ schemaVersion: 1, unexpected: true })).toContain('UNKNOWN_FIELD')
        expect(getProblemCodes({})).toContain('MISSING_REQUIRED_FIELD')
    })

    it('rejects a trait or intensity different from the request', () => {
        expect(getProblemCodes({ ...createValidConcept(), visualTrait: 'LOCOMOTION_ADAPTATION' })).toContain('INVALID_VISUAL_TRAIT')
        expect(getProblemCodes({ ...createValidConcept(), intensity: 3 })).toContain('INVALID_INTENSITY')
    })

    it('enforces the mutation and body-area catalogues plus their creative limits', () => {
        expect(getProblemCodes({
            ...createValidConcept(),
            primaryMutation: { ...createValidConcept().primaryMutation, mutationArchetype: 'SPRING_TENDONS' },
        })).toContain('INVALID_MUTATION_ARCHETYPE')
        expect(getProblemCodes({
            ...createValidConcept(),
            primaryMutation: { ...createValidConcept().primaryMutation, bodyAreas: ['HIND_LIMBS'] },
        })).toContain('BODY_AREA_NOT_ALLOWED')
        expect(getProblemCodes({
            ...createValidConcept(),
            primaryMutation: { ...createValidConcept().primaryMutation, bodyAreas: ['BACK', 'CHEST', 'FORELIMBS'] },
        })).toContain('TOO_MANY_BODY_AREAS')
        expect(getProblemCodes({
            ...createValidConcept(),
            secondaryMutations: ['Uno', 'Due', 'Tre', 'Quattro'],
        })).toContain('TOO_MANY_SECONDARY_MUTATIONS')
    })

    it('requires identity features and rejects technical or contradictory instructions', () => {
        expect(getProblemCodes({ ...createValidConcept(), identityToPreserve: ['palette turchese'] })).toContain('MISSING_IDENTITY_PRESERVATION')
        expect(getProblemCodes({
            ...createValidConcept(),
            primaryMutation: { ...createValidConcept().primaryMutation, morphology: 'Componi un canvas 1024 con cuscinetti.' },
        })).toContain('FORBIDDEN_TECHNICAL_INSTRUCTION')
        expect(getProblemCodes({
            ...createValidConcept(),
            evolutionaryFunction: 'Propone una nuova specie completamente diversa.',
        })).toContain('CONTRADICTORY_INSTRUCTIONS')
    })
})

