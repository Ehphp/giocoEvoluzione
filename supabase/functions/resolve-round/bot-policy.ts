import { createLookaheadPolicy, getLegalBotActions, randomPolicy, selectBotAction, type BotRoundAction, type SelectBotActionInput } from '../../../shared/game-rules/index.ts'

export type EdgeBotRoundAction = BotRoundAction
export type SelectEdgeBotActionInput = {
  traits: SelectBotActionInput['adaptations']; combatMutationState?: SelectBotActionInput['combatMutationState']; roundEvent: SelectBotActionInput['roundEvent']; roundNumber: number
  publicOpponentTraits?: SelectBotActionInput['publicOpponentAdaptations']; publicOpponentCombatMutationState?: SelectBotActionInput['publicOpponentCombatMutationState']; nextRoundEvent?: SelectBotActionInput['roundEvent'] | null; random?: () => number; difficulty?: 'EASY' | 'NORMAL' | 'HARD'
}
/** Edge adapter intentionally delegates to the shared policy source of truth. */
export function selectEdgeBotAction({ traits, combatMutationState, roundEvent, roundNumber, publicOpponentTraits, publicOpponentCombatMutationState, nextRoundEvent = null, random, difficulty = 'NORMAL' }: SelectEdgeBotActionInput): EdgeBotRoundAction {
  const legalActions = getLegalBotActions(traits)
  if (difficulty === 'EASY') return randomPolicy.selectAction({ adaptations: traits, combatMutationState, roundEvent, roundNumber, publicOpponentAdaptations: publicOpponentTraits, publicOpponentCombatMutationState, ownScore: 0, opponentScore: 0, nextRoundEvent, publicHistory: [], legalActions, random: random ?? Math.random })
  if (difficulty === 'HARD') return createLookaheadPolicy({ depth: 2 }).selectAction({ adaptations: traits, combatMutationState, roundEvent, roundNumber, publicOpponentAdaptations: publicOpponentTraits, publicOpponentCombatMutationState, ownScore: 0, opponentScore: 0, nextRoundEvent, publicHistory: [], legalActions, random: random ?? Math.random })
  return selectBotAction({ adaptations: traits, combatMutationState, roundEvent, roundNumber, publicOpponentAdaptations: publicOpponentTraits, publicOpponentCombatMutationState, random })
}
