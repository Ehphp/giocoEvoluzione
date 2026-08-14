import { describe, expect, it } from 'vitest'

import type { PreviousCreatureTransformationSummary } from '../creature-visual-versions.ts'
import { buildAnatomyContract } from './anatomy-contract.ts'
import { BODY_PLANS } from './body-plan-registry.ts'
import { buildEvolutionLineageContext, describeCurrentTargetState, describeOtherEstablishedEvolutions, describeUnclassifiedLegacyEvolutions } from './evolution-lineage.ts'
import { composeFluxEvolutionPrompt } from './flux-prompt-composer.ts'

const IDENTITY = {
    creatureId: 'creature-1',
    baseCreatureKey: 'VERDANT_HATCHLING',
    description: 'Piccolo drago verde con grandi occhi ambrati.',
    identityFeatures: ['grandi occhi ambrati', 'cresta dorsale di spine fogliari'],
    mutableVisualFeatures: ['corpo verde'],
    styleDefinition: 'Illustrazione 3D stilizzata.',
}

const SKIN_EVOLUTION: PreviousCreatureTransformationSummary = {
    versionNumber: 2, visualTraitId: 'ENERGY_REGULATION', evolutionTargetId: 'SKIN_AND_COVERING',
    conceptName: 'Pelle abissale', mutationIdea: 'pelle scura con venature luminose',
}
const TAIL_EVOLUTION: PreviousCreatureTransformationSummary = {
    versionNumber: 3, visualTraitId: 'LOCOMOTION_ADAPTATION', evolutionTargetId: 'TAIL',
    conceptName: 'Timone foglia', mutationIdea: 'coda larga e appiattita',
}
const EARLIER_TAIL_EVOLUTION: PreviousCreatureTransformationSummary = {
    versionNumber: 1, visualTraitId: 'LOCOMOTION_ADAPTATION', evolutionTargetId: 'TAIL',
    conceptName: 'Coda vela', mutationIdea: 'coda con pinna larga',
}

