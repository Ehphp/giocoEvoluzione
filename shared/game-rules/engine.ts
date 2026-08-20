import { MAX_ADAPTATION_LEVEL, ROUND_WIN_POINTS, TOTAL_ROUNDS, WINS_TO_WIN } from './catalog.ts'
import { getNaturalAdvantageBonus, getValidatedActionBreakdown, getValidatedAdaptationUseBreakdown } from './scoring.ts'
import { createInitialCombatMutationState } from './state.ts'
import type { AdaptationCollection, AdaptationId, CombatMutationEffect, CombatMutationState, PlayerRoundAction, ResolveRoundInput, EnvironmentalCrisisDefinition, RoundResolution } from './types.ts'

function cloneAdaptations(adaptations: AdaptationCollection): AdaptationCollection { return Object.fromEntries(Object.entries(adaptations).map(([adaptation, state]) => [adaptation, { ...state }])) as AdaptationCollection }
function cloneCombatMutationState(state: CombatMutationState): CombatMutationState { return { ...state } }
export function isAdaptationUsable(adaptations: AdaptationCollection, adaptation: AdaptationId): boolean { return !adaptations[adaptation].exhausted }
export function isAdaptationEvolvable(adaptations: AdaptationCollection, adaptation: AdaptationId): boolean { const state = adaptations[adaptation]; return state.level < MAX_ADAPTATION_LEVEL || state.exhausted }
export function getRoundPoints(roundNumber: number): number { return roundNumber >= 1 && roundNumber <= TOTAL_ROUNDS ? ROUND_WIN_POINTS : 0 }
/** The only public preview of the fixed Adaptive Core rule. */
export function getCombatMutationUseBonus(state: CombatMutationState | null | undefined): number { return state?.adaptiveCoreStatus === 'ARMED' ? 1 : 0 }
/** Presentation and bot previews use this rather than reproducing mutation conditions. */
export function getCombatMutationUsePreview(state: CombatMutationState | null | undefined, adaptation: AdaptationId) {
    return {
        mutationBonus: getCombatMutationUseBonus(state),
        elasticLimbsWillPreserveAgility: adaptation === 'AGILITY' && !state?.elasticLimbsUsed,
    }
}
/** Shared transition preview used by both resolution and bot evaluation. */
export function getCombatMutationStateAfterEvolve(state: CombatMutationState | null | undefined): CombatMutationState {
    const nextState = cloneCombatMutationState(state ?? createInitialCombatMutationState())
    if (nextState.adaptiveCoreStatus === 'DORMANT') nextState.adaptiveCoreStatus = 'ARMED'
    return nextState
}
export function getAdaptationRoundValue(roundEvent: EnvironmentalCrisisDefinition, adaptations: AdaptationCollection, adaptation: AdaptationId, combatMutationState?: CombatMutationState): number { return getValidatedAdaptationUseBreakdown(roundEvent, adaptations, adaptation, 0, getCombatMutationUseBonus(combatMutationState)).total }
export function hasClinchedMatch(player1Score: number, player2Score: number): boolean { return player1Score >= WINS_TO_WIN || player2Score >= WINS_TO_WIN }

function resolvePlayerAction(input: ResolveRoundInput, adaptations: AdaptationCollection, combatMutationState: CombatMutationState, action: PlayerRoundAction, opponentAction: PlayerRoundAction) {
    const nextAdaptations = cloneAdaptations(adaptations)
    const nextCombatMutationState = cloneCombatMutationState(combatMutationState)
    const mutationEffects: CombatMutationEffect[] = []
    if (action.actionType === 'EVOLVE') {
        if (!isAdaptationEvolvable(adaptations, action.trait)) throw new Error(`Adaptation ${action.trait} is already available at the maximum level; EVOLVE would produce no transition.`)
        const breakdown = getValidatedActionBreakdown(input.roundEvent, adaptations, action.trait, action.actionType)
        if (nextAdaptations[action.trait].level < MAX_ADAPTATION_LEVEL) nextAdaptations[action.trait].level += 1
        nextAdaptations[action.trait].exhausted = false
        if (nextCombatMutationState.adaptiveCoreStatus === 'DORMANT') {
            mutationEffects.push({ id: 'ADAPTIVE_CORE', effect: 'CORE_ARMED' })
        }
        return { roundValue: breakdown.total, breakdown, traits: nextAdaptations, combatMutationState: getCombatMutationStateAfterEvolve(nextCombatMutationState), mutationEffects }
    }
    if (!isAdaptationUsable(adaptations, action.trait)) throw new Error(`Adaptation ${action.trait} is exhausted and cannot be used.`)
    const matchupBonus = getNaturalAdvantageBonus(action, opponentAction)
    const mutationPreview = getCombatMutationUsePreview(combatMutationState, action.trait)
    const mutationBonus = mutationPreview.mutationBonus
    const breakdown = getValidatedActionBreakdown(input.roundEvent, adaptations, action.trait, action.actionType, matchupBonus, mutationBonus)
    if (nextCombatMutationState.adaptiveCoreStatus === 'ARMED') {
        nextCombatMutationState.adaptiveCoreStatus = 'CONSUMED'
        mutationEffects.push({ id: 'ADAPTIVE_CORE', effect: 'ROUND_VALUE_BONUS', value: 1 })
    }
    if (mutationPreview.elasticLimbsWillPreserveAgility) {
        nextCombatMutationState.elasticLimbsUsed = true
        mutationEffects.push({ id: 'ELASTIC_LIMBS', effect: 'AGILITY_PRESERVED' })
    } else {
        nextAdaptations[action.trait].exhausted = true
    }
    return { roundValue: breakdown.total, breakdown, traits: nextAdaptations, combatMutationState: nextCombatMutationState, mutationEffects }
}

export function resolveRound(input: ResolveRoundInput): RoundResolution {
    if (input.alreadyResolved) throw new Error(`Round ${input.roundNumber} has already been resolved.`)
    if (input.roundNumber < 1 || input.roundNumber > TOTAL_ROUNDS) throw new Error(`Round ${input.roundNumber} is outside the best-of-seven match.`)
    const player1 = resolvePlayerAction(input, input.player1Traits, input.player1CombatMutationState ?? createInitialCombatMutationState(), input.player1Action, input.player2Action)
    const player2 = resolvePlayerAction(input, input.player2Traits, input.player2CombatMutationState ?? createInitialCombatMutationState(), input.player2Action, input.player1Action)
    const player1Won = player1.roundValue > player2.roundValue
    const player2Won = player2.roundValue > player1.roundValue
    const awardedPoints = player1Won || player2Won ? getRoundPoints(input.roundNumber) : 0
    return { roundNumber: input.roundNumber, roundEvent: input.roundEvent, player1: { ...input.player1Action, ...player1 }, player2: { ...input.player2Action, ...player2 }, winnerId: player1Won ? input.player1Id : player2Won ? input.player2Id : null, awardedPoints, player1ScoreDelta: player1Won ? awardedPoints : 0, player2ScoreDelta: player2Won ? awardedPoints : 0 }
}
