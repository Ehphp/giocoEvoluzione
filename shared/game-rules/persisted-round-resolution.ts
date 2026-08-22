import { hasClinchedMatch, resolveRound } from './engine.ts'
import { cloneFineDelMondoActivations, resolveFineDelMondoDuration } from './fine-del-mondo.ts'
import { resolveMatchOutcome, type StoredRoundValue } from './match.ts'
import type {
    PlayerRoundAction,
    EnvironmentalCrisisDefinition,
    RoundValueBreakdown,
    AdaptationCollection,
    CombatMutationEffect,
    CombatMutationLoadout,
    CombatMutationState,
    FineDelMondoActivation,
    SymbiosisLink,
    SymbiosisRoundEvent,
} from './types.ts'

export type PersistedRoundResolutionData = {
    ruleVersion: string
    catalogSignature: string
    awardedPoints: number
    roundEventId: string
    player1Action: PlayerRoundAction
    player2Action: PlayerRoundAction
    player1Breakdown: RoundValueBreakdown
    player2Breakdown: RoundValueBreakdown
    player1PointsAwarded: number
    player2PointsAwarded: number
    player1TraitsAfter: AdaptationCollection
    player2TraitsAfter: AdaptationCollection
    player1CombatMutationLoadout: CombatMutationLoadout
    player2CombatMutationLoadout: CombatMutationLoadout
    player1CombatMutationStateBefore: CombatMutationState
    player2CombatMutationStateBefore: CombatMutationState
    player1CombatMutationStateAfter: CombatMutationState
    player2CombatMutationStateAfter: CombatMutationState
    player1MutationEffects: CombatMutationEffect[]
    player2MutationEffects: CombatMutationEffect[]
    symbiosisLinksBefore: SymbiosisLink[]
    symbiosisLinksAfter: SymbiosisLink[]
    symbiosisEvents: SymbiosisRoundEvent[]
    scheduledRoundsBefore: number
    scheduledRoundsAfter: number
    fineDelMondoActivationsBefore: FineDelMondoActivation[]
    fineDelMondoActivationsAfter: FineDelMondoActivation[]
    player1ScoreAfter: number
    player2ScoreAfter: number
    statusAfter: 'REVEALING' | 'FINISHED'
    winnerIdAfter: string | null
    finishedAt: string | null
    durationMs: number | null
    matchEndReason: 'CLINCH' | 'SCORE' | 'ROUND_VALUE_TIEBREAK' | 'DRAW' | null
    player1RoundValueTotal: number
    player2RoundValueTotal: number
}

export function buildPersistedRoundResolution(params: {
    roundNumber: number
    roundEvent: EnvironmentalCrisisDefinition
    player1Id: string
    player2Id: string
    player1Score: number
    player2Score: number
    player1Traits: AdaptationCollection
    player2Traits: AdaptationCollection
    ruleVersion: string
    player1CombatMutationLoadout: CombatMutationLoadout
    player2CombatMutationLoadout: CombatMutationLoadout
    player1CombatMutationState: CombatMutationState
    player2CombatMutationState: CombatMutationState
    symbiosisLinks?: readonly SymbiosisLink[]
    scheduledRounds?: number
    fineDelMondoActivations?: readonly FineDelMondoActivation[]
    fineDelMondoActivationOutcomes?: readonly FineDelMondoActivation[]
    player1Action: PlayerRoundAction
    player2Action: PlayerRoundAction
    priorRoundValues?: StoredRoundValue[]
    startedAt: string | null
    now?: () => string
}) {
    const scheduledRoundsBefore = params.scheduledRounds ?? 7
    const fineDelMondoActivationsBefore = cloneFineDelMondoActivations(params.fineDelMondoActivations ?? [])
    if (hasClinchedMatch(params.player1Score, params.player2Score, params.roundNumber - 1, scheduledRoundsBefore))
        throw new Error('The match was already clinched before this round.')
    const resolution = resolveRound(params)
    const fineDelMondoDuration = resolveFineDelMondoDuration({
        scheduledRounds: scheduledRoundsBefore,
        activationsBefore: fineDelMondoActivationsBefore,
        requests: resolution.fineDelMondoActivationRequests,
        resolvedActivations: params.fineDelMondoActivationOutcomes ?? [],
        resolvedRoundNumber: params.roundNumber,
    })
    const player1ScoreAfter = params.player1Score + resolution.player1ScoreDelta
    const player2ScoreAfter = params.player2Score + resolution.player2ScoreDelta
    const outcome = resolveMatchOutcome({
        player1Id: params.player1Id,
        player2Id: params.player2Id,
        player1Score: player1ScoreAfter,
        player2Score: player2ScoreAfter,
        resolvedRoundNumber: params.roundNumber,
        scheduledRounds: fineDelMondoDuration.scheduledRounds,
        storedRoundValues: [
            ...(params.priorRoundValues ?? []),
            { player1Value: resolution.player1.roundValue, player2Value: resolution.player2.roundValue },
        ],
    })
    const finishedAt = outcome.finished ? (params.now ?? (() => new Date().toISOString()))() : null
    return {
        player_1_value: resolution.player1.roundValue,
        player_2_value: resolution.player2.roundValue,
        winner_id: resolution.winnerId,
        resolution_data: {
            ruleVersion: params.ruleVersion,
            catalogSignature: params.ruleVersion,
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
            player1CombatMutationLoadout: params.player1CombatMutationLoadout,
            player2CombatMutationLoadout: params.player2CombatMutationLoadout,
            player1CombatMutationStateBefore: params.player1CombatMutationState,
            player2CombatMutationStateBefore: params.player2CombatMutationState,
            player1CombatMutationStateAfter: resolution.player1.combatMutationState,
            player2CombatMutationStateAfter: resolution.player2.combatMutationState,
            player1MutationEffects: resolution.player1.mutationEffects,
            player2MutationEffects: resolution.player2.mutationEffects,
            symbiosisLinksBefore: [...(params.symbiosisLinks ?? [])].map((link) => ({ ...link })),
            symbiosisLinksAfter: resolution.symbiosisLinks,
            symbiosisEvents: resolution.symbiosisEvents,
            scheduledRoundsBefore,
            scheduledRoundsAfter: fineDelMondoDuration.scheduledRounds,
            fineDelMondoActivationsBefore,
            fineDelMondoActivationsAfter: fineDelMondoDuration.activations,
            player1ScoreAfter,
            player2ScoreAfter,
            statusAfter: outcome.finished ? 'FINISHED' : 'REVEALING',
            winnerIdAfter: outcome.winnerId,
            finishedAt,
            durationMs:
                params.startedAt && finishedAt
                    ? new Date(finishedAt).getTime() - new Date(params.startedAt).getTime()
                    : null,
            matchEndReason: outcome.reason,
            player1RoundValueTotal: outcome.player1RoundValueTotal,
            player2RoundValueTotal: outcome.player2RoundValueTotal,
        } satisfies PersistedRoundResolutionData,
    }
}
