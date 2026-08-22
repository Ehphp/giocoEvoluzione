import { describe, expect, it } from 'vitest'

import {
    awardedCreatureVisualProgress,
    nextCreatureVisualProgress,
    readCreatureVisualProgressionWinsRequired,
} from './visual-progression.ts'

describe('visual progression policy', () => {
    it('awards exactly one point only for a win', () => {
        expect(awardedCreatureVisualProgress('WIN')).toBe(1)
        expect(awardedCreatureVisualProgress('DRAW')).toBe(0)
        expect(awardedCreatureVisualProgress('LOSS')).toBe(0)
    })

    it('moves an active track to READY at its server target', () => {
        expect(nextCreatureVisualProgress({ progress: 2, target: 3, status: 'ACTIVE' }, 'WIN')).toEqual({
            awarded: 1,
            progress: 3,
            status: 'READY',
        })
        expect(nextCreatureVisualProgress({ progress: 2, target: 3, status: 'ACTIVE' }, 'DRAW')).toEqual({
            awarded: 0,
            progress: 2,
            status: 'ACTIVE',
        })
    })

    it('has one authoritative default and ignores invalid environment values', () => {
        expect(readCreatureVisualProgressionWinsRequired(undefined)).toBe(3)
        expect(readCreatureVisualProgressionWinsRequired('3')).toBe(3)
        expect(readCreatureVisualProgressionWinsRequired('0')).toBe(3)
    })
})
