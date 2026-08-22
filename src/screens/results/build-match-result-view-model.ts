import { TRAIT_LABELS } from '../../game/config'
import { getRoundEventById } from '../../game/round-events'
import { getRoundExplanation } from '../../game/round-result-explainer'
import { getRoundEventLabel } from '../../game/ui-context'
import type { CombatMutationEffect, PlayerRoundAction, RoundValueBreakdown } from '../../game/types'
import type { GameSnapshot, RoundResultRecord } from '../../lib/game-api'
import {
    DEFAULT_BATTLE_OPPONENT_CREATURE,
    DEFAULT_BATTLE_PLAYER_CREATURE,
    getBattleBackgroundForEvent,
} from '../battle/controller/gene-selection-assets'
import type {
    MatchResultOutcome,
    MatchResultRound,
    MatchResultViewModel,
    ResultAction,
    ResultMetric,
    ResultRoundParticipant,
} from './types'

type PersistedResolutionData = {
    awardedPoints?: number
    player1PointsAwarded?: number
    player2PointsAwarded?: number
    player1Action?: PlayerRoundAction
    player2Action?: PlayerRoundAction
    player1Breakdown?: RoundValueBreakdown
    player2Breakdown?: RoundValueBreakdown
    player1MutationEffects?: CombatMutationEffect[]
    player2MutationEffects?: CombatMutationEffect[]
    matchEndReason?: 'CLINCH' | 'SCORE' | 'ROUND_VALUE_TIEBREAK' | 'DRAW' | null
    player1RoundValueTotal?: number
    player2RoundValueTotal?: number
}

function asResolutionData(value: Record<string, unknown>): PersistedResolutionData {
    return value as PersistedResolutionData
}

function getRoundEvent(roundEventSequence: string[], roundNumber: number) {
    const eventId = roundEventSequence[roundNumber - 1]

    if (!eventId) {
        return null
    }

    try {
        return getRoundEventById(eventId)
    } catch {
        return null
    }
}

function formatDuration(startedAt: string | null, finishedAt: string | null): string | null {
    if (!startedAt || !finishedAt) {
        return null
    }

    const started = new Date(startedAt).getTime()
    const finished = new Date(finishedAt).getTime()

    if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) {
        return null
    }

    const minutes = Math.max(1, Math.round((finished - started) / 60_000))
    return `${minutes} min`
}

function getOutcome(winnerId: string | null, playerId: string): MatchResultOutcome {
    if (!winnerId) {
        return 'draw'
    }

    return winnerId === playerId ? 'win' : 'loss'
}

function getPoints(
    resolution: PersistedResolutionData,
    slot: 1 | 2,
    winnerId: string | null,
    playerId: string,
): number | null {
    const explicitPoints = slot === 1 ? resolution.player1PointsAwarded : resolution.player2PointsAwarded

    if (typeof explicitPoints === 'number') {
        return explicitPoints
    }

    if (typeof resolution.awardedPoints === 'number') {
        return winnerId === playerId ? resolution.awardedPoints : 0
    }

    return null
}

function getAction(resolution: PersistedResolutionData, slot: 1 | 2): ResultAction | null {
    const action = slot === 1 ? resolution.player1Action : resolution.player2Action

    if (!action) return null
    return action.actionType === 'ACTIVATE_MUTATION'
        ? action.mutationId === 'FINE_DEL_MONDO'
            ? { actionType: 'ACTIVATE_MUTATION', mutationId: 'FINE_DEL_MONDO' }
            : { actionType: 'ACTIVATE_MUTATION', mutationId: 'SYMBIOSIS', sourceTrait: action.sourceTrait, targetTrait: action.targetTrait }
        : { trait: action.trait, actionType: action.actionType }
}

function getBreakdown(resolution: PersistedResolutionData, slot: 1 | 2): RoundValueBreakdown | null {
    return (slot === 1 ? resolution.player1Breakdown : resolution.player2Breakdown) ?? null
}

function getMutationEffects(resolution: PersistedResolutionData, slot: 1 | 2): CombatMutationEffect[] {
    const effects = slot === 1 ? resolution.player1MutationEffects : resolution.player2MutationEffects
    return Array.isArray(effects) ? effects : []
}

