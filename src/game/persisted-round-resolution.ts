import { FINAL_ROUND_NUMBER } from './config.ts'
import { resolveRound } from './engine.ts'
import type {
    PlayerRoundAction,
    RoundEventDefinition,
    RoundValueBreakdown,
    TraitCollection,
} from './types.ts'

export type PersistedRoundResolutionData = {
    awardedPoints: number
    roundEventId: string
    player1Action: PlayerRoundAction
    player2Action: PlayerRoundAction
    player1Breakdown: RoundValueBreakdown
    player2Breakdown: RoundValueBreakdown
    player1PointsAwarded: number
    player2PointsAwarded: number
    player1TraitsAfter: TraitCollection
    player2TraitsAfter: TraitCollection
    player1ScoreAfter: number
    player2ScoreAfter: number
    statusAfter: 'REVEALING' | 'FINISHED'
    winnerIdAfter: string | null
    finishedAt: string | null
    durationMs: number | null
}

export type PersistedRoundResolution = {
    player_1_value: number
    player_2_value: number
    winner_id: string | null
    resolution_data: PersistedRoundResolutionData
}

export function buildPersistedRoundResolution(params: {
    roundNumber: number
    roundEvent: RoundEventDefinition
    player1Id: string
    player2Id: string
    player1Score: number
    player2Score: number
    player1Traits: TraitCollection
    player2Traits: TraitCollection
    player1Action: PlayerRoundAction
    player2Action: PlayerRoundAction
    startedAt: string | null
    now?: () => string
}): PersistedRoundResolution {
    const resolution = resolveRound({
        roundNumber: params.roundNumber,
        roundEvent: params.roundEvent,
        player1Id: params.player1Id,
        player2Id: params.player2Id,
        player1Traits: params.player1Traits,
        player2Traits: params.player2Traits,
        player1Action: params.player1Action,
        player2Action: params.player2Action,
    })
    const player1ScoreAfter = params.player1Score + resolution.player1ScoreDelta
    const player2ScoreAfter = params.player2Score + resolution.player2ScoreDelta
    const isFinalRound = params.roundNumber === FINAL_ROUND_NUMBER
    const finishedAt = isFinalRound ? (params.now ?? (() => new Date().toISOString()))() : null
    const winnerIdAfter = isFinalRound
        ? player1ScoreAfter === player2ScoreAfter
            ? null
            : player1ScoreAfter > player2ScoreAfter
                ? params.player1Id
                : params.player2Id
        : null

    return {
        player_1_value: resolution.player1.roundValue,
        player_2_value: resolution.player2.roundValue,
        winner_id: resolution.winnerId,
        resolution_data: {
            awardedPoints: resolution.awardedPoints,
            roundEventId: params.roundEvent.id,
            player1Action: params.player1Action,
            player2Action: params.player2Action,
            player1Breakdown: resolution.player1.breakdown,
            player2Breakdown: resolution.player2.breakdown,
            player1PointsAwarded: resolution.player1ScoreDelta,
            player2PointsAwarded: resolution.player2ScoreDelta,
            player1TraitsAfter: resolution.player1.traits,
            player2TraitsAfter: resolution.player2.traits,
            player1ScoreAfter,
            player2ScoreAfter,
            statusAfter: isFinalRound ? 'FINISHED' : 'REVEALING',
            winnerIdAfter,
            finishedAt,
            durationMs:
                params.startedAt && finishedAt
                    ? new Date(finishedAt).getTime() - new Date(params.startedAt).getTime()
                    : null,
        },
    }
}
