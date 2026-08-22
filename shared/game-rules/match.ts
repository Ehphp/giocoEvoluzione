import { STANDARD_SCHEDULED_ROUNDS } from './catalog.ts'
import { assertScheduledRounds } from './fine-del-mondo.ts'

export type StoredRoundValue = { player1Value: number; player2Value: number }
export type MatchOutcome = { finished: boolean; winnerId: string | null; reason: 'CLINCH' | 'SCORE' | 'ROUND_VALUE_TIEBREAK' | 'DRAW' | null; player1RoundValueTotal: number; player2RoundValueTotal: number }

export function resolveMatchOutcome(input: { player1Id: string; player2Id: string; player1Score: number; player2Score: number; resolvedRoundNumber: number; scheduledRounds?: number; storedRoundValues: StoredRoundValue[] }): MatchOutcome {
    const scheduledRounds = input.scheduledRounds ?? STANDARD_SCHEDULED_ROUNDS
    assertScheduledRounds(scheduledRounds)
    if (!Number.isInteger(input.player1Score) || input.player1Score < 0 || !Number.isInteger(input.player2Score) || input.player2Score < 0 || !Number.isInteger(input.resolvedRoundNumber) || input.resolvedRoundNumber < 0 || input.resolvedRoundNumber > scheduledRounds) throw new Error('Invalid match state.')
    if (input.storedRoundValues.some((result) => !Number.isFinite(result?.player1Value) || !Number.isFinite(result?.player2Value))) throw new Error('Invalid stored round value.')
    const player1RoundValueTotal = input.storedRoundValues.reduce((total, result) => total + result.player1Value, 0)
    const player2RoundValueTotal = input.storedRoundValues.reduce((total, result) => total + result.player2Value, 0)
    const remainingRounds = scheduledRounds - input.resolvedRoundNumber
    if (input.resolvedRoundNumber < scheduledRounds) {
        if (input.player1Score > input.player2Score + remainingRounds) return { finished: true, winnerId: input.player1Id, reason: 'CLINCH', player1RoundValueTotal, player2RoundValueTotal }
        if (input.player2Score > input.player1Score + remainingRounds) return { finished: true, winnerId: input.player2Id, reason: 'CLINCH', player1RoundValueTotal, player2RoundValueTotal }
        return { finished: false, winnerId: null, reason: null, player1RoundValueTotal, player2RoundValueTotal }
    }
    if (input.player1Score !== input.player2Score) return { finished: true, winnerId: input.player1Score > input.player2Score ? input.player1Id : input.player2Id, reason: 'SCORE', player1RoundValueTotal, player2RoundValueTotal }
    if (player1RoundValueTotal !== player2RoundValueTotal) return { finished: true, winnerId: player1RoundValueTotal > player2RoundValueTotal ? input.player1Id : input.player2Id, reason: 'ROUND_VALUE_TIEBREAK', player1RoundValueTotal, player2RoundValueTotal }
    return { finished: true, winnerId: null, reason: 'DRAW', player1RoundValueTotal, player2RoundValueTotal }
}
