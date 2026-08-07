import { describe, expect, it } from 'vitest'

import type { CreatureTransformationConcept } from './concepts.ts'
import { evaluateCreatureTransformationConcept } from './concept-evaluation.ts'
import { validateCreatureTransformationConcept } from './concept-validation.ts'
import { createValidConcept, TEST_CREATURE_IDENTITY } from './concept-test-fixtures.ts'
import { EVOLUTION_TARGET_BY_ID } from './evolution-targets.ts'
import { VISUAL_TRAIT_BY_ID } from './visual-traits.ts'

const evaluationContext = { identity: TEST_CREATURE_IDENTITY }

describe('evaluateCreatureTransformationConcept', () => {
    it('accepts a balanced concept with low identity risk', () => {
        const evaluation = evaluateCreatureTransformationConcept({ ...createValidConcept(), intensity: 1, secondaryMutations: [] }, evaluationContext)

        expect(evaluation).toMatchObject({ acceptable: true, identityRisk: 'LOW', transformationStrength: 'BALANCED', problems: [] })
    })

    it('marks a focused eye-region mutation as medium risk without rejecting it automatically', () => {
        const concept: CreatureTransformationConcept = {
            ...createValidConcept(),
            visualTrait: 'SENSORY_EXPANSION' as const,
            primaryMutation: {
                mutationArchetype: 'FOCUSED_OCELLI' as const,
                bodyAreas: ['EYE_REGION'],
                morphology: 'Piccoli ocelli laterali incorniciano gli occhi senza cambiare lo sguardo originario.',
                material: 'Superficie madreperlacea con contorni delicati.',
            },
            intensity: 1 as const,
            secondaryMutations: [],
        }

        const evaluation = evaluateCreatureTransformationConcept(concept, evaluationContext)

        expect(evaluation).toMatchObject({ acceptable: true, identityRisk: 'MEDIUM', transformationStrength: 'BALANCED' })
    })

    it('detects weak and excessive transformations with explainable heuristics', () => {
        const weak = evaluateCreatureTransformationConcept({
            ...createValidConcept(),
            primaryMutation: { ...createValidConcept().primaryMutation, morphology: 'Bordo lieve' },
        }, evaluationContext)
        const excessive = evaluateCreatureTransformationConcept({
            ...createValidConcept(),
            primaryMutation: { ...createValidConcept().primaryMutation, bodyAreas: ['BACK', 'CHEST'] },
            secondaryMutations: ['Uno', 'Due', 'Tre'],
            intensity: 3,
        }, evaluationContext)

        expect(weak).toMatchObject({ acceptable: false, transformationStrength: 'WEAK' })
        expect(weak.problems.map((problem) => problem.code)).toContain('TRANSFORMATION_TOO_WEAK')
        expect(excessive).toMatchObject({ acceptable: false, transformationStrength: 'EXCESSIVE' })
        expect(excessive.problems.map((problem) => problem.code)).toContain('TRANSFORMATION_EXCESSIVE')
    })

    it('raises high risk for an invasive head and eye-region combination', () => {
        const concept: CreatureTransformationConcept = {
            ...createValidConcept(),
            visualTrait: 'SENSORY_EXPANSION' as const,
            primaryMutation: {
                mutationArchetype: 'FOCUSED_OCELLI' as const,
                bodyAreas: ['HEAD_SURFACE', 'EYE_REGION'],
                morphology: 'Occhi secondari e frange sottili si integrano senza sostituire il volto riconoscibile.',
                material: 'Membrana naturale con tonalita coerenti.',
            },
            secondaryMutations: ['Frange corte', 'Anelli attenuati'],
            intensity: 3 as const,
        }

        const evaluation = evaluateCreatureTransformationConcept(concept, evaluationContext)

        expect(evaluation).toMatchObject({ acceptable: false, identityRisk: 'HIGH' })
        expect(evaluation.problems.map((problem) => problem.code)).toContain('IDENTITY_RISK_HIGH')
    })

    it('evaluates visible colour evolution separately from immutable facial identity', () => {
        const concept: CreatureTransformationConcept = {
            ...createValidConcept(),
            colorEvolution: {
                mode: 'SHIFT', dominantColor: 'ocean blue', secondaryColors: ['sea green'], accentColors: ['silver'],
                surfaceEffects: ['iridescent scale gradients'], affectedBodyAreas: ['BACK', 'SKIN_SURFACE'], intensity: 2,
                biologicalRationale: 'Scaglie rinforzate rifrangono la luce per mimetismo e gestione del calore da impatto.',
            },
        }

        expect(evaluateCreatureTransformationConcept(concept, evaluationContext)).toMatchObject({ acceptable: true, identityRisk: 'LOW' })
        const colorEvolution = concept.colorEvolution!
        expect(evaluateCreatureTransformationConcept({ ...concept, colorEvolution: { ...colorEvolution, affectedBodyAreas: [] } }, evaluationContext).problems.map((problem) => problem.code)).toContain('COLOR_EVOLUTION_TOO_WEAK')
    })

    it('uses the same target colour constraints as validation', () => {
        const target = EVOLUTION_TARGET_BY_ID.TORSO_AND_BACK
        const concept: CreatureTransformationConcept = {
            ...createValidConcept(), schemaVersion: 2, visualTrait: 'IMPACT_ADAPTATION', evolutionTargetId: target.id, evolutionFunction: 'DEFENSE',
            primaryMutation: { ...createValidConcept().primaryMutation, bodyAreas: ['BACK'], supportingBodyAreas: ['SKIN_SURFACE'] },
            colorEvolution: {
                mode: 'SHIFT', dominantColor: 'deep moss green', secondaryColors: ['forest jade'], accentColors: ['warm amber'],
                surfaceEffects: ['impact-responsive amber veining'], affectedBodyAreas: ['BACK', 'SKIN_SURFACE'], intensity: 2,
                biologicalRationale: 'Le placche del dorso rendono visibili i percorsi di dissipazione degli urti.',
            },
        }
        const validationContext = {
            requestedVisualTrait: VISUAL_TRAIT_BY_ID.IMPACT_ADAPTATION, requestedEvolutionTarget: target,
            requestedEvolutionFunction: 'DEFENSE' as const, requestedIntensity: 2 as const, identity: TEST_CREATURE_IDENTITY,
        }

        expect(validateCreatureTransformationConcept(concept, validationContext).valid).toBe(true)
        expect(evaluateCreatureTransformationConcept(concept, evaluationContext).problems).toEqual([])

        const weak = { ...concept, colorEvolution: { ...concept.colorEvolution!, affectedBodyAreas: [] } }
        expect(validateCreatureTransformationConcept(weak, validationContext)).toMatchObject({ valid: false, problems: expect.arrayContaining([expect.objectContaining({ code: 'COLOR_EVOLUTION_TOO_WEAK' })]) })
        expect(evaluateCreatureTransformationConcept(weak, evaluationContext).problems).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'COLOR_EVOLUTION_TOO_WEAK' })]))

        const missing = { ...concept, colorEvolution: undefined }
        expect(validateCreatureTransformationConcept(missing, validationContext)).toMatchObject({ valid: false, problems: expect.arrayContaining([expect.objectContaining({ code: 'MISSING_REQUIRED_FIELD' })]) })
        expect(evaluateCreatureTransformationConcept(missing, evaluationContext).problems).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'COLOR_EVOLUTION_INCOHERENT' })]))
    })
})
