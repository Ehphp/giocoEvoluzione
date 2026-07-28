import { heuristicPolicy, getEvolvableBotAdaptations, getLegalBotActions, getUsableBotAdaptations, type BotRoundAction } from './bot-policies.ts'
import type { AdaptationCollection, EnvironmentalCrisisDefinition } from './types.ts'

export { getEvolvableBotAdaptations, getLegalBotActions, getUsableBotAdaptations }
export type { BotRoundAction }
export type SelectBotActionInput = { adaptations: AdaptationCollection; roundEvent: EnvironmentalCrisisDefinition; roundNumber: number; publicOpponentAdaptations?: AdaptationCollection; random?: () => number }
/** Compatibility adapter for persisted games; it delegates to the named heuristic policy. */
export function selectBotAction({ adaptations, roundEvent, roundNumber, publicOpponentAdaptations, random = Math.random }: SelectBotActionInput): BotRoundAction {
    return heuristicPolicy.selectAction({ adaptations, roundEvent, roundNumber, publicOpponentAdaptations, ownScore: 0, opponentScore: 0, nextRoundEvent: null, publicHistory: [], legalActions: getLegalBotActions(adaptations), random })
}
