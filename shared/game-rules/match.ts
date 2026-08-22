import { TOTAL_ROUNDS, WINS_TO_WIN } from './catalog.ts'

export type StoredRoundValue = { player1Value: number; player2Value: number }
export type MatchOutcome = {
    finished: boolean
    winnerId: string | null
    reason: 'CLINCH' | 'SCORE' | 'ROUND_VALUE_TIEBREAK' | 'DRAW' | null
    player1RoundValueTotal: number
    player2RoundValueTotal: number
}

export function resolveMatchOutcome(input: {
    player1Id: string
    player2Id: string
    player1Score: number
    player2Score: number
    resolvedRoundNumber: number
    storedRoundValues: StoredRoundValue[]
}): MatchOutcome {
    if (
        !Number.isInteger(input.player1Score) ||
        input.player1Score < 0 ||
        !Number.isInteger(input.player2Score) ||
        input.player2Score < 0 ||
        !Number.isInteger(input.resolvedRoundNumber) ||
        input.resolvedRoundNumber < 0 ||
        input.resolvedRoundNumber > TOTAL_ROUNDS
    )
        throw new Error('Invalid match state.')
    if (
        input.storedRoundValues.some(
            (result) => !Number.isFinite(result?.player1Value) || !Number.isFinite(result?.player2Value),
        )
    )
        throw new Error('Invalid stored round value.')
    const player1RoundValueTotal = input.storedRoundValues.reduce((total, result) => total + result.player1Value, 0)
    const player2RoundValueTotal = input.storedRoundValues.reduce((total, result) => total + result.player2Value, 0)
    if (input.player1Score >= WINS_TO_WIN)
        return {
            finished: true,
            winnerId: input.player1Id,
            reason: 'CLINCH',
            player1RoundValueTotal,
            player2RoundValueTotal,
        }
    if (input.player2Score >= WINS_TO_WIN)
        return {
            finished: true,
            winnerId: input.player2Id,
            reason: 'CLINCH',
            player1RoundValueTotal,
            player2RoundValueTotal,
        }
    if (input.resolvedRoundNumber < TOTAL_ROUNDS)
        return { finished: false, winnerId: null, reason: null, player1RoundValueTotal, player2RoundValueTotal }
    if (input.player1Score !== input.player2Score)
        return {
            finished: true,
            winnerId: input.player1Score > input.player2Score ? input.player1Id : input.player2Id,
            reason: 'SCORE',
            player1RoundValueTotal,
            player2RoundValueTotal,
        }
    if (player1RoundValueTotal !== player2RoundValueTotal)
        return {
            finished: true,
            winnerId: player1RoundValueTotal > player2RoundValueTotal ? input.player1Id : input.player2Id,
            reason: 'ROUND_VALUE_TIEBREAK',
            player1RoundValueTotal,
            player2RoundValueTotal,
        }
    return { finished: true, winnerId: null, reason: 'DRAW', player1RoundValueTotal, player2RoundValueTotal }
}
