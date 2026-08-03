import { describe, expect, it } from 'vitest'

import type { CreatureTransformationConcept } from './concepts.ts'
import { evaluateCreatureTransformationConcept } from './concept-evaluation.ts'
import { createValidConcept, TEST_CREATURE_IDENTITY } from './concept-test-fixtures.ts'

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
})
