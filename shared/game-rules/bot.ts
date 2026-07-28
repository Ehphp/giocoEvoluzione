import { ADAPTATION_IDS } from './types.ts'
import { EVOLVE_VALUE, MAX_ADAPTATION_LEVEL, NATURAL_ADVANTAGE, TOTAL_ROUNDS } from './catalog.ts'
import { getAdaptationRoundValue, isAdaptationEvolvable, isAdaptationUsable } from './engine.ts'
import type { ActionType, AdaptationCollection, AdaptationId, EnvironmentalCrisisDefinition } from './types.ts'

export type BotRoundAction = { trait: AdaptationId; actionType: ActionType }
export type SelectBotActionInput = { adaptations: AdaptationCollection; roundEvent: EnvironmentalCrisisDefinition; roundNumber: number; publicOpponentAdaptations?: AdaptationCollection; random?: () => number }
export function getUsableBotAdaptations(adaptations: AdaptationCollection): AdaptationId[] { return ADAPTATION_IDS.filter((adaptation) => isAdaptationUsable(adaptations, adaptation)) }
export function getEvolvableBotAdaptations(adaptations: AdaptationCollection): AdaptationId[] { return ADAPTATION_IDS.filter((adaptation) => isAdaptationEvolvable(adaptations, adaptation)) }
export function getLegalBotActions(adaptations: AdaptationCollection): BotRoundAction[] { return ADAPTATION_IDS.flatMap((adaptation) => [...(isAdaptationEvolvable(adaptations, adaptation) ? [{ trait: adaptation, actionType: 'EVOLVE' as const }] : []), ...(isAdaptationUsable(adaptations, adaptation) ? [{ trait: adaptation, actionType: 'USE' as const }] : [])]) }
function pickRandom<T>(items: readonly T[], random: () => number): T { if (!items.length) throw new Error('Cannot select from an empty collection.'); return items[Math.floor(random() * items.length)] ?? items[0]! }
function estimateNaturalAdvantage(adaptation: AdaptationId, opponent: AdaptationCollection | undefined): number { if (!opponent) return 0.2; const plausibleUses = ADAPTATION_IDS.filter((candidate) => isAdaptationUsable(opponent, candidate)); return plausibleUses.length ? Number(plausibleUses.some((candidate) => NATURAL_ADVANTAGE[adaptation] === candidate)) / plausibleUses.length : 0 }
export function selectBotAction({ adaptations, roundEvent, roundNumber, publicOpponentAdaptations, random = Math.random }: SelectBotActionInput): BotRoundAction {
    const legalActions = getLegalBotActions(adaptations)
    const scored = legalActions.map((action) => ({ action, score: action.actionType === 'EVOLVE' ? EVOLVE_VALUE + (MAX_ADAPTATION_LEVEL - adaptations[action.trait].level) * 1.5 * (TOTAL_ROUNDS - roundNumber + 1) / TOTAL_ROUNDS : getAdaptationRoundValue(roundEvent, adaptations, action.trait) + estimateNaturalAdvantage(action.trait, publicOpponentAdaptations) }))
    const bestScore = Math.max(...scored.map(({ score }) => score))
    return pickRandom(scored.filter(({ score }) => score === bestScore).map(({ action }) => action), random)
}
