import { STANDARD_SCHEDULED_ROUNDS, createLookaheadPolicy, getLegalBotActions, randomPolicy, selectBotAction, type BotRoundAction, type SelectBotActionInput } from '../../../shared/game-rules/index.ts'

export type EdgeBotRoundAction = BotRoundAction
export type SelectEdgeBotActionInput = {
  traits: SelectBotActionInput['adaptations']; combatMutationState: SelectBotActionInput['combatMutationState']; combatMutationLoadout: SelectBotActionInput['combatMutationLoadout']; roundEvent: SelectBotActionInput['roundEvent']; roundNumber: number; scheduledRounds?: number; ruleVersion: SelectBotActionInput['ruleVersion']
  publicOpponentTraits: SelectBotActionInput['publicOpponentAdaptations']; publicOpponentCombatMutationState: SelectBotActionInput['publicOpponentCombatMutationState']; publicOpponentCombatMutationLoadout: SelectBotActionInput['publicOpponentCombatMutationLoadout']; symbiosisLinks?: SelectBotActionInput['symbiosisLinks']; nextRoundEvent?: SelectBotActionInput['roundEvent'] | null; random?: () => number; difficulty?: 'EASY' | 'NORMAL' | 'HARD'
}
/** Edge adapter intentionally delegates to the shared policy source of truth. */
export function selectEdgeBotAction({ traits, combatMutationState, combatMutationLoadout, roundEvent, roundNumber, scheduledRounds = STANDARD_SCHEDULED_ROUNDS, ruleVersion, publicOpponentTraits, publicOpponentCombatMutationState, publicOpponentCombatMutationLoadout, symbiosisLinks, nextRoundEvent = null, random, difficulty = 'NORMAL' }: SelectEdgeBotActionInput): EdgeBotRoundAction {
  const legalActions = getLegalBotActions(traits)
  if (difficulty === 'EASY') return randomPolicy.selectAction({ adaptations: traits, combatMutationState, combatMutationLoadout, roundEvent, roundNumber, scheduledRounds, ruleVersion, publicOpponentAdaptations: publicOpponentTraits, publicOpponentCombatMutationState, publicOpponentCombatMutationLoadout, symbiosisLinks, ownScore: 0, opponentScore: 0, nextRoundEvent, publicHistory: [], legalActions, random: random ?? Math.random })
  if (difficulty === 'HARD') return createLookaheadPolicy({ depth: 2 }).selectAction({ adaptations: traits, combatMutationState, combatMutationLoadout, roundEvent, roundNumber, scheduledRounds, ruleVersion, publicOpponentAdaptations: publicOpponentTraits, publicOpponentCombatMutationState, publicOpponentCombatMutationLoadout, symbiosisLinks, ownScore: 0, opponentScore: 0, nextRoundEvent, publicHistory: [], legalActions, random: random ?? Math.random })
  return selectBotAction({ adaptations: traits, combatMutationState, combatMutationLoadout, roundEvent, roundNumber, scheduledRounds, ruleVersion, publicOpponentAdaptations: publicOpponentTraits, publicOpponentCombatMutationState, publicOpponentCombatMutationLoadout, symbiosisLinks, random })
}
