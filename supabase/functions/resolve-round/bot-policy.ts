import { createLookaheadPolicy, getLegalBotActions, randomPolicy, selectBotAction, type BotRoundAction, type SelectBotActionInput } from '../../../shared/game-rules/index.ts'

export type EdgeBotRoundAction = BotRoundAction
export type SelectEdgeBotActionInput = {
  traits: SelectBotActionInput['adaptations']; roundEvent: SelectBotActionInput['roundEvent']; roundNumber: number
  publicOpponentTraits?: SelectBotActionInput['publicOpponentAdaptations']; nextRoundEvent?: SelectBotActionInput['roundEvent'] | null; random?: () => number; difficulty?: 'EASY' | 'NORMAL' | 'HARD'
}
/** Edge adapter intentionally delegates to the shared policy source of truth. */
export function selectEdgeBotAction({ traits, roundEvent, roundNumber, publicOpponentTraits, nextRoundEvent = null, random, difficulty = 'NORMAL' }: SelectEdgeBotActionInput): EdgeBotRoundAction {
  const legalActions = getLegalBotActions(traits)
  if (difficulty === 'EASY') return randomPolicy.selectAction({ adaptations: traits, roundEvent, roundNumber, publicOpponentAdaptations: publicOpponentTraits, ownScore: 0, opponentScore: 0, nextRoundEvent, publicHistory: [], legalActions, random: random ?? Math.random })
  if (difficulty === 'HARD') return createLookaheadPolicy({ depth: 2 }).selectAction({ adaptations: traits, roundEvent, roundNumber, publicOpponentAdaptations: publicOpponentTraits, ownScore: 0, opponentScore: 0, nextRoundEvent, publicHistory: [], legalActions, random: random ?? Math.random })
  return selectBotAction({ adaptations: traits, roundEvent, roundNumber, publicOpponentAdaptations: publicOpponentTraits, random })
}
