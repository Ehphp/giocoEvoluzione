export { getRoundPoints, isGeneEvolvable as isTraitEvolvable, isGeneUsable as isTraitUsable, resolveRound } from '../../shared/game-rules/engine.ts'
import { getValidatedTraitRoundValue } from './scoring.ts'
import type { ResolveRoundInput, TraitCollection, TraitType } from './types.ts'
export function getTraitRoundValue(roundEvent: ResolveRoundInput['roundEvent'], traits: TraitCollection, trait: TraitType) { return getValidatedTraitRoundValue(roundEvent, traits, trait) }
