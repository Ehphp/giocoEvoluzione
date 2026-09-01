import { describe, expect, it } from 'vitest'

import {
    DEFAULT_CREATURE_HEIGHT_METERS,
    getCreatureBattleScale,
    resolveCreatureHeightMeters,
} from './creature-scale.ts'

describe('getCreatureBattleScale', () => {
    it('keeps the reference height at a neutral battle scale', () => {
        expect(getCreatureBattleScale(DEFAULT_CREATURE_HEIGHT_METERS)).toBe(1)
    })

    it('keeps a very small creature at the minimum scale', () => {
        expect(getCreatureBattleScale(Number.MIN_VALUE)).toBe(.72)
    })

    it('caps a very large creature at the maximum scale', () => {
        expect(getCreatureBattleScale(100)).toBe(1.35)
    })

    it('grows non-linearly rather than proportionally to height', () => {
        const quarterReference = getCreatureBattleScale(DEFAULT_CREATURE_HEIGHT_METERS / 4)
        const reference = getCreatureBattleScale(DEFAULT_CREATURE_HEIGHT_METERS)
        const sevenQuartersReference = getCreatureBattleScale(DEFAULT_CREATURE_HEIGHT_METERS * 1.75)

        expect(quarterReference).toBeCloseTo(.86)
        expect(sevenQuartersReference).toBeCloseTo(.72 + .28 * Math.sqrt(1.75))
        expect(sevenQuartersReference - reference).toBeLessThan(reference - quarterReference)
    })

    it('falls back safely for legacy and invalid biological data', () => {
        expect(resolveCreatureHeightMeters(undefined, 'verdant_hatchling')).toBe(DEFAULT_CREATURE_HEIGHT_METERS)
        expect(resolveCreatureHeightMeters(0, 'unknown')).toBe(DEFAULT_CREATURE_HEIGHT_METERS)
        expect(resolveCreatureHeightMeters(-1, 'unknown')).toBe(DEFAULT_CREATURE_HEIGHT_METERS)
        expect(resolveCreatureHeightMeters(Number.NaN, 'unknown')).toBe(DEFAULT_CREATURE_HEIGHT_METERS)
        expect(getCreatureBattleScale(Number.NaN)).toBe(1)
    })
})
