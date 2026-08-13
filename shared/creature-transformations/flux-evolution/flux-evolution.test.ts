import { describe, expect, it } from 'vitest'

import { CREATURE_IDENTITY_REGISTRY } from '../../../supabase/functions/generate-creature-transformation/identity-registry.ts'
import { buildAnatomyContract } from './anatomy-contract.ts'
import { CREATURE_BODY_PLAN_REGISTRY } from './body-plan-registry.ts'
import { composeFluxEvolutionPrompt } from './flux-prompt-composer.ts'
import { parseFluxMicroConcept } from './micro-concept.ts'

const plan = CREATURE_BODY_PLAN_REGISTRY.VERDANT_HATCHLING!

describe('FLUX evolution domain', () => {
    it('keeps the body-plan registry aligned with supported canonical identities', () => {
        expect(Object.keys(CREATURE_BODY_PLAN_REGISTRY).sort()).toEqual(Object.keys(CREATURE_IDENTITY_REGISTRY).sort())
    })

    it('derives the exact Verdant Hatchling forelimb topology deterministically', () => {
        const contract = buildAnatomyContract(plan, 'FORELIMBS')
        expect(contract.invariants).toContain('Keep exactly 2 forelimbs, 2 hind limbs and 4 total limbs.')
        expect(contract.targetRules).toContain('Evolve only the existing forelimbs.')
        expect(contract.targetRules).toContain('Keep hind limbs unchanged.')
        expect(contract.failureConditions.join(' ')).toMatch(/duplicate, remove, split or relocate limbs/)
    })

    it.each(['TAIL', 'FORELIMBS', 'HIND_LIMBS', 'HEAD_AND_SENSES', 'TORSO_AND_BACK', 'SKIN'] as const)('builds a conservative target-aware contract for %s', (target) => {
        const contract = buildAnatomyContract(plan, target)
        expect(contract.target).toBe(target)
        expect(contract.invariants.length).toBeGreaterThan(0)
        expect(contract.targetRules.length).toBeGreaterThan(0)
        expect(contract.creativeAllowance).toMatch(/Single-focus evolution, not necessarily small/)
        expect(contract.failureConditions.length).toBeGreaterThan(0)
    })

    it('allows a strong local torso silhouette while still rejecting global body-plan regressions', () => {
        const contract = buildAnatomyContract(plan, 'TORSO_AND_BACK')

        expect(contract.creativeAllowance).toMatch(/strong dorsal local silhouette change is desired/i)
        expect(contract.failureConditions.join(' ')).toMatch(/global body-plan or whole-creature silhouette replacement/i)
        expect(contract.failureConditions.join(' ')).toMatch(/unrelated new limb, tail, wing, head, face or eye/i)
    })

    it('keeps skin evolution structural-free even when its surface treatment is strong', () => {
        const contract = buildAnatomyContract(plan, 'SKIN')

        expect(contract.creativeAllowance).toMatch(/striking and clearly readable/i)
        expect(contract.failureConditions.join(' ')).toMatch(/New appendages, structural anatomy changes/i)
    })

    it('accepts only the small micro-concept schema', () => {
        expect(parseFluxMicroConcept({ conceptName: 'Pale rematrici', mutationIdea: 'Le zampe anteriori sviluppano membrane pieghevoli.', visualDetails: ['membrane pieghevoli'], avoid: ['armi'] })).toMatchObject({ conceptName: 'Pale rematrici' })
        expect(parseFluxMicroConcept({ conceptName: 'No', mutationIdea: 'idea', visualDetails: ['dettaglio'], mutationArchetype: 'legacy' })).toBeNull()
        expect(parseFluxMicroConcept({ conceptName: 'No', mutationIdea: 'idea', visualDetails: Array.from({ length: 6 }, () => 'dettaglio') })).toBeNull()
    })

    it('composes deterministic anatomy and failure rules around the local concept', () => {
        const prompt = composeFluxEvolutionPrompt({
            identity: { creatureId: 'one', baseCreatureKey: 'VERDANT_HATCHLING', description: 'Piccolo drago verde.', identityFeatures: ['occhi ambrati'], mutableVisualFeatures: ['verde'], styleDefinition: '3D stilizzato' },
            evolutionTargetId: 'FORELIMBS', anatomyContract: buildAnatomyContract(plan, 'FORELIMBS'),
            microConcept: { conceptName: 'Pale rematrici', mutationIdea: 'Membrane articolate sulle zampe anteriori.', visualDetails: ['lamelle morbide'] },
            previousTransformations: [{ versionNumber: 2, visualTraitId: 'LOCOMOTION_ADAPTATION', evolutionTargetId: 'TAIL', conceptName: 'Timone foglia', mutationIdea: 'coda larga' }],
        })
        expect(prompt).toContain('Keep exactly 2 forelimbs, 2 hind limbs and 4 total limbs.')
        expect(prompt).toContain('Pale rematrici')
        expect(prompt).toContain('Timone foglia (coda larga)')
        expect(prompt).toContain('Preserve overall recognisability and lineage, while allowing the evolved target region to significantly change morphology, local proportions, material and local silhouette.')
        expect(prompt).toContain('Single-focus evolution, not necessarily small')
        expect(prompt).toMatch(/No gradient, glow, aura, halo, bloom, light spill/)
        expect(prompt).not.toMatch(/Keep the body plan and recognisable silhouette stable.*strong local silhouette change is desired/i)
    })

    it('keeps a prompt-only baseline available for a controlled FLUX comparison', () => {
        const input = {
            identity: { creatureId: 'one', baseCreatureKey: 'VERDANT_HATCHLING', description: 'Piccolo drago verde.', identityFeatures: ['occhi ambrati'], mutableVisualFeatures: ['verde'], styleDefinition: '3D stilizzato' },
            evolutionTargetId: 'TORSO_AND_BACK' as const,
            anatomyContract: buildAnatomyContract(plan, 'TORSO_AND_BACK'),
            microConcept: { conceptName: 'Scudi dorsali', mutationIdea: 'Placche ampie e pieghevoli sul dorso.', visualDetails: ['lamelle profonde'] },
            previousTransformations: [],
        }

        const baseline = composeFluxEvolutionPrompt({ ...input, creativeMode: 'BASELINE' })
        const expressive = composeFluxEvolutionPrompt({ ...input, creativeMode: 'EXPRESSIVE' })

        expect(baseline).not.toContain('TARGET-SCOPED CREATIVE FREEDOM')
        expect(expressive).toContain('TARGET-SCOPED CREATIVE FREEDOM')
        expect(expressive).toContain('strong dorsal local silhouette change is desired')
        expect(baseline).toContain('A global body-plan or whole-creature silhouette replacement')
        expect(expressive).toContain('A global body-plan or whole-creature silhouette replacement')
    })
})