describe('target-aware lineage', () => {
    it('gives a second evolution of the same target its current state to develop further', () => {
        const context = buildEvolutionLineageContext({ evolutionTargetId: 'SKIN_AND_COVERING', previousTransformations: [SKIN_EVOLUTION, TAIL_EVOLUTION] })

        expect(context.currentTargetState.map((entry) => entry.conceptName)).toEqual(['Pelle abissale'])
        expect(context.otherEstablishedEvolutions.map((entry) => entry.conceptName)).toEqual(['Timone foglia'])
        const description = describeCurrentTargetState(context)
        expect(description).toContain('Pelle abissale')
        expect(description).toContain('pelle scura con venature luminose')
        expect(description).toMatch(/Develop it further/i)
        expect(description).toMatch(/Do not replace it/i)
    })

    it('states that a first evolution of a target starts from the source image', () => {
        const context = buildEvolutionLineageContext({ evolutionTargetId: 'HEAD_AND_CROWN', previousTransformations: [SKIN_EVOLUTION] })

        expect(context.currentTargetState).toHaveLength(0)
        expect(describeCurrentTargetState(context)).toMatch(/no adopted evolution yet/i)
        expect(describeCurrentTargetState(context)).toMatch(/source image/i)
    })

    it('treats evolutions of other targets as established lineage, not as new instructions', () => {
        const context = buildEvolutionLineageContext({ evolutionTargetId: 'HEAD_AND_CROWN', previousTransformations: [SKIN_EVOLUTION, TAIL_EVOLUTION] })
        const description = describeOtherEstablishedEvolutions(context)

        expect(description).toContain('Pelle abissale')
        expect(description).toContain('Timone foglia')
        expect(description).toMatch(/preserve it, do not recreate it, do not develop it and do not reinterpret it as the new mutation/i)
    })

    it('groups the anatomical family, so a limb target continues what wings established', () => {
        const wings: PreviousCreatureTransformationSummary = { versionNumber: 4, visualTraitId: 'LOCOMOTION_ADAPTATION', evolutionTargetId: 'WINGS', conceptName: 'Vele nervate' }
        const context = buildEvolutionLineageContext({ evolutionTargetId: 'LIMBS_AND_FEET', previousTransformations: [wings, SKIN_EVOLUTION] })

        expect(context.currentTargetState.map((entry) => entry.conceptName)).toEqual(['Vele nervate'])
        expect(context.otherEstablishedEvolutions.map((entry) => entry.conceptName)).toEqual(['Pelle abissale'])
    })

    it('keeps every TAIL evolution in target lineage, never in other established evolutions', () => {
        const context = buildEvolutionLineageContext({ evolutionTargetId: 'TAIL', previousTransformations: [SKIN_EVOLUTION, TAIL_EVOLUTION, EARLIER_TAIL_EVOLUTION] })

        expect(context.currentTargetState.map((entry) => entry.conceptName)).toEqual(['Coda vela', 'Timone foglia'])
        expect(context.otherEstablishedEvolutions.map((entry) => entry.conceptName)).toEqual(['Pelle abissale'])
        expect(describeCurrentTargetState(context)).toContain('Coda vela')
        expect(describeCurrentTargetState(context)).toContain('Timone foglia')
        expect(describeOtherEstablishedEvolutions(context)).not.toContain('Timone foglia')
    })

    it('keeps legacy evolutions with no target metadata out of both anatomical lineage sections', () => {
        const legacy: PreviousCreatureTransformationSummary = { versionNumber: 1, visualTraitId: 'IMPACT_ADAPTATION', evolutionTargetId: null, conceptName: 'Forma storica' }
        const context = buildEvolutionLineageContext({ evolutionTargetId: 'TAIL', previousTransformations: [legacy, TAIL_EVOLUTION, SKIN_EVOLUTION] })

        expect(context.currentTargetState.map((entry) => entry.conceptName)).toEqual(['Timone foglia'])
        expect(context.otherEstablishedEvolutions.map((entry) => entry.conceptName)).toEqual(['Pelle abissale'])
        expect(context.unclassifiedLegacyEvolutions.map((entry) => entry.conceptName)).toEqual(['Forma storica'])
        expect(describeUnclassifiedLegacyEvolutions(context)).toMatch(/cannot be classified safely/i)
    })

    it('composes the prompt with the four lineage sections in order', () => {
        const lineage = buildEvolutionLineageContext({ evolutionTargetId: 'SKIN_AND_COVERING', previousTransformations: [SKIN_EVOLUTION, TAIL_EVOLUTION] })
        const prompt = composeFluxEvolutionPrompt({
            identity: IDENTITY,
            anatomyContract: buildAnatomyContract({ bodyPlan: BODY_PLANS.QUADRUPED, evolutionTargetId: 'SKIN_AND_COVERING' }),
            microConcept: { conceptName: 'Corteccia vitrea', mutationIdea: 'La pelle sviluppa placche vitree.', visualDetails: ['placche traslucide'] },
            lineage,
        })

        expect(prompt.indexOf('CURRENT SOURCE IMAGE')).toBeLessThan(prompt.indexOf('CURRENT TARGET STATE'))
        expect(prompt.indexOf('CURRENT TARGET STATE')).toBeLessThan(prompt.indexOf('OTHER ESTABLISHED EVOLUTIONS'))
        expect(prompt.indexOf('OTHER ESTABLISHED EVOLUTIONS')).toBeLessThan(prompt.indexOf('LEGACY EVOLUTIONS WITH UNKNOWN TARGET'))
        expect(prompt.indexOf('LEGACY EVOLUTIONS WITH UNKNOWN TARGET')).toBeLessThan(prompt.indexOf('NEW MUTATION'))
        expect(prompt).toContain('SELECTED TARGET: SKIN_AND_COVERING')
        expect(prompt).toMatch(/primary evolutionary target/i)
        expect(prompt).toMatch(/Default to a local mutation/i)
        expect(prompt).toMatch(/Preserve all unrelated anatomy by default/i)
        expect(prompt).toMatch(/If none is necessary, modify only this target/i)
        expect(prompt).not.toMatch(/secondary adaptations may extend to connected anatomy/i)
        expect(prompt).not.toMatch(/Only this target receives the new mutation/i)
        expect(prompt).toContain('Keep exactly 4 limbs, in 2 symmetrical pairs, at their current attachment points.')
        expect(prompt).toContain('Corteccia vitrea')
        expect(prompt).toContain('grandi occhi ambrati')
        expect(prompt).toMatch(/Flat uniform medium-gray background/)
        expect(prompt).toMatch(/Surface-visible bioluminescent markings or coloration.*are allowed/i)
        expect(prompt).toMatch(/No external glow, aura, halo, bloom, light spill/i)
        expect(prompt).toMatch(/Structures integrated into and anchored to the selected target are allowed/i)
        expect(prompt).toMatch(/independently rooted anatomical appendages/i)
        expect(prompt).toMatch(/minimal reframing or subject-scale adjustment is authorized/i)
        expect(prompt).toContain('FRAMING IS STRICT: show the entire creature')
        expect(prompt).toContain('at least 8-10% clear background margin on every side')
    })

    it('normalizes a vague avoid instruction without forbidding structures anchored to the target', () => {
        const prompt = composeFluxEvolutionPrompt({
            identity: IDENTITY,
            anatomyContract: buildAnatomyContract({ bodyPlan: BODY_PLANS.QUADRUPED, evolutionTargetId: 'TAIL' }),
            microConcept: { conceptName: 'Coda vela', mutationIdea: 'La coda sviluppa lobi fogliari.', visualDetails: ['lobi ancorati alla coda'], avoid: ['avoid additional structures'] },
            lineage: buildEvolutionLineageContext({ evolutionTargetId: 'TAIL', previousTransformations: [] }),
        })

        expect(prompt).toContain('Structures integrated into and anchored to the selected target are allowed.')
        expect(prompt).toContain('Avoid: independently rooted anatomical appendages or unrelated body structures outside the selected target.')
        expect(prompt).not.toContain('Avoid: avoid additional structures.')
    })

    it('announces an authorized body-plan mutation in the prompt', () => {
        const lineage = buildEvolutionLineageContext({ evolutionTargetId: 'LIMBS_AND_FEET', previousTransformations: [] })
        const prompt = composeFluxEvolutionPrompt({
            identity: IDENTITY,
            anatomyContract: buildAnatomyContract({ bodyPlan: BODY_PLANS.QUADRUPED, evolutionTargetId: 'LIMBS_AND_FEET', capability: 'BODY_PLAN_MUTATION', bodyPlanMutationId: 'ADD_LIMB_PAIR' }),
            microConcept: { conceptName: 'Arti mediani', mutationIdea: 'Un nuovo paio di arti mediani.', visualDetails: ['arti mediani sottili'] },
            lineage,
        })

        expect(prompt).toContain('AUTHORIZED BODY-PLAN MUTATION')
        expect(prompt).toContain('Keep exactly 6 limbs, in 3 symmetrical pairs')
    })
})
