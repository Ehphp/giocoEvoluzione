import { describe, expect, it } from 'vitest'

import type { PreviousCreatureTransformationSummary } from '../creature-visual-versions.ts'
import { buildAnatomyContract } from './anatomy-contract.ts'
import { BODY_PLANS, resolveCanonicalBodyPlan } from './body-plan-registry.ts'
import { buildEvolutionLineageContext, describeCurrentTargetState, recentTargetMutationReferences } from './evolution-lineage.ts'
import { buildFluxEvolutionPlan } from './evolution-plan.ts'
import { composeFluxEvolutionPrompt } from './flux-prompt-composer.ts'

const IDENTITY = {
    creatureId: 'creature-1', baseCreatureKey: 'VERDANT_HATCHLING',
    description: 'Piccolo drago verde con grandi occhi ambrati.',
    identityFeatures: ['grandi occhi ambrati', 'cresta dorsale di spine fogliari'],
    mutableVisualFeatures: ['corpo verde'], styleDefinition: 'Illustrazione 3D stilizzata.',
}

function evolution(versionNumber: number, evolutionTargetId: PreviousCreatureTransformationSummary['evolutionTargetId'], conceptName: string, mutationIdea: string): PreviousCreatureTransformationSummary {
    return { versionNumber, visualTraitId: 'LOCOMOTION_ADAPTATION', evolutionTargetId, conceptName, mutationIdea }
}

function promptFor(lineage: ReturnType<typeof buildEvolutionLineageContext>, anatomyContract = buildAnatomyContract({ bodyPlan: BODY_PLANS.QUADRUPED, evolutionTargetId: 'TAIL' })) {
    return composeFluxEvolutionPrompt({
        identity: IDENTITY,
        anatomyContract,
        microConcept: { conceptName: 'Coda a frusta', mutationIdea: 'La coda sviluppa vertebre elastiche schermate.', visualDetails: ['anelli di cheratina'] },
        lineage,
    })
}

describe('minimal Flux lineage', () => {
    it('keeps only the latest semantic state of the exact target', () => {
        const context = buildEvolutionLineageContext({
            evolutionTargetId: 'TAIL',
            previousTransformations: [
                evolution(1, 'TAIL', 'Coda vela', 'pinna larga'),
                evolution(2, 'WINGS', 'Vele nervate', 'membrane alari'),
                evolution(3, 'TAIL', 'Timone foglia', 'lobi fogliari'),
                evolution(4, 'SKIN_AND_COVERING', 'Pelle abissale', 'venature luminose'),
            ],
        })

        expect(context.currentTargetState?.conceptName).toBe('Timone foglia')
        expect(describeCurrentTargetState(context)).toContain('minimal semantic continuity')
        expect(describeCurrentTargetState(context)).toContain('source image remains the complete visual state')
        expect(describeCurrentTargetState(context)).toContain('new, substantial, independently readable morphological mutation')
        expect(describeCurrentTargetState(context)).toContain('do not merely enlarge, decorate, refine or recolour it')
        expect(describeCurrentTargetState(context)).not.toContain('Coda vela')
        expect(describeCurrentTargetState(context)).not.toContain('Vele nervate')
    })

    it('starts a new target from the visual state already present in the source image', () => {
        const context = buildEvolutionLineageContext({ evolutionTargetId: 'HEAD_AND_CROWN', previousTransformations: [evolution(1, 'TAIL', 'Timone foglia', 'lobi fogliari')] })

        expect(context.currentTargetState).toBeNull()
        expect(describeCurrentTargetState(context)).toMatch(/source image/i)
    })

    it('G1 to G10 does not grow preservation context with visual history', () => {
        const g1 = [evolution(1, 'TAIL', 'Coda mutazione g01', 'cresta elastica')]
        const g10 = Array.from({ length: 10 }, (_, index) => evolution(index + 1, 'TAIL', `Coda mutazione g${String(index + 1).padStart(2, '0')}`, `forma locale g${String(index + 1).padStart(2, '0')}`))
        const firstPrompt = promptFor(buildEvolutionLineageContext({ evolutionTargetId: 'TAIL', previousTransformations: g1 }))
        const tenthPrompt = promptFor(buildEvolutionLineageContext({ evolutionTargetId: 'TAIL', previousTransformations: g10 }))

        expect(tenthPrompt).toContain('Coda mutazione g10')
        expect(tenthPrompt).not.toContain('Coda mutazione g01')
        expect(tenthPrompt).not.toContain('OTHER ESTABLISHED EVOLUTIONS')
        expect(tenthPrompt).not.toContain('LEGACY EVOLUTIONS WITH UNKNOWN TARGET')
        expect(tenthPrompt.length - firstPrompt.length).toBeLessThan(120)
        expect(recentTargetMutationReferences({ evolutionTargetId: 'TAIL', previousTransformations: g10 })).toHaveLength(3)
    })

    it('retains permanent topology even while textual lineage stays minimal', () => {
        const history: PreviousCreatureTransformationSummary[] = [
            { ...evolution(1, 'LIMBS_AND_FEET', 'Arti mediani', 'un paio di arti mediani'), bodyPlanMutationId: 'ADD_LIMB_PAIR' },
            ...Array.from({ length: 9 }, (_, index) => evolution(index + 2, 'TAIL', `Coda ${index + 2}`, `variazione locale ${index + 2}`)),
        ]
        const canonical = resolveCanonicalBodyPlan({ baseCreatureKey: 'VERDANT_HATCHLING', adoptedBodyPlanMutationIds: ['ADD_LIMB_PAIR'] })!
        const plan = buildFluxEvolutionPlan({ bodyPlan: canonical, evolutionTargetId: 'TAIL', previousTransformations: history })
        const prompt = promptFor(plan.lineage, plan.anatomyContract)

        expect(plan.lineage.currentTargetState?.conceptName).toBe('Coda 10')
        expect(plan.anatomyContract.topologyInvariants.join(' ')).toContain('Keep exactly 6 limbs, in 3 symmetrical pairs')
        expect(prompt).toContain('Keep exactly 6 limbs, in 3 symmetrical pairs')
    })
})
