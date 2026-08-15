import { describe, expect, it } from 'vitest'

import { evolutionTargetFamily } from '../evolution-targets.ts'
import { composeFluxEvolutionPrompt } from './flux-prompt-composer.ts'
import { buildAnatomyContract } from './anatomy-contract.ts'
import { BODY_PLANS } from './body-plan-registry.ts'

function promptFor(target: Parameters<typeof buildAnatomyContract>[0]['evolutionTargetId']): string {
    return composeFluxEvolutionPrompt({
        identity: {
            creatureId: 'creature', baseCreatureKey: 'test-creature', description: 'A moss-green quadruped.',
            identityFeatures: ['round eyes'], mutableVisualFeatures: [], styleDefinition: 'illustrated',
        },
        anatomyContract: buildAnatomyContract({ bodyPlan: BODY_PLANS.QUADRUPED, evolutionTargetId: target }),
        microConcept: {
            conceptName: 'Mutazione leggibile',
            mutationIdea: 'Il target sviluppa una nuova forma biologica sostanziale.',
            visualDetails: ['forma chiaramente trasformata'],
        },
        lineage: { evolutionTargetId: target, family: evolutionTargetFamily(target), currentTargetState: null },
    })
}

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
        expect(prompt).toContain('MUTABLE APPEARANCE')
        expect(prompt).toMatch(/current surface appearance and coloration are not identity invariants/i)
        expect(prompt).toMatch(/unless the NEW MUTATION expressly declares a biologically motivated, target-linked colour treatment/i)
    })

    it('gives the selected target explicit precedence over local preservation', () => {
        const prompt = promptFor('BODY_SHAPE')

        expect(prompt).toMatch(/PRIMARY MUTATION AUTHORITY[\s\S]*NEW MUTATION takes precedence over preserving local geometry, proportions, biological material, local silhouette and surface detail/i)
        expect(prompt).toMatch(/Preservation rules protect identity, topology and non-target anatomy; they must not weaken, miniaturize or cosmetically reduce/i)
        expect(prompt).toMatch(/local means a circumscribed anatomical origin, not a small, conservative or surface-level edit/i)
        expect(prompt.indexOf('PRIMARY MUTATION AUTHORITY')).toBeLessThan(prompt.indexOf('NON-TARGET PRESERVATION'))
    })

    it('requires a gameplay-readable morphological delta on BODY_SHAPE and LIMBS_AND_FEET', () => {
        for (const target of ['BODY_SHAPE', 'LIMBS_AND_FEET'] as const) {
            const prompt = promptFor(target)

            expect(prompt).toMatch(/MINIMUM VISUAL DELTA[\s\S]*clear, unequivocal difference that reads at normal gameplay scale/i)
            expect(prompt).toMatch(/texture, colour, markings, plates, ridges or other surface details alone do not satisfy/i)
            expect(prompt).toMatch(/substantial, clearly readable and morphologically significant/i)
        }
    })

    it('keeps BODY_SHAPE morphology strong while locking its presentation', () => {
        const prompt = promptFor('BODY_SHAPE')

        expect(prompt.match(/\n\nNON-TARGET PRESERVATION\n\n/g)).toHaveLength(1)
        expect(prompt.match(/Preserve non-target anatomy by default/g)).toHaveLength(1)
        expect(prompt).toMatch(/BODY-SHAPE PRESENTATION LOCK[\s\S]*Reshape the trunk strongly through length, volume, chest and back mass, back line and mass distribution/i)
        expect(prompt).toMatch(/same base pose, viewpoint, facing direction, overall orientation and composition/i)
        expect(prompt).toMatch(/does not authorize a new stance, camera angle, rotation, tilt or re-staging/i)
        expect(prompt).toMatch(/Changing pose, stance, facing direction, overall orientation, viewpoint or composition is invalid/i)
        expect(prompt).not.toMatch(/differently balanced|posture rebalancing|slight posture or stance rebalancing|may shift in relative visual position/i)
    })

    it('keeps the BODY_SHAPE presentation lock out of an explicitly authorized bipedal transition', () => {
        const prompt = composeFluxEvolutionPrompt({
            identity: {
                creatureId: 'creature', baseCreatureKey: 'test-creature', description: 'A moss-green quadruped.',
                identityFeatures: ['round eyes'], mutableVisualFeatures: [], styleDefinition: 'illustrated',
            },
            anatomyContract: buildAnatomyContract({
                bodyPlan: BODY_PLANS.QUADRUPED,
                evolutionTargetId: 'BODY_SHAPE',
                capability: 'BODY_PLAN_MUTATION',
                bodyPlanMutationId: 'BIPEDAL_TRANSITION',
            }),
            microConcept: {
                conceptName: 'Transizione bipede',
                mutationIdea: 'Il corpo ricostruisce la postura bipede autorizzata.',
                visualDetails: ['gambe portanti', 'braccia libere'],
            },
            lineage: { evolutionTargetId: 'BODY_SHAPE', family: 'BODY_VOLUME', currentTargetState: null },
        })

        expect(prompt).toContain('AUTHORIZED BODY-PLAN MUTATION')
        expect(prompt).toMatch(/Rebuild the posture into an upright bipedal stance/i)
        expect(prompt).toContain('MANDATORY VISIBLE STRUCTURAL RESULT')
        expect(prompt).toMatch(/output must visibly read as an upright bipedal creature/i)
        expect(prompt).toMatch(/result that still reads as a quadruped is invalid/i)
        expect(prompt).toMatch(/Do not preserve the quadrupedal pose from the source image/i)
        expect(prompt).not.toContain('BODY-SHAPE PRESENTATION LOCK')
    })
})
