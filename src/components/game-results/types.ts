import type { CreatureVisual } from '../game-v2/gameSelectionAssets'
import type { CombatMutationEffect, RoundValueBreakdown, TraitType } from '../../game/types'

export type MatchResultOutcome = 'win' | 'loss' | 'draw'

export type ResultAction = {
    trait: TraitType
    actionType: 'USE' | 'EVOLVE'
} | { actionType: 'ACTIVATE_MUTATION'; mutationId: 'SYMBIOSIS'; sourceTrait: TraitType; targetTrait: TraitType }
  | { actionType: 'ACTIVATE_MUTATION'; mutationId: 'FINE_DEL_MONDO' }

export type ResultParticipant = {
    id: string
    name: string
    score: number
    creature: CreatureVisual
    tiebreakTotal: number | null
}

export type ResultMetric = {
    id: 'round-values' | 'tiebreak' | 'duration'
    label: string
    value: string
}

export type ResultRoundParticipant = {
    action: ResultAction | null
    value: number
    points: number | null
    breakdown: RoundValueBreakdown | null
    mutationEffects: CombatMutationEffect[]
}

export type MatchResultRound = {
    id: string
    number: number
    eventLabel: string | null
    outcome: MatchResultOutcome | 'draw'
    player: ResultRoundParticipant
    opponent: ResultRoundParticipant
    explanation: string
}

export type MatchResultViewModel = {
    outcome: MatchResultOutcome
    player: ResultParticipant
    opponent: ResultParticipant
    finalRoundNumber: number
    totalRounds: number
    background: string
    metrics: ResultMetric[]
    lastRound: MatchResultRound | null
    rounds: MatchResultRound[]
}