function buildRound(snapshot: GameSnapshot, result: RoundResultRecord): MatchResultRound {
    const me = snapshot.me!
    const opponent = snapshot.opponent
    const resolution = asResolutionData(result.resolution_data)
    const event = getRoundEvent(snapshot.game.round_event_sequence, result.round_number)
    const player = {
        action: getAction(resolution, me.slot),
        value: me.slot === 1 ? result.player_1_value : result.player_2_value,
        points: getPoints(resolution, me.slot, result.winner_id, me.id),
        breakdown: getBreakdown(resolution, me.slot),
        mutationEffects: getMutationEffects(resolution, me.slot),
    } satisfies ResultRoundParticipant
    const opponentSlot = opponent?.slot === 1 ? 1 : 2
    const opponentId = opponent?.id ?? ''
    const opponentRound = {
        action: getAction(resolution, opponentSlot),
        value: opponentSlot === 1 ? result.player_1_value : result.player_2_value,
        points: getPoints(resolution, opponentSlot, result.winner_id, opponentId),
        breakdown: getBreakdown(resolution, opponentSlot),
        mutationEffects: getMutationEffects(resolution, opponentSlot),
    } satisfies ResultRoundParticipant
    const outcome = getOutcome(result.winner_id, me.id)

    return {
        id: result.id,
        number: result.round_number,
        eventLabel: event ? getRoundEventLabel(event) : null,
        outcome,
        player,
        opponent: opponentRound,
        explanation: getRoundExplanation({
            roundEventTitle: event?.title ?? null,
            meWon: result.winner_id ? result.winner_id === me.id : null,
            meActionType: player.action?.actionType ?? null,
            opponentActionType: opponentRound.action?.actionType ?? null,
            myBreakdown: player.breakdown,
            opponentBreakdown: opponentRound.breakdown,
        }),
    }
}

export function getResultActionLabel(action: ResultAction | null): string {
    if (!action) {
        return 'Dati azione non disponibili'
    }

    if (action.actionType === 'ACTIVATE_MUTATION') return action.mutationId === 'FINE_DEL_MONDO' ? 'Fine del mondo (0 PT)' : `${TRAIT_LABELS[action.sourceTrait]} ↔ ${TRAIT_LABELS[action.targetTrait]} (SIMBIOSI)`
    return `${TRAIT_LABELS[action.trait]} (${action.actionType === 'USE' ? 'USA' : 'EVOLVI'})`
}

export function buildMatchResultViewModel(snapshot: GameSnapshot, myScore: number, opponentScore: number): MatchResultViewModel | null {
    if (!snapshot.me) {
        return null
    }

    const rounds = [...snapshot.roundResults]
        .sort((left, right) => left.round_number - right.round_number)
        .map((result) => buildRound(snapshot, result))
    const finalRecord = [...snapshot.roundResults].sort((left, right) => right.round_number - left.round_number)[0] ?? null
    const finalResolution = finalRecord ? asResolutionData(finalRecord.resolution_data) : null
    const finalEvent = finalRecord ? getRoundEvent(snapshot.game.round_event_sequence, finalRecord.round_number) : null
    const matchOutcome = getOutcome(snapshot.game.winner_id, snapshot.me.id)
    const isTiebreak = finalResolution?.matchEndReason === 'ROUND_VALUE_TIEBREAK' || finalResolution?.matchEndReason === 'DRAW'
    const player1RoundValueTotal = finalResolution?.player1RoundValueTotal
    const player2RoundValueTotal = finalResolution?.player2RoundValueTotal
    const playerTiebreak = isTiebreak && typeof player1RoundValueTotal === 'number' && typeof player2RoundValueTotal === 'number'
        ? (snapshot.me.slot === 1 ? player1RoundValueTotal : player2RoundValueTotal)
        : null
    const opponentTiebreak = isTiebreak && typeof player1RoundValueTotal === 'number' && typeof player2RoundValueTotal === 'number'
        ? (snapshot.me.slot === 1 ? player2RoundValueTotal : player1RoundValueTotal)
        : null
    const playerRoundValues = snapshot.roundResults.reduce((total, result) => total + (snapshot.me!.slot === 1 ? result.player_1_value : result.player_2_value), 0)
    const opponentRoundValues = snapshot.roundResults.reduce((total, result) => total + (snapshot.me!.slot === 1 ? result.player_2_value : result.player_1_value), 0)
    const metrics: ResultMetric[] = []

    if (snapshot.roundResults.length > 0) {
        metrics.push({ id: 'round-values', label: 'Valori round', value: `${playerRoundValues} – ${opponentRoundValues}` })
    }

    if (playerTiebreak !== null && opponentTiebreak !== null) {
        metrics.push({ id: 'tiebreak', label: 'Tiebreak', value: `${playerTiebreak} – ${opponentTiebreak}` })
    }

    const duration = formatDuration(snapshot.game.started_at, snapshot.game.finished_at)
    if (duration) {
        metrics.push({ id: 'duration', label: 'Durata', value: duration })
    }

    return {
        outcome: matchOutcome,
        player: {
            id: snapshot.me.id,
            name: snapshot.me.nickname,
            score: myScore,
            creature: DEFAULT_BATTLE_PLAYER_CREATURE,
            tiebreakTotal: playerTiebreak,
        },
        opponent: {
            id: snapshot.opponent?.id ?? 'opponent',
            name: snapshot.opponent?.nickname ?? 'Avversario',
            score: opponentScore,
            creature: DEFAULT_BATTLE_OPPONENT_CREATURE,
            tiebreakTotal: opponentTiebreak,
        },
        finalRoundNumber: finalRecord?.round_number ?? snapshot.game.current_round,
        totalRounds: snapshot.game.scheduled_rounds,
        background: getBattleBackgroundForEvent(finalEvent?.id),
        metrics,
        lastRound: rounds.at(-1) ?? null,
        rounds,
    }
}
