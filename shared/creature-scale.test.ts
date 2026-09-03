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

    it('makes an accepted much-taller evolution perceptibly larger without becoming unbounded', () => {
        expect(getCreatureBattleScale(1.652)).toBeCloseTo(1.27, 2)
    })

    it('grows non-linearly rather than proportionally to height', () => {
        const quarterReference = getCreatureBattleScale(DEFAULT_CREATURE_HEIGHT_METERS / 4)
        const slightlyTallerReference = getCreatureBattleScale(DEFAULT_CREATURE_HEIGHT_METERS * 1.1)

        expect(quarterReference).toBe(.72)
        expect(slightlyTallerReference).toBeCloseTo(Math.pow(1.1, 1.45))
        expect(slightlyTallerReference).not.toBeCloseTo(1.1)
    })

    it('falls back safely for legacy and invalid biological data', () => {
        expect(resolveCreatureHeightMeters(undefined, 'verdant_hatchling')).toBe(DEFAULT_CREATURE_HEIGHT_METERS)
        expect(resolveCreatureHeightMeters(0, 'unknown')).toBe(DEFAULT_CREATURE_HEIGHT_METERS)
        expect(resolveCreatureHeightMeters(-1, 'unknown')).toBe(DEFAULT_CREATURE_HEIGHT_METERS)
        expect(resolveCreatureHeightMeters(Number.NaN, 'unknown')).toBe(DEFAULT_CREATURE_HEIGHT_METERS)
        expect(getCreatureBattleScale(Number.NaN)).toBe(1)
    })
})
