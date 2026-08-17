import { describe, expect, it } from 'vitest'

import { evolutionTargetFamily } from '../evolution-targets.ts'
import { composeFluxEvolutionPrompt, composeFluxEvolutionPromptV5, composeFluxEvolutionPromptV6, composeLockedDynamicFluxEvolutionPrompt, composeMinimalFluxEvolutionPrompt } from './flux-prompt-composer.ts'
import { buildAnatomyContract } from './anatomy-contract.ts'
import { BODY_PLANS } from './body-plan-registry.ts'

function promptFor(target: Parameters<typeof buildAnatomyContract>[0]['evolutionTargetId'], composer = composeFluxEvolutionPrompt): string {
    return composer({
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

    it('allows coherent supporting changes without unlocking unrelated mutations', () => {
        const prompt = promptFor('LIMBS_AND_FEET')

        expect(prompt).toMatch(/Preserve non-target identity and core anatomy, not pixel-identical geometry/i)
        expect(prompt).toMatch(/natural stance or posture rebalancing, supporting anatomy, structural integration and target-linked material or colour propagation/i)
        expect(prompt).toMatch(/do not need to be strictly indispensable/i)
        expect(prompt).toMatch(/Keep them related to and less dominant than the primary mutation/i)
        expect(prompt).toMatch(/Do not create a second unrelated mutation or violate the HARD INVARIANTS or TARGET STRUCTURE BOUNDARY/i)
    })

    it('retains the conservative non-target policy in the version 6 composer', () => {
        const prompt = promptFor('LIMBS_AND_FEET', composeFluxEvolutionPromptV6)

        expect(prompt).toMatch(/Preserve non-target anatomy by default/i)
        expect(prompt).toMatch(/Secondary changes are allowed only when necessary/i)
        expect(prompt).not.toMatch(/not pixel-identical geometry|do not need to be strictly indispensable/i)
    })

    it('keeps BODY_SHAPE morphology strong while locking its presentation', () => {
        const prompt = promptFor('BODY_SHAPE')

        expect(prompt.match(/\n\nNON-TARGET PRESERVATION\n\n/g)).toHaveLength(1)
        expect(prompt.match(/Preserve non-target identity and core anatomy, not pixel-identical geometry/g)).toHaveLength(1)
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

describe('composeLockedDynamicFluxEvolutionPrompt', () => {
    const identity = {
        creatureId: 'creature', baseCreatureKey: 'test-creature', description: 'A moss-green quadruped.',
        identityFeatures: ['round eyes'], mutableVisualFeatures: [], styleDefinition: 'illustrated',
    }
    const anatomyContract = buildAnatomyContract({ bodyPlan: BODY_PLANS.QUADRUPED, evolutionTargetId: 'HEAD_AND_CROWN' })
    const dynamicConcept = {
        conceptName: 'TEST_DYNAMIC_MUTATION_123',
        mutationIdea: 'Grow a symmetrical pair of soft crown structures from the existing skull.',
        visualDetails: ['rounded upward branches', 'living orange vascular velvet'],
        avoid: ['exposed white bone'],
    }

    function lockedPrompt(microConcept: Parameters<typeof composeLockedDynamicFluxEvolutionPrompt>[0]['microConcept'] = dynamicConcept, framingAttempt?: number) {
        return composeLockedDynamicFluxEvolutionPrompt({ identity, anatomyContract, microConcept, ...(framingAttempt === undefined ? {} : { framingAttempt }) })
    }

    function withoutMutation(prompt: string) {
        const start = prompt.indexOf('\n\nNEW MUTATION —')
        const end = prompt.indexOf('\n\nBIOLOGICAL PRIOR')
        return `${prompt.slice(0, start)}${prompt.slice(end)}`
    }

    it('keeps the deterministic viewpoint, framing, anatomy and invalid-result locks', () => {
        const prompt = lockedPrompt()

        expect(prompt).toContain('VIEWPOINT LOCK')
        expect(prompt).toContain('exact same camera angle, 3/4 view, facing direction')
        expect(prompt).toContain('Do not mirror the subject.')
        expect(prompt).toContain('Do not rotate it into profile.')
        expect(prompt).toContain('STRICT FRAMING')
        expect(prompt).toContain('ANATOMY LOCK')
        expect(prompt).toContain('Keep exactly 4 limbs')
        expect(prompt).toContain('SELECTED TARGET: HEAD_AND_CROWN')
        expect(prompt).toContain('BIOLOGICAL PRIOR')
        expect(prompt).toContain('NON-TARGET PRESERVATION')
        expect(prompt).toContain('BACKGROUND')
        expect(prompt).toContain('INVALID RESULT IF')
        expect(prompt).toMatch(/front-facing, profile-facing, mirrored/i)
        expect(prompt).not.toMatch(/stance rebalancing/i)
    })

    it('renders every field of the dynamic concept without flattening it', () => {
        const prompt = lockedPrompt()

        expect(prompt).toContain('NEW MUTATION — TEST_DYNAMIC_MUTATION_123')
        expect(prompt).toContain(dynamicConcept.mutationIdea)
        expect(prompt).toContain('Visual details:\n- rounded upward branches\n- living orange vascular velvet')
        expect(prompt).toContain('Avoid:\n- exposed white bone')
        expect(prompt).toContain('cannot override VIEWPOINT LOCK, STRICT FRAMING, ANATOMY LOCK or NON-TARGET PRESERVATION')
        expect(lockedPrompt({ ...dynamicConcept, avoid: undefined })).not.toContain('\nAvoid:\n')
    })

    it('keeps D and E shells identical while only their NEW MUTATION changes', () => {
        const fixed = lockedPrompt({ ...dynamicConcept, conceptName: 'ORANGE VELVET JUVENILE ANTLERS' })
        const generated = lockedPrompt()

        expect(withoutMutation(fixed)).toBe(withoutMutation(generated))
        expect(fixed).toContain('ORANGE VELVET JUVENILE ANTLERS')
        expect(generated).toContain('TEST_DYNAMIC_MUTATION_123')
    })

    it('keeps the concept unchanged while a retry tightens framing only', () => {
        const first = lockedPrompt()
        const retry = lockedPrompt(dynamicConcept, 1)

        expect(retry).toContain('RETRY FRAMING OVERRIDE (attempt 2)')
        expect(retry).toContain('at least 15% clear background margin')
        expect(retry).toContain('TEST_DYNAMIC_MUTATION_123')
        expect(retry).toContain(dynamicConcept.mutationIdea)
        expect(first).not.toContain('RETRY FRAMING OVERRIDE')
    })

    it('makes an authorized structural mutation explicit without unlocking other topology changes', () => {
        const structuralContract = buildAnatomyContract({
            bodyPlan: BODY_PLANS.QUADRUPED,
            evolutionTargetId: 'LIMBS_AND_FEET',
            capability: 'BODY_PLAN_MUTATION',
            bodyPlanMutationId: 'ADD_LIMB_PAIR',
        })

        const prompt = composeLockedDynamicFluxEvolutionPrompt({ identity, anatomyContract: structuralContract, microConcept: dynamicConcept })

        expect(prompt).toContain('AUTHORIZED STRUCTURAL MUTATION')
        expect(prompt).toMatch(/Grow one additional symmetrical pair of limbs/i)
        expect(prompt).toContain('Keep exactly 6 limbs')
        expect(prompt).toContain('any topology change other than the authorized structural mutation')
    })
})

describe('composeFluxEvolutionPromptV5', () => {
    it('restores the historical full prompt without v6 mutation-authority sections', () => {
        const prompt = composeFluxEvolutionPromptV5({
            identity: {
                creatureId: 'creature', baseCreatureKey: 'test-creature', description: 'A stylized fantasy creature with a distinctive, recognizable visual identity.',
                identityFeatures: ['distinctive individual identity'], mutableVisualFeatures: ['visual characteristics'], styleDefinition: 'illustrated',
            },
            anatomyContract: buildAnatomyContract({ bodyPlan: BODY_PLANS.QUADRUPED, evolutionTargetId: 'TAIL' }),
            microConcept: {
                conceptName: 'Split Aquatic Tail', mutationIdea: 'The tail evolves into two split tails from a common base.',
                visualDetails: ['elongated finned appendages', 'bioluminescent stripes'], avoid: ['new anatomical structures'],
            },
            lineage: { evolutionTargetId: 'TAIL', family: 'TAIL', currentTargetState: null },
        })

        expect(prompt).toContain('Edit the supplied source image. This is the same creature and the same individual. Preserve pose, viewpoint, composition and illustrated style as closely as possible.')
        expect(prompt).toContain('\n\nANATOMY CONTRACT\n\n')
        expect(prompt).toContain('This is the primary evolutionary target: make the primary mutation clearly readable there.')
        expect(prompt).toContain('\n\nPRESERVE\n\n')
        expect(prompt).toContain('Preserve the identity of this individual: distinctive individual identity.')
        expect(prompt).not.toMatch(/\n\n(?:PRIMARY MUTATION AUTHORITY|MINIMUM VISUAL DELTA|NON-TARGET PRESERVATION|HARD INVARIANTS)\n\n/)
    })

    it('retains the framing retry override', () => {
        const prompt = composeFluxEvolutionPromptV5({
            identity: { creatureId: 'creature', baseCreatureKey: 'test-creature', description: 'Creature.', identityFeatures: ['face'], mutableVisualFeatures: [], styleDefinition: 'illustrated' },
            anatomyContract: buildAnatomyContract({ bodyPlan: BODY_PLANS.QUADRUPED, evolutionTargetId: 'TAIL' }),
            microConcept: { conceptName: 'Tail', mutationIdea: 'Longer tail.', visualDetails: ['fins'] },
            lineage: { evolutionTargetId: 'TAIL', family: 'TAIL', currentTargetState: null },
            framingAttempt: 1,
        })

        expect(prompt).toContain('RETRY FRAMING OVERRIDE (attempt 2)')
    })
})

describe('composeMinimalFluxEvolutionPrompt', () => {
    it('contains only identity, compact presentation guidance and the generated micro-concept', () => {
        const prompt = composeMinimalFluxEvolutionPrompt({
            conceptName: 'Coda sentinella',
            mutationIdea: 'La coda sviluppa una punta elastica sensibile alle vibrazioni.',
            visualDetails: ['spine di cheratina', 'membrana flessibile'],
            avoid: ['extra limbs', 'a different viewpoint'],
        })

        expect(prompt).toBe([
            'Edit the supplied source image as an evolution of the same creature and same individual, keeping its identity recognisable.',
            "Keep the source image's visual style. Show the complete creature fully inside the canvas, sized to leave at least 10% clear background margin on every side.",
            'EVOLUTION:',
            'Coda sentinella: La coda sviluppa una punta elastica sensibile alle vibrazioni.\nVisual details: spine di cheratina; membrana flessibile',
        ].join('\n\n'))
        expect(prompt).not.toMatch(/ANATOMY CONTRACT|HARD INVARIANTS|PRESERVE|FAILURE CONDITIONS|TARGET FREEDOM|CURRENT TARGET STATE|OTHER ESTABLISHED EVOLUTIONS|STRICT FRAMING|BODY-PLAN|viewpoint|composition|extra limbs/i)
    })

    it('asks for progressively more margin on crop retries without adding other constraints', () => {
        const concept = {
            conceptName: 'Coda sentinella',
            mutationIdea: 'La coda sviluppa una punta elastica.',
            visualDetails: ['membrana flessibile'],
        }

        expect(composeMinimalFluxEvolutionPrompt(concept, 1)).toContain('at least 15% clear background margin')
        expect(composeMinimalFluxEvolutionPrompt(concept, 2)).toContain('at least 20% clear background margin')
        expect(composeMinimalFluxEvolutionPrompt(concept, 2)).not.toMatch(/ANATOMY CONTRACT|PRESERVE|FAILURE CONDITIONS|CURRENT TARGET STATE/i)
    })
})
