import { describe, expect, it } from 'vitest'
import { TOTAL_ROUNDS, buildPersistedRoundResolution, createInitialAdaptations, getNaturalAdvantageBonus, getRoundEventById, getValidatedActionBreakdown, resolveMatchOutcome, resolveRound } from './index.ts'

const crisis = getRoundEventById('HEAT_SPIKE')
const action = (playerId: string, trait: 'FEROCITY' | 'ARMOR' | 'AGILITY' | 'SENSES' | 'CAMOUFLAGE', actionType: 'USE' | 'EVOLVE') => ({ playerId, trait, actionType })
const round = (overrides: Partial<Parameters<typeof resolveRound>[0]> = {}) => resolveRound({ roundNumber: 1, roundEvent: crisis, player1Id: 'p1', player2Id: 'p2', player1Traits: createInitialAdaptations(), player2Traits: createInitialAdaptations(), player1Action: action('p1', 'FEROCITY', 'USE'), player2Action: action('p2', 'ARMOR', 'USE'), ...overrides })

describe('best-of-seven adaptation rules', () => {
    it('EVOLVE produces exactly one and ignores crisis and natural advantage', () => {
        const adaptations = createInitialAdaptations(); adaptations.FEROCITY.cooldown = 1
        const breakdown = getValidatedActionBreakdown(crisis, adaptations, 'FEROCITY', 'EVOLVE', 1)
        expect(breakdown).toMatchObject({ total: 1, baseContribution: 1, levelContribution: 0, eventModifier: 0, matchupBonus: 0 })
        expect(round({ player1Traits: adaptations, player1Action: action('p1', 'FEROCITY', 'EVOLVE') }).player1.roundValue).toBe(1)
    })
    it('applies natural advantage only to the correct USE side, never to neutral or EVOLVE', () => {
        expect(getNaturalAdvantageBonus(action('p1', 'FEROCITY', 'USE'), action('p2', 'ARMOR', 'USE'))).toBe(1)
        expect(getNaturalAdvantageBonus(action('p1', 'ARMOR', 'USE'), action('p2', 'FEROCITY', 'USE'))).toBe(0)
        expect(getNaturalAdvantageBonus(action('p1', 'FEROCITY', 'USE'), action('p2', 'AGILITY', 'USE'))).toBe(0)
        expect(getNaturalAdvantageBonus(action('p1', 'FEROCITY', 'USE'), action('p2', 'ARMOR', 'EVOLVE'))).toBe(0)
    })
    it('ends immediately at four round wins', () => {
        const result = buildPersistedRoundResolution({ roundNumber: 4, roundEvent: crisis, player1Id: 'p1', player2Id: 'p2', player1Score: 3, player2Score: 0, player1Traits: createInitialAdaptations(), player2Traits: createInitialAdaptations(), player1Action: action('p1', 'SENSES', 'USE'), player2Action: action('p2', 'FEROCITY', 'EVOLVE'), priorRoundValues: [], startedAt: null })
        expect(result.resolution_data.statusAfter).toBe('FINISHED'); expect(result.resolution_data.winnerIdAfter).toBe('p1'); expect(result.resolution_data.matchEndReason).toBe('CLINCH')
    })
    it('can reach round seven and resolves score then stored-value tiebreak', () => {
        expect(TOTAL_ROUNDS).toBe(7)
        const tiebreak = resolveMatchOutcome({ player1Id: 'p1', player2Id: 'p2', player1Score: 3, player2Score: 3, resolvedRoundNumber: 7, storedRoundValues: [{ player1Value: 2, player2Value: 1 }, { player1Value: 1, player2Value: 1 }] })
        expect(tiebreak).toMatchObject({ finished: true, winnerId: 'p1', reason: 'ROUND_VALUE_TIEBREAK' })
        const draw = resolveMatchOutcome({ player1Id: 'p1', player2Id: 'p2', player1Score: 3, player2Score: 3, resolvedRoundNumber: 7, storedRoundValues: [{ player1Value: 2, player2Value: 2 }] })
        expect(draw).toMatchObject({ finished: true, winnerId: null, reason: 'DRAW' })
    })
})
