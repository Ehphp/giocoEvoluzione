import { ROUND_EVENT_DEFINITIONS } from '../../shared/game-rules/catalog.ts'
import { generateRoundEventSequence, getRoundEventById, getRoundEventForRound } from '../../shared/game-rules/state.ts'
import type { RoundEventDefinition, TraitType } from './types.ts'

export { ROUND_EVENT_DEFINITIONS, generateRoundEventSequence, getRoundEventById, getRoundEventForRound }
export function getRoundEventEffectsForTrait(roundEvent: RoundEventDefinition, trait: TraitType) {
    return roundEvent.effects.filter((effect) => effect.trait === trait)
}
