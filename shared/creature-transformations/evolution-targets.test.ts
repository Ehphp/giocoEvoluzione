import { describe, expect, it } from 'vitest'

import {
    DEPRECATED_EVOLUTION_FUNCTION_IDS,
    EVOLUTION_FUNCTION_VISUAL_TRAITS,
    EVOLUTION_TARGETS,
    EVOLUTION_TARGET_BY_ID,
    EVOLUTION_TARGET_IDS,
    evolutionTargetFamily,
    isEvolutionTargetId,
    isGeneratableEvolutionDirection,
    resolveEvolutionDirection,
} from './evolution-targets.ts'
import { BODY_PLANS } from './flux-evolution/body-plan-registry.ts'
import { VISUAL_TRAIT_BY_ID } from './visual-traits.ts'

const CORE_TARGETS = ['TAIL', 'LIMBS_AND_FEET', 'HEAD_AND_CROWN', 'BODY_SHAPE', 'DORSAL_STRUCTURES', 'SKIN_AND_COVERING'] as const

describe('evolution target taxonomy', () => {
    it('exposes the visually interpretable core targets plus body-plan specific ones', () => {
        expect(EVOLUTION_TARGET_IDS.slice(0, 6)).toEqual(CORE_TARGETS)
        expect(EVOLUTION_TARGET_IDS).toContain('WINGS')
        expect(EVOLUTION_TARGET_IDS).toContain('TENTACLES')
        // The taxonomy never asks an image model to tell a forelimb from a hind limb.
        expect(EVOLUTION_TARGET_IDS).not.toContain('FORELIMBS')
        expect(EVOLUTION_TARGET_IDS).not.toContain('HIND_LIMBS')
    })

    it('describes each target once, with a prompt region and a lineage family', () => {
        expect(EVOLUTION_TARGETS.map((target) => target.id)).toEqual([...EVOLUTION_TARGET_IDS])
        for (const target of EVOLUTION_TARGETS) {
            expect(EVOLUTION_TARGET_BY_ID[target.id]).toBe(target)
            expect(target.label).not.toBe(target.id)
            expect(target.promptRegion.trim().length).toBeGreaterThan(0)
            expect(target.primaryBodyAreas.length).toBeGreaterThan(0)
            expect(target.compatibleVisualTraits.length).toBeGreaterThan(0)
        }
    })

    it('separates body volume from dorsal structures and groups limb systems together', () => {
        expect(evolutionTargetFamily('BODY_SHAPE')).not.toBe(evolutionTargetFamily('DORSAL_STRUCTURES'))
        expect(evolutionTargetFamily('WINGS')).toBe(evolutionTargetFamily('LIMBS_AND_FEET'))
        expect(evolutionTargetFamily('TENTACLES')).toBe(evolutionTargetFamily('LIMBS_AND_FEET'))
    })

    it('resolves a generatable functional direction for every target', () => {
        for (const targetId of EVOLUTION_TARGET_IDS) {
            const direction = resolveEvolutionDirection({ evolutionTargetId: targetId, seed: 'seed' })

            expect(direction, targetId).not.toBeNull()
            expect(isGeneratableEvolutionDirection({ evolutionTargetId: targetId, ...direction! })).toBe(true)
            expect(EVOLUTION_TARGET_BY_ID[targetId].primaryBodyAreas.some((area) => VISUAL_TRAIT_BY_ID[direction!.visualTraitId].allowedBodyAreas.includes(area))).toBe(true)
        }
    })

    it('prefers a direction the creature has not used on that target yet', () => {
        const first = resolveEvolutionDirection({ evolutionTargetId: 'LIMBS_AND_FEET', seed: 'key-1' })!
        const second = resolveEvolutionDirection({
            evolutionTargetId: 'LIMBS_AND_FEET',
            previousTransformations: [{ evolutionTargetId: 'LIMBS_AND_FEET', visualTraitId: first.visualTraitId, evolutionFunction: first.evolutionFunction }],
            seed: 'key-1',
        })!

        expect(`${second.visualTraitId}:${second.evolutionFunction}`).not.toBe(`${first.visualTraitId}:${first.evolutionFunction}`)
    })

    it('keeps DEFENSE abstract instead of resolving it as impact adaptation', () => {
        expect(DEPRECATED_EVOLUTION_FUNCTION_IDS).toContain('IMPACT_ABSORPTION')
        expect(EVOLUTION_FUNCTION_VISUAL_TRAITS.DEFENSE).toEqual(['ANATOMICAL_EVOLUTION'])
        expect(isGeneratableEvolutionDirection({
            evolutionTargetId: 'TAIL',
            evolutionFunction: 'DEFENSE',
            visualTraitId: 'ANATOMICAL_EVOLUTION',
        })).toBe(true)

        const defenseDirection = Array.from({ length: 64 }, (_, index) => resolveEvolutionDirection({ evolutionTargetId: 'TAIL', seed: `defense-${index}` }))
            .find((direction) => direction?.evolutionFunction === 'DEFENSE')
        expect(defenseDirection).toEqual({ evolutionFunction: 'DEFENSE', visualTraitId: 'ANATOMICAL_EVOLUTION' })
    })

    it('recognises only catalogued target ids', () => {
        expect(isEvolutionTargetId('DORSAL_STRUCTURES')).toBe(true)
        expect(isEvolutionTargetId('TORSO_AND_BACK')).toBe(false)
        expect(isEvolutionTargetId(null)).toBe(false)
    })

    it('keeps every body-plan target inside the taxonomy', () => {
        for (const plan of Object.values(BODY_PLANS)) {
            plan.evolutionTargets.forEach((targetId) => expect(EVOLUTION_TARGET_IDS).toContain(targetId))
        }
    })
})
