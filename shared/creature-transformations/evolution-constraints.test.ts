import { describe, expect, it } from 'vitest'

import type { BodyArea } from './body-areas.ts'
import type { ColorEvolution, ColorEvolutionMode, TransformationIntensity } from './concepts.ts'
import { EVOLUTION_FUNCTION_VISUAL_TRAITS, getColorEvolutionConstraintViolations, getEvolutionConstraints } from './evolution-constraints.ts'
import { EVOLUTION_FUNCTION_IDS, EVOLUTION_TARGETS, resolveEvolutionDirection } from './evolution-targets.ts'
import { VISUAL_TRAIT_BY_ID } from './visual-traits.ts'

function colorEvolution(mode: ColorEvolutionMode, intensity: 0 | TransformationIntensity, affectedBodyAreas: readonly BodyArea[]): ColorEvolution {
    return {
        mode,
        dominantColor: mode === 'PRESERVE' ? 'established palette' : 'deep teal',
        secondaryColors: mode === 'PRESERVE' ? [] : ['sea green'],
        accentColors: mode === 'PRESERVE' ? [] : ['soft silver'],
        surfaceEffects: mode === 'PRESERVE' ? [] : ['subtle iridescence'],
        affectedBodyAreas: [...affectedBodyAreas],
        intensity,
        biologicalRationale: 'La pigmentazione rende leggibile la funzione evolutiva senza alterare l identita.',
    }
}

describe('evolution constraints', () => {
    it('allows the resolver to return only catalog directions with a valid local primary anatomy', () => {
        for (const target of EVOLUTION_TARGETS) {
            const direction = resolveEvolutionDirection({ evolutionTargetId: target.id, seed: `all-targets:${target.id}` })

            expect(direction).not.toBeNull()
            if (!direction) continue
            const constraints = getEvolutionConstraints({
                evolutionTarget: target,
                visualTrait: VISUAL_TRAIT_BY_ID[direction.visualTraitId],
                evolutionFunction: direction.evolutionFunction,
                intensity: 2,
            })
            expect(constraints.isGeneratable).toBe(true)
            expect(constraints.allowedPrimaryBodyAreas).not.toHaveLength(0)
            expect(target.primaryBodyAreas).toContain(constraints.allowedPrimaryBodyAreas[0])
        }
    })

    it('makes every catalog candidate derive its validity from target-trait anatomy intersection', () => {
        for (const target of EVOLUTION_TARGETS) {
            for (const evolutionFunction of EVOLUTION_FUNCTION_IDS) {
                for (const visualTraitId of EVOLUTION_FUNCTION_VISUAL_TRAITS[evolutionFunction]) {
                    if (!target.compatibleVisualTraits.includes(visualTraitId)) continue
                    const constraints = getEvolutionConstraints({
                        evolutionTarget: target,
                        visualTrait: VISUAL_TRAIT_BY_ID[visualTraitId],
                        evolutionFunction,
                        intensity: 2,
                    })

                    expect(constraints.isGeneratable).toBe(constraints.allowedPrimaryBodyAreas.length > 0)
                }
            }
        }

        const invalidImpactHindLimbs = getEvolutionConstraints({
            evolutionTarget: EVOLUTION_TARGETS.find((target) => target.id === 'HIND_LIMBS')!,
            visualTrait: VISUAL_TRAIT_BY_ID.IMPACT_ADAPTATION,
            evolutionFunction: 'DEFENSE',
            intensity: 2,
        })
        expect(invalidImpactHindLimbs.isGeneratable).toBe(false)
        expect(invalidImpactHindLimbs.structuralReasons.map((reason) => reason.code)).toContain('NO_ALLOWED_PRIMARY_BODY_AREA')
    })

    it('constrains local target anatomy and colours to the actual trait intersection', () => {
        const constraints = getEvolutionConstraints({
            evolutionTarget: EVOLUTION_TARGETS.find((target) => target.id === 'TAIL')!,
            visualTrait: VISUAL_TRAIT_BY_ID.LOCOMOTION_ADAPTATION,
            evolutionFunction: 'BALANCE',
            intensity: 2,
        })

        expect(constraints.allowedPrimaryBodyAreas).toEqual(['TAIL'])
        expect(constraints.allowedSupportingBodyAreas).toEqual(['SKIN_SURFACE'])
        expect(constraints.allowedColorBodyAreas).toEqual(['TAIL', 'SKIN_SURFACE'])
        expect(getColorEvolutionConstraintViolations(colorEvolution('SHIFT', 2, ['TAIL', 'BACK']), constraints)).toContain('AFFECTED_BODY_AREA_NOT_ALLOWED')
    })

    it('aligns colour modes, readability and intensity requirements for targeted transformations', () => {
        const target = EVOLUTION_TARGETS.find((entry) => entry.id === 'SKIN')!
        const expectedModes: Readonly<Record<TransformationIntensity, readonly ColorEvolutionMode[]>> = {
            1: ['PRESERVE', 'EXPAND'],
            2: ['PRESERVE', 'EXPAND', 'SHIFT'],
            3: ['PRESERVE', 'SHIFT'],
        }

        for (const intensity of [1, 2, 3] as const) {
            const constraints = getEvolutionConstraints({
                evolutionTarget: target,
                visualTrait: VISUAL_TRAIT_BY_ID.AQUATIC_MORPHOLOGY,
                evolutionFunction: 'AQUATIC_ADAPTATION',
                intensity,
            })
            expect(constraints.colorEvolution.required).toBe(true)
            expect(constraints.colorEvolution.allowedModes).toEqual(expectedModes[intensity])
            expect(getColorEvolutionConstraintViolations(colorEvolution('PRESERVE', 0, []), constraints)).toEqual([])
        }

        const intensityTwo = getEvolutionConstraints({
            evolutionTarget: target,
            visualTrait: VISUAL_TRAIT_BY_ID.AQUATIC_MORPHOLOGY,
            evolutionFunction: 'AQUATIC_ADAPTATION',
            intensity: 2,
        })
        expect(getColorEvolutionConstraintViolations(colorEvolution('SHIFT', 2, []), intensityTwo)).toContain('AFFECTED_BODY_AREA_REQUIRED')
        expect(getColorEvolutionConstraintViolations(colorEvolution('SHIFT', 2, ['EYE_REGION']), intensityTwo)).toContain('AFFECTED_BODY_AREA_NOT_ALLOWED')

        const intensityThree = getEvolutionConstraints({
            evolutionTarget: target,
            visualTrait: VISUAL_TRAIT_BY_ID.AQUATIC_MORPHOLOGY,
            evolutionFunction: 'AQUATIC_ADAPTATION',
            intensity: 3,
        })
        expect(getColorEvolutionConstraintViolations(colorEvolution('EXPAND', 3, ['SKIN_SURFACE']), intensityThree)).toContain('MODE_NOT_ALLOWED')
        expect(getColorEvolutionConstraintViolations(colorEvolution('SHIFT', 3, ['TAIL']), intensityThree)).toContain('SKIN_SURFACE_REQUIRED')
        expect(getColorEvolutionConstraintViolations(colorEvolution('SHIFT', 3, ['SKIN_SURFACE']), intensityThree)).toEqual([])
    })
})
