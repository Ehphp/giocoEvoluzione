import { describe, expect, it } from 'vitest'

import { composeFluxEvolutionPrompt } from './flux-prompt-composer.ts'
import { buildAnatomyContract } from './anatomy-contract.ts'
import { BODY_PLANS } from './body-plan-registry.ts'

describe('composeFluxEvolutionPrompt', () => {
    it('keeps the final Flux prompt biologically grounded without banning natural defenses', () => {
        const prompt = composeFluxEvolutionPrompt({
            identity: {
                creatureId: 'creature', baseCreatureKey: 'test-creature', description: 'A moss-green quadruped.',
                identityFeatures: ['round eyes'], mutableVisualFeatures: [], styleDefinition: 'illustrated',
            },
            anatomyContract: buildAnatomyContract({ bodyPlan: BODY_PLANS.QUADRUPED, evolutionTargetId: 'TAIL' }),
            microConcept: {
                conceptName: 'Coda sentinella',
                mutationIdea: 'La coda esistente sviluppa spine di cheratina e una punta più elastica.',
                visualDetails: ['spine cresciute dalla coda', 'tessuto elastico'],
            },
            lineage: { evolutionTargetId: 'TAIL', family: 'TAIL', currentTargetState: null },
        })

        expect(prompt).toContain('BIOLOGICAL PRIOR')
        expect(prompt).toMatch(/grown from the creature itself/i)
        expect(prompt).toMatch(/Avoid manufactured, mechanical, metallic, technological or worn structures/i)
        expect(prompt).toMatch(/Carapaces, chitin, bone, keratin, scales, mineralized skin, spines and biological plates are valid/i)
    })
})
