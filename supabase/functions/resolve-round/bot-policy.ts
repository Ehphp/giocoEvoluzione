import { ADAPTATION_IDS, type AdaptationCollection, type AdaptationId, type EnvironmentalCrisisDefinition } from '../../../shared/game-rules/types.ts'
import { EVOLVE_VALUE, MAX_ADAPTATION_LEVEL, NATURAL_ADVANTAGE, TOTAL_ROUNDS } from '../../../shared/game-rules/catalog.ts'
import { getAdaptationRoundValue, isAdaptationEvolvable, isAdaptationUsable } from '../../../shared/game-rules/engine.ts'
export type EdgeBotRoundAction = { trait: AdaptationId; actionType: 'USE' | 'EVOLVE' }
export type SelectEdgeBotActionInput = { traits: AdaptationCollection; roundEvent: EnvironmentalCrisisDefinition; roundNumber: number; publicOpponentTraits?: AdaptationCollection; random?: () => number }
function pickRandom<T>(items: readonly T[], random: () => number): T { if (!items.length) throw new Error('Cannot select from an empty collection.'); return items[Math.floor(random() * items.length)] ?? items[0]! }
function bonusEstimate(adaptation: AdaptationId, opponent: AdaptationCollection | undefined) { const possible = opponent ? ADAPTATION_IDS.filter((candidate) => isAdaptationUsable(opponent, candidate)) : ADAPTATION_IDS; return possible.length ? Number(possible.some((candidate) => NATURAL_ADVANTAGE[adaptation] === candidate)) / possible.length : 0 }
export function selectEdgeBotAction({ traits, roundEvent, roundNumber, publicOpponentTraits, random = Math.random }: SelectEdgeBotActionInput): EdgeBotRoundAction {
  const actions = ADAPTATION_IDS.flatMap((trait) => [...(isAdaptationEvolvable(traits, trait) ? [{ trait, actionType: 'EVOLVE' as const }] : []), ...(isAdaptationUsable(traits, trait) ? [{ trait, actionType: 'USE' as const }] : [])])
  const scored = actions.map((action) => ({ action, score: action.actionType === 'EVOLVE' ? EVOLVE_VALUE + (MAX_ADAPTATION_LEVEL - traits[action.trait].level) * 1.5 * (TOTAL_ROUNDS - roundNumber + 1) / TOTAL_ROUNDS : getAdaptationRoundValue(roundEvent, traits, action.trait) + bonusEstimate(action.trait, publicOpponentTraits) }))
  const best = Math.max(...scored.map(({ score }) => score))
  return pickRandom(scored.filter(({ score }) => score === best).map(({ action }) => action), random)
}
