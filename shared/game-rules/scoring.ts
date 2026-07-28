import { BASE_USE_VALUE, EVOLVE_ROUND_VALUE, LEVEL_BONUS, MAX_ADAPTATION_LEVEL, NATURAL_ADVANTAGE } from './catalog.ts'
import type { ActionType, AdaptationCollection, AdaptationId, EnvironmentalCrisisDefinition, RoundValueBreakdown } from './types.ts'

export function getValidatedAdaptationState(adaptations: AdaptationCollection, adaptation: AdaptationId) {
    const state = adaptations[adaptation]
    if (!state || !Number.isFinite(state.level) || !Number.isFinite(state.cooldown) || state.level < 0 || state.cooldown < 0) throw new Error(`Invalid adaptation state for "${adaptation}".`)
    return state
}

export function getNaturalAdvantageBonus(ownAction: { trait: AdaptationId; actionType: ActionType }, opponentAction: { trait: AdaptationId; actionType: ActionType }): number {
    return ownAction.actionType === 'USE' && opponentAction.actionType === 'USE' && NATURAL_ADVANTAGE[ownAction.trait] === opponentAction.trait ? 1 : 0
}

export function getValidatedAdaptationUseBreakdown(roundEvent: EnvironmentalCrisisDefinition, adaptations: AdaptationCollection, adaptation: AdaptationId, matchupBonus = 0): RoundValueBreakdown {
    const state = getValidatedAdaptationState(adaptations, adaptation)
    const eventModifier = roundEvent.modifiers[adaptation]
    if (!Number.isFinite(eventModifier)) throw new Error(`Invalid event modifier for adaptation "${adaptation}" in "${roundEvent.id}".`)
    const effectiveLevel = Math.min(state.level, MAX_ADAPTATION_LEVEL)
    const levelContribution = LEVEL_BONUS[effectiveLevel]!
    const appliedEventEffects = roundEvent.effects.filter((effect) => effect.trait === adaptation).map((effect) => ({ ...effect, contribution: effect.modifier }))
    return { actionType: 'USE', baseContribution: BASE_USE_VALUE, levelContribution, eventModifier, matchupBonus, originalLevel: state.level, effectiveLevel, total: BASE_USE_VALUE + levelContribution + eventModifier + matchupBonus, appliedEventEffects }
}

export function getValidatedActionBreakdown(roundEvent: EnvironmentalCrisisDefinition, adaptations: AdaptationCollection, adaptation: AdaptationId, actionType: ActionType, matchupBonus = 0): RoundValueBreakdown {
    if (actionType === 'USE') return getValidatedAdaptationUseBreakdown(roundEvent, adaptations, adaptation, matchupBonus)
    const state = getValidatedAdaptationState(adaptations, adaptation)
    return { actionType: 'EVOLVE', baseContribution: EVOLVE_ROUND_VALUE, levelContribution: 0, eventModifier: 0, matchupBonus: 0, originalLevel: state.level, effectiveLevel: Math.min(state.level, MAX_ADAPTATION_LEVEL), total: EVOLVE_ROUND_VALUE, appliedEventEffects: [] }
}
