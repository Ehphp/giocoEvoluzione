import { describe, expect, it, vi } from 'vitest'

import { buildAnatomyContract } from '../../../shared/creature-transformations/flux-evolution/anatomy-contract.ts'
import { CREATURE_BODY_PLAN_REGISTRY } from '../../../shared/creature-transformations/flux-evolution/body-plan-registry.ts'
import { FluxMicroConceptGenerator } from './flux-micro-concept-generator.ts'

const input = {
    identity: { creatureId: 'one', baseCreatureKey: 'VERDANT_HATCHLING', description: 'Piccolo drago verde.', identityFeatures: ['occhi ambrati'], mutableVisualFeatures: ['verde'], styleDefinition: '3D stilizzato' },
    evolutionTargetId: 'FORELIMBS' as const,
    evolutionFunction: 'PROPULSION' as const,
    anatomyContract: buildAnatomyContract(CREATURE_BODY_PLAN_REGISTRY.VERDANT_HATCHLING!, 'FORELIMBS'),
    previousTransformations: [{ versionNumber: 2, visualTraitId: 'LOCOMOTION_ADAPTATION' as const, evolutionTargetId: 'TAIL' as const, conceptName: 'Timone foglia' }],
}

describe('FluxMicroConceptGenerator', () => {
    it('uses strict structured output with target/history and no legacy concept contract', async () => {
        const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify({ conceptName: 'Pale rematrici', mutationIdea: 'Membrane pieghevoli.', visualDetails: ['lamelle'], avoid: [] }) })))
        const generator = new FluxMicroConceptGenerator({ apiKey: 'test-key', model: 'test-model', fetchImplementation })

        await expect(generator.generate(input)).resolves.toMatchObject({ conceptName: 'Pale rematrici' })
        const request = JSON.parse(String(fetchImplementation.mock.calls[0]![1].body))
        const prompt = request.input[0].content[0].text as string
        expect(prompt).toContain('FORELIMBS')
        expect(prompt).toContain('Functional direction: PROPULSION')
        expect(prompt).toContain('clearly readable at gameplay scale')
        expect(prompt).toContain('not as a limit on the concrete morphology')
        expect(prompt).toContain('Timone foglia')
        expect(prompt).not.toContain('mutationArchetype')
        expect(prompt).not.toContain('colorEvolution')
        expect(JSON.stringify(request)).toContain('additionalProperties')
        expect(request.text.format.schema.required).toEqual(['conceptName', 'mutationIdea', 'visualDetails', 'avoid'])
    })

    it('retries one malformed schema response then rejects an invalid contract', async () => {
        const retry = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: '{bad json' })))
            .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify({ conceptName: '', mutationIdea: 'idea', visualDetails: [] }) })))
        const generator = new FluxMicroConceptGenerator({ apiKey: 'test-key', model: 'test-model', fetchImplementation: retry })
        await expect(generator.generate(input)).rejects.toMatchObject({ code: 'FLUX_CONCEPT_RESPONSE_INVALID' })
        expect(retry).toHaveBeenCalledTimes(2)
    })

    it('can produce a baseline brief without weakening the hard anatomy contract', async () => {
        const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify({ conceptName: 'Pale rematrici', mutationIdea: 'Membrane pieghevoli.', visualDetails: ['lamelle'], avoid: [] }) })))
        const generator = new FluxMicroConceptGenerator({ apiKey: 'test-key', model: 'test-model', fetchImplementation })

        await generator.generate({ ...input, creativeMode: 'BASELINE' })

        const prompt = JSON.parse(String(fetchImplementation.mock.calls[0]![1].body)).input[0].content[0].text as string
        expect(prompt).toContain('Keep exactly 2 forelimbs, 2 hind limbs and 4 total limbs.')
        expect(prompt).not.toContain('Single-focus evolution is not necessarily small')
        expect(prompt).not.toContain('Creative allowance for the selected target')
    })
})
