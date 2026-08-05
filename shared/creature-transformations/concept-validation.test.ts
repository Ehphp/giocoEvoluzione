import { describe, expect, it } from 'vitest'

import { validateCreatureTransformationConcept } from './concept-validation.ts'
import { createValidConcept, TEST_CREATURE_IDENTITY } from './concept-test-fixtures.ts'
import { VISUAL_TRAIT_BY_ID } from './visual-traits.ts'
import { EVOLUTION_TARGET_BY_ID } from './evolution-targets.ts'

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
    it('accepts a complete legacy concept and defaults its absent colour evolution to conservative behaviour', () => {
        const result = validateCreatureTransformationConcept(createValidConcept(), context)

        expect(result.valid).toBe(true)
        if (result.valid) expect(result.concept).toEqual(createValidConcept())
    })

    it('accepts an intentional, biologically motivated palette shift and rejects weak or incoherent requests', () => {
        const shift = {
            ...createValidConcept(),
            colorEvolution: {
                mode: 'SHIFT',
                dominantColor: 'ocean blue',
                secondaryColors: ['sea green'],
                accentColors: ['silver'],
                surfaceEffects: ['iridescent hydrodynamic gradients'],
                affectedBodyAreas: ['BACK', 'SKIN_SURFACE'],
                intensity: 2,
                biologicalRationale: 'Pigmenti nelle scaglie rinforzate migliorano mimetismo e dispersione del calore dagli urti.',
            },
        }
        expect(validateCreatureTransformationConcept(shift, context).valid).toBe(true)
        expect(getProblemCodes({ ...shift, colorEvolution: { ...shift.colorEvolution, affectedBodyAreas: ['EYE_REGION'] } })).toContain('INVALID_COLOR_EVOLUTION')
        expect(getProblemCodes({ ...shift, colorEvolution: { ...shift.colorEvolution, intensity: 1 } })).toContain('COLOR_EVOLUTION_INCOHERENT')
    })

    it('accepts legacy structural preservation text that included the previous body colour', () => {
        const legacyContext = {
            ...context,
            identity: { ...TEST_CREATURE_IDENTITY, identityFeatures: ['volto a mezzaluna', 'corpo squamoso e tozzo', 'cresta dorsale'] },
        }
        const legacyConcept = {
            ...createValidConcept(),
            identityToPreserve: ['volto a mezzaluna', 'corpo verde squamoso e tozzo', 'cresta dorsale'],
        }

        expect(validateCreatureTransformationConcept(legacyConcept, legacyContext).valid).toBe(true)
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

    it('enforces the selected anatomical target, one primary area and one compatible supporting area', () => {
        const targetContext = {
            ...context,
            requestedVisualTrait: VISUAL_TRAIT_BY_ID.LOCOMOTION_ADAPTATION,
            requestedEvolutionTarget: EVOLUTION_TARGET_BY_ID.TAIL,
            requestedEvolutionFunction: 'BALANCE' as const,
        }
        const targetConcept = {
            ...createValidConcept(), schemaVersion: 2, visualTrait: 'LOCOMOTION_ADAPTATION', evolutionTargetId: 'TAIL', evolutionFunction: 'BALANCE',
            primaryMutation: { ...createValidConcept().primaryMutation, mutationArchetype: 'BALANCE_TAIL', bodyAreas: ['TAIL'], supportingBodyAreas: ['BACK'] },
        }

        expect(validateCreatureTransformationConcept(targetConcept, targetContext).valid).toBe(true)
        expect(validateCreatureTransformationConcept({ ...targetConcept, primaryMutation: { ...targetConcept.primaryMutation, bodyAreas: ['TAIL', 'BACK'] } }, targetContext)).toMatchObject({ valid: false, problems: expect.arrayContaining([expect.objectContaining({ code: 'TOO_MANY_BODY_AREAS' })]) })
        expect(validateCreatureTransformationConcept({ ...targetConcept, primaryMutation: { ...targetConcept.primaryMutation, supportingBodyAreas: ['BACK', 'SKIN_SURFACE'] } }, targetContext)).toMatchObject({ valid: false, problems: expect.arrayContaining([expect.objectContaining({ code: 'TOO_MANY_SUPPORTING_BODY_AREAS' })]) })
        expect(validateCreatureTransformationConcept({ ...targetConcept, visualTrait: 'SENSORY_EXPANSION' }, targetContext)).toMatchObject({ valid: false, problems: expect.arrayContaining([expect.objectContaining({ code: 'INVALID_VISUAL_TRAIT' })]) })
    })

    it('rejects an already adopted target, function and archetype combination', () => {
        const targetContext = {
            ...context,
            requestedVisualTrait: VISUAL_TRAIT_BY_ID.LOCOMOTION_ADAPTATION,
            requestedEvolutionTarget: EVOLUTION_TARGET_BY_ID.TAIL,
            requestedEvolutionFunction: 'BALANCE' as const,
            previousTransformations: [{
                versionNumber: 2, conceptName: 'Coda stabilizzatrice', visualTraitId: 'LOCOMOTION_ADAPTATION' as const,
                evolutionTargetId: 'TAIL' as const, evolutionFunction: 'BALANCE' as const, mutationArchetype: 'BALANCE_TAIL' as const,
            }],
        }
        const repeated = {
            ...createValidConcept(), schemaVersion: 2, visualTrait: 'LOCOMOTION_ADAPTATION', evolutionTargetId: 'TAIL', evolutionFunction: 'BALANCE',
            primaryMutation: { ...createValidConcept().primaryMutation, mutationArchetype: 'BALANCE_TAIL', bodyAreas: ['TAIL'] },
        }

        expect(validateCreatureTransformationConcept(repeated, targetContext)).toMatchObject({ valid: false, problems: expect.arrayContaining([expect.objectContaining({ code: 'REPEATED_EVOLUTION_DIRECTION' })]) })
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
