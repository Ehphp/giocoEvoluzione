import { describe, expect, it } from 'vitest'

import { calculateExperienceAward, getExperienceProgress, getLevelForExperience } from './progression'

describe('progression', () => {
    it('awards the configured XP for wins, draws and losses', () => {
        expect(calculateExperienceAward('win')).toBe(15)
        expect(calculateExperienceAward('draw')).toBe(13)
        expect(calculateExperienceAward('loss')).toBe(10)
    })

    it('raises the level every 30 total experience and reports progress in the current level', () => {
        expect(getLevelForExperience(0)).toBe(1)
        expect(getLevelForExperience(29)).toBe(1)
        expect(getLevelForExperience(30)).toBe(2)
        expect(getLevelForExperience(61)).toBe(3)
        expect(getExperienceProgress(61)).toEqual({ current: 1, required: 30 })
    })
})
