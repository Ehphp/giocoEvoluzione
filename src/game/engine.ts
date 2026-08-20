export { getCombatMutationUseBonus, getCombatMutationUsePreview, getRoundPoints, isAdaptationEvolvable as isTraitEvolvable, isAdaptationUsable as isTraitUsable, resolveRound } from '../../shared/game-rules/engine.ts'
import { getAdaptationRoundValue } from '../../shared/game-rules/engine.ts'; import type { ResolveRoundInput, TraitCollection, TraitType } from './types.ts'
export function getTraitRoundValue(roundEvent: ResolveRoundInput['roundEvent'], traits: TraitCollection, trait: TraitType) { return getAdaptationRoundValue(roundEvent, traits, trait) }
