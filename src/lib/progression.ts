export const PROGRESSION = {
    COMPLETED_MATCH_XP: 10,
    WIN_BONUS_XP: 5,
    DRAW_BONUS_XP: 3,
    XP_PER_LEVEL: 30,
} as const

export type ProgressionOutcome = 'win' | 'draw' | 'loss'

export function calculateExperienceAward(outcome: ProgressionOutcome): number {
    if (outcome === 'win') {
        return PROGRESSION.COMPLETED_MATCH_XP + PROGRESSION.WIN_BONUS_XP
    }

    if (outcome === 'draw') {
        return PROGRESSION.COMPLETED_MATCH_XP + PROGRESSION.DRAW_BONUS_XP
    }

    return PROGRESSION.COMPLETED_MATCH_XP
}

export function getLevelForExperience(experience: number): number {
    return Math.floor(Math.max(0, experience) / PROGRESSION.XP_PER_LEVEL) + 1
}

export function getExperienceProgress(experience: number) {
    return {
        current: Math.max(0, experience) % PROGRESSION.XP_PER_LEVEL,
        required: PROGRESSION.XP_PER_LEVEL,
    }
}
