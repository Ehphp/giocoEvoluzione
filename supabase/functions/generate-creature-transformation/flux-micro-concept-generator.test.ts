import { describe, expect, it, vi } from 'vitest'

import { BODY_PLANS } from '../../../shared/creature-transformations/flux-evolution/body-plan-registry.ts'
import { buildFluxEvolutionPlan } from '../../../shared/creature-transformations/flux-evolution/evolution-plan.ts'
import { FluxMicroConceptGenerator, composeFluxMicroConceptInstructions } from './flux-micro-concept-generator.ts'
import { TEST_CREATURE_IDENTITY } from './test-creature-fixtures.ts'

const PREVIOUS = [
    { versionNumber: 2, visualTraitId: 'LOCOMOTION_ADAPTATION' as const, evolutionTargetId: 'TAIL' as const, conceptName: 'Timone foglia', mutationIdea: 'coda larga' },
    { versionNumber: 3, visualTraitId: 'ENERGY_REGULATION' as const, evolutionTargetId: 'SKIN_AND_COVERING' as const, conceptName: 'Pelle abissale', mutationIdea: 'pelle scura con venature luminose' },
]

function planFor(evolutionTargetId: 'SKIN_AND_COVERING' | 'LIMBS_AND_FEET', structural = false) {
    return buildFluxEvolutionPlan({
        bodyPlan: BODY_PLANS.QUADRUPED,
        evolutionTargetId,
        previousTransformations: PREVIOUS,
        seed: 'seed',
        ...(structural ? { bodyPlanMutationEnabled: true, requestedBodyPlanMutationId: 'ADD_LIMB_PAIR' as const } : {}),
    })
}

const input = { identity: TEST_CREATURE_IDENTITY, plan: planFor('SKIN_AND_COVERING') }

describe('FluxMicroConceptGenerator', () => {
    it('briefs the model with target freedom, the anatomy contract and the target-aware lineage', () => {
        const prompt = composeFluxMicroConceptInstructions(input)

        expect(prompt).toContain('SELECTED TARGET: SKIN_AND_COVERING')
        expect(prompt).toMatch(/primary evolutionary target/i)
        expect(prompt).toMatch(/default to a local mutation/i)
        expect(prompt).toMatch(/If the mutation works on its own, describe only that target/i)
        expect(prompt).toMatch(/Preserve all unrelated anatomy by default/i)
        expect(prompt).toMatch(/never add one by default/i)
        expect(prompt).not.toMatch(/lives exclusively there/i)
        expect(prompt).toContain('TARGET FREEDOM')
        expect(prompt).toContain('ANATOMY CONTRACT')
        expect(prompt).toContain('CURRENT SOURCE IMAGE')
        expect(prompt).toContain('CURRENT TARGET STATE')
        expect(prompt).toContain('Pelle abissale')
        expect(prompt).toMatch(/Develop it further/i)
        expect(prompt).toContain('OTHER ESTABLISHED EVOLUTIONS')
        expect(prompt).toContain('Timone foglia')
        expect(prompt).toMatch(/do not reinterpret it as the new mutation/i)
        expect(prompt).not.toContain('mutationArchetype')
        expect(prompt).not.toContain('colorEvolution')
        expect(prompt).not.toContain('AUTHORIZED BODY-PLAN MUTATION')
    })

    it('states the authorized structural change when the capability is used', () => {
        const prompt = composeFluxMicroConceptInstructions({ identity: TEST_CREATURE_IDENTITY, plan: planFor('LIMBS_AND_FEET', true) })

        expect(prompt).toContain('AUTHORIZED BODY-PLAN MUTATION')
        expect(prompt).toMatch(/one additional symmetrical pair of limbs/i)
        expect(prompt).toContain('Keep exactly 6 limbs')
    })

    it('uses strict structured output and returns only the small micro-concept', async () => {
        const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify({ conceptName: 'Corteccia vitrea', mutationIdea: 'Placche vitree.', visualDetails: ['placche'], avoid: [] }) })))
        const generator = new FluxMicroConceptGenerator({ apiKey: 'test-key', model: 'test-model', fetchImplementation })

        await expect(generator.generate(input)).resolves.toMatchObject({ conceptName: 'Corteccia vitrea' })
        const request = JSON.parse(String(fetchImplementation.mock.calls[0]![1].body))
        expect(request.text.format.strict).toBe(true)
        expect(request.text.format.schema.required).toEqual(['conceptName', 'mutationIdea', 'visualDetails', 'avoid'])
        expect(JSON.stringify(request)).toContain('additionalProperties')
    })

    it('retries one malformed schema response then rejects an invalid contract', async () => {
        const retry = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: '{bad json' })))
            .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify({ conceptName: '', mutationIdea: 'idea', visualDetails: [] }) })))
        const generator = new FluxMicroConceptGenerator({ apiKey: 'test-key', model: 'test-model', fetchImplementation: retry })

        await expect(generator.generate(input)).rejects.toMatchObject({ code: 'FLUX_CONCEPT_RESPONSE_INVALID' })
        expect(retry).toHaveBeenCalledTimes(2)
    })
})
