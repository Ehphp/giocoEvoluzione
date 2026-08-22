import {
    heuristicPolicy,
    getEvolvableBotAdaptations,
    getLegalBotActions,
    getUsableBotAdaptations,
    type BotRoundAction,
} from './bot-policies.ts'
import type {
    AdaptationCollection,
    CombatMutationLoadout,
    CombatMutationState,
    EnvironmentalCrisisDefinition,
    SymbiosisLink,
} from './types.ts'

export { getEvolvableBotAdaptations, getLegalBotActions, getUsableBotAdaptations }
export type { BotRoundAction }
export type SelectBotActionInput = {
    adaptations: AdaptationCollection
    combatMutationState: CombatMutationState
    combatMutationLoadout: CombatMutationLoadout
    roundEvent: EnvironmentalCrisisDefinition
    roundNumber: number
    ruleVersion: string
    publicOpponentAdaptations: AdaptationCollection
    publicOpponentCombatMutationState: CombatMutationState
    publicOpponentCombatMutationLoadout: CombatMutationLoadout
    symbiosisLinks?: readonly SymbiosisLink[]
    random?: () => number
}
/** Compatibility adapter for persisted games; it delegates to the named heuristic policy. */
export function selectBotAction({
    adaptations,
    combatMutationState,
    combatMutationLoadout,
    roundEvent,
    roundNumber,
    ruleVersion,
    publicOpponentAdaptations,
    publicOpponentCombatMutationState,
    publicOpponentCombatMutationLoadout,
    symbiosisLinks,
    random = Math.random,
}: SelectBotActionInput): BotRoundAction {
    return heuristicPolicy.selectAction({
        adaptations,
        combatMutationState,
        combatMutationLoadout,
        roundEvent,
        roundNumber,
        ruleVersion,
        publicOpponentAdaptations,
        publicOpponentCombatMutationState,
        publicOpponentCombatMutationLoadout,
        symbiosisLinks,
        ownScore: 0,
        opponentScore: 0,
        nextRoundEvent: null,
        publicHistory: [],
        legalActions: getLegalBotActions(adaptations),
        random,
    })
}
