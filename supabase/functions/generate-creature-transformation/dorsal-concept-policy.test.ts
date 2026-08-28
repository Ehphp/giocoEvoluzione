import { describe, expect, it } from 'vitest'

import type { EvolutionTargetId } from '../../../shared/creature-transformations/evolution-targets.ts'
import { BODY_PLANS } from '../../../shared/creature-transformations/flux-evolution/body-plan-registry.ts'
import { buildFluxEvolutionPlan } from '../../../shared/creature-transformations/flux-evolution/evolution-plan.ts'
import { composeLockedDynamicFluxEvolutionPrompt } from '../../../shared/creature-transformations/flux-evolution/flux-prompt-composer.ts'
import type { FluxMicroConcept } from '../../../shared/creature-transformations/flux-evolution/micro-concept.ts'
import { validateFluxMicroConceptTargetSemantics } from './dorsal-concept-policy.ts'
import { TEST_CREATURE_IDENTITY } from './test-creature-fixtures.ts'

function normalPlanFor(evolutionTargetId: EvolutionTargetId) {
    const bodyPlan = Object.values(BODY_PLANS).find((candidate) => candidate.evolutionTargets.includes(evolutionTargetId))
    if (!bodyPlan) throw new Error(`Nessun body-plan offre ${evolutionTargetId}.`)
    return buildFluxEvolutionPlan({
        bodyPlan,
        evolutionTargetId,
        previousTransformations: [],
        seed: `dorsal-concept-policy-${evolutionTargetId}`,
    })
}

function concept(conceptName: string, mutationIdea: string, visualDetails: readonly string[] = ['cheratina dorsale']) {
    return { conceptName, mutationIdea, visualDetails, avoid: [] } satisfies FluxMicroConcept
}

const DORSAL_PLAN = normalPlanFor('DORSAL_STRUCTURES')

describe('dorsal concept policy', () => {
    it('accepts four local, biologically rooted DORSAL_STRUCTURES concepts', () => {
        const validConcepts = [
            concept(
                'Osteodermi a scudo',
                'Osteodermi compatti emergono lungo la schiena subito dietro la nuca, seguendo una breve fascia della colonna.',
                ['placche ossee sovrapposte', 'radici continue nel dorso'],
            ),
            concept(
                'Cresta spinosa corta',
                'Una breve cresta di spine cheratinose nasce sul dorso tra le scapole e si interrompe prima delle anche.',
                ['spine corte rivolte all indietro'],
            ),
            concept(
                'Noduli dorsali',
                'Piccoli noduli ossei si raggruppano sopra la colonna nella metà centrale del tronco.',
                ['gruppo locale di noduli mineralizzati'],
            ),
            concept(
                'Gobba corazzata',
                'Una gobba muscolare corazzata si forma sul dorso posteriore, con una bassa linea di placche di cheratina.',
                ['massa dorsale contenuta', 'placche locali opache'],
            ),
        ]

        for (const validConcept of validConcepts)
            expect(validateFluxMicroConceptTargetSemantics(validConcept, DORSAL_PLAN)).toEqual({
                valid: true,
                violations: [],
            })
    })

    it('rejects eight DORSAL_STRUCTURES concepts outside the locality, morphology, scale or presentation boundary', () => {
        const rejectedConcepts: ReadonlyArray<readonly [FluxMicroConcept, string]> = [
            [
                concept(
                    'Corona continua',
                    'Una cresta continua parte dalla corona, attraversa il collo e corre fino alla coda.',
                ),
                'DORSAL_CRANIAL_OR_NECK_EXTENSION',
            ],
            [
                concept('Spine craniche', 'Le spine nascono sul cranio e si estendono lungo la schiena.'),
                'DORSAL_CRANIAL_OR_NECK_EXTENSION',
            ],
            [
                concept('Ali dorsali', 'Due ali emergono dal dorso come appendici indipendenti.'),
                'DORSAL_FORBIDDEN_MORPHOLOGY',
            ],
            [concept('Vela dorsale', 'Una vela dorsale rigida si alza lungo tutta la colonna.'), 'DORSAL_FORBIDDEN_MORPHOLOGY'],
            [
                concept('Membrana a ventaglio', 'Un ampia membrana traslucida si apre a ventaglio sopra il dorso.'),
                'DORSAL_FORBIDDEN_MORPHOLOGY',
            ],
            [concept('Pinne ittiche', 'Pinne dorsali fish-like rendono il profilo acquatico.'), 'DORSAL_FORBIDDEN_MORPHOLOGY'],
            [
                concept('Spine colossali', 'Spine dorsali lunghe 1.5x il corpo dominano l intera creatura.'),
                'DORSAL_EXCESSIVE_SCALE',
            ],
            [
                concept('Dorso equilibratore', 'La postura viene riequilibrata per sostenere le nuove placche dorsali.'),
                'DORSAL_PRESENTATION_LEAK',
            ],
        ]

        for (const [rejectedConcept, expectedViolation] of rejectedConcepts) {
            const validation = validateFluxMicroConceptTargetSemantics(rejectedConcept, DORSAL_PLAN)

            expect(validation.valid, rejectedConcept.conceptName).toBe(false)
            expect(validation.violations, rejectedConcept.conceptName).toContain(expectedViolation)
        }
    })

    it('leaves HEAD_AND_CROWN antlers, sensory frills and crown crests valid', () => {
        const headPlan = normalPlanFor('HEAD_AND_CROWN')
        const headConcepts = [
            concept('Palchi ramificati', 'Palchi ossei emergono dal cranio e incorniciano la testa.'),
            concept('Frangia sensoriale', 'Una frangia sensoriale cresce intorno al cranio sopra gli occhi.'),
            concept('Cresta della corona', 'Una cresta corta e minerale si alza dalla corona della testa.'),
        ]

        for (const headConcept of headConcepts)
            expect(validateFluxMicroConceptTargetSemantics(headConcept, headPlan)).toEqual({
                valid: true,
                violations: [],
            })
    })

    it('keeps a valid DORSAL_STRUCTURES concept unchanged in the final Seedream prompt', () => {
        const validConcept = concept(
            'Ridge di osteodermi',
            'Una ridge di osteodermi compatti cresce lungo il dorso centrale, con radici ossee tra le vertebre.',
            ['placche corte sovrapposte', 'bordo di cheratina opaca'],
        )
        const prompt = composeLockedDynamicFluxEvolutionPrompt({
            identity: TEST_CREATURE_IDENTITY,
            anatomyContract: DORSAL_PLAN.anatomyContract,
            microConcept: validConcept,
        })

        expect(validateFluxMicroConceptTargetSemantics(validConcept, DORSAL_PLAN).valid).toBe(true)
        expect(prompt).toContain(validConcept.conceptName)
        expect(prompt).toContain(validConcept.mutationIdea)
        expect(prompt).toContain(validConcept.visualDetails[0]!)
    })
})
