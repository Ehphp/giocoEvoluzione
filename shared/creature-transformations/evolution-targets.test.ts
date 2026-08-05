import { describe, expect, it } from 'vitest'

import { EVOLUTION_TARGETS, resolveEvolutionDirection } from './evolution-targets.ts'

describe('evolution target catalog', () => {
    it('defines the six player-facing targets with local primary anatomy', () => {
        expect(EVOLUTION_TARGETS.map((target) => target.id)).toEqual(['TAIL', 'FORELIMBS', 'HIND_LIMBS', 'HEAD_AND_SENSES', 'TORSO_AND_BACK', 'SKIN'])
        for (const target of EVOLUTION_TARGETS) {
            expect(target.label).toBeTruthy()
            expect(target.description).toBeTruthy()
            expect(target.primaryBodyAreas).not.toHaveLength(0)
            expect(target.compatibleVisualTraits).not.toHaveLength(0)
        }
    })

    it('prefers a compatible direction not previously used for the same target', () => {
        const resolved = resolveEvolutionDirection({
            evolutionTargetId: 'TAIL', seed: 'tail-1',
            previousTransformations: [{ evolutionTargetId: 'TAIL', evolutionFunction: 'BALANCE', visualTraitId: 'LOCOMOTION_ADAPTATION' }],
        })

        expect(resolved).not.toEqual({ evolutionFunction: 'BALANCE', visualTraitId: 'LOCOMOTION_ADAPTATION' })
    })
})