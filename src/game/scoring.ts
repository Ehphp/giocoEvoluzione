import { getValidatedActionBreakdown, getValidatedGeneState, getValidatedGeneUseBreakdown } from '../../shared/game-rules/scoring.ts'
import type { RoundEventDefinition, TraitCollection, TraitType } from './types.ts'

export const getValidatedTraitState = getValidatedGeneState
export const getValidatedTraitUseBreakdown = getValidatedGeneUseBreakdown
export { getValidatedActionBreakdown }
export function getValidatedTraitRoundValue(roundEvent: RoundEventDefinition, traits: TraitCollection, trait: TraitType) { return getValidatedGeneUseBreakdown(roundEvent, traits, trait).total }
