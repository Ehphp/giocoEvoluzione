import { COOLDOWN_ROUNDS, MAX_ADAPTATION_LEVEL, ROUND_WIN_POINTS, TOTAL_ROUNDS, WINS_TO_WIN } from './catalog.ts'
import { getNaturalAdvantageBonus, getValidatedActionBreakdown, getValidatedAdaptationUseBreakdown } from './scoring.ts'
import type { AdaptationCollection, AdaptationId, PlayerRoundAction, ResolveRoundInput, EnvironmentalCrisisDefinition, RoundResolution } from './types.ts'

function cloneAdaptations(adaptations: AdaptationCollection): AdaptationCollection { return Object.fromEntries(Object.entries(adaptations).map(([adaptation, state]) => [adaptation, { ...state, level: Math.min(state.level, MAX_ADAPTATION_LEVEL) }])) as AdaptationCollection }
export function isAdaptationUsable(adaptations: AdaptationCollection, adaptation: AdaptationId): boolean { return adaptations[adaptation].cooldown === 0 }
export function isAdaptationEvolvable(adaptations: AdaptationCollection, adaptation: AdaptationId): boolean { return adaptations[adaptation].level < MAX_ADAPTATION_LEVEL }
export function getRoundPoints(roundNumber: number): number { return roundNumber >= 1 && roundNumber <= TOTAL_ROUNDS ? ROUND_WIN_POINTS : 0 }
export function getAdaptationRoundValue(roundEvent: EnvironmentalCrisisDefinition, adaptations: AdaptationCollection, adaptation: AdaptationId): number { return getValidatedAdaptationUseBreakdown(roundEvent, adaptations, adaptation).total }
export function hasClinchedMatch(player1Score: number, player2Score: number): boolean { return player1Score >= WINS_TO_WIN || player2Score >= WINS_TO_WIN }

function resolvePlayerAction(input: ResolveRoundInput, adaptations: AdaptationCollection, action: PlayerRoundAction, opponentAction: PlayerRoundAction) {
    const matchupBonus = getNaturalAdvantageBonus(action, opponentAction)
    const breakdown = getValidatedActionBreakdown(input.roundEvent, adaptations, action.trait, action.actionType, matchupBonus)
    const nextAdaptations = cloneAdaptations(adaptations)
    for (const state of Object.values(nextAdaptations)) state.cooldown = Math.max(0, state.cooldown - 1)
    if (action.actionType === 'EVOLVE') {
        if (!isAdaptationEvolvable(adaptations, action.trait)) throw new Error(`Adaptation ${action.trait} is already at the maximum level and cannot evolve.`)
        nextAdaptations[action.trait].level += 1
        return { roundValue: breakdown.total, breakdown, traits: nextAdaptations }
    }
    if (!isAdaptationUsable(adaptations, action.trait)) throw new Error(`Adaptation ${action.trait} is in recovery and cannot be used.`)
    nextAdaptations[action.trait].cooldown = COOLDOWN_ROUNDS
    return { roundValue: breakdown.total, breakdown, traits: nextAdaptations }
}

export function resolveRound(input: ResolveRoundInput): RoundResolution {
    if (input.alreadyResolved) throw new Error(`Round ${input.roundNumber} has already been resolved.`)
    if (input.roundNumber < 1 || input.roundNumber > TOTAL_ROUNDS) throw new Error(`Round ${input.roundNumber} is outside the best-of-seven match.`)
    const player1 = resolvePlayerAction(input, input.player1Traits, input.player1Action, input.player2Action)
    const player2 = resolvePlayerAction(input, input.player2Traits, input.player2Action, input.player1Action)
    const player1Won = player1.roundValue > player2.roundValue
    const player2Won = player2.roundValue > player1.roundValue
    return { roundNumber: input.roundNumber, roundEvent: input.roundEvent, player1: { ...input.player1Action, ...player1 }, player2: { ...input.player2Action, ...player2 }, winnerId: player1Won ? input.player1Id : player2Won ? input.player2Id : null, awardedPoints: getRoundPoints(input.roundNumber), player1ScoreDelta: player1Won ? ROUND_WIN_POINTS : 0, player2ScoreDelta: player2Won ? ROUND_WIN_POINTS : 0 }
}
