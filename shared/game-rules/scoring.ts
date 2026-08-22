import {
    BASE_USE_VALUE,
    EVOLVE_ROUND_VALUE,
    LEVEL_BONUS,
    MAX_ADAPTATION_LEVEL,
    NATURAL_ADVANTAGE,
    NATURAL_ADVANTAGE_BONUS,
} from './catalog.ts'
import type {
    ActionType,
    AdaptationCollection,
    AdaptationId,
    EnvironmentalCrisisDefinition,
    PlayerRoundAction,
    RoundValueBreakdown,
} from './types.ts'

export function getValidatedAdaptationState(adaptations: AdaptationCollection, adaptation: AdaptationId) {
    const state = adaptations[adaptation]
    if (
        !state ||
        !Number.isInteger(state.level) ||
        state.level < 0 ||
        state.level > MAX_ADAPTATION_LEVEL ||
        typeof state.exhausted !== 'boolean'
    )
        throw new Error(`Invalid adaptation state for "${adaptation}".`)
    return state
}

export function getNaturalAdvantageBonus(ownAction: PlayerRoundAction, opponentAction: PlayerRoundAction): number {
    return ownAction.actionType === 'USE' &&
        opponentAction.actionType === 'USE' &&
        NATURAL_ADVANTAGE[ownAction.trait] === opponentAction.trait
        ? NATURAL_ADVANTAGE_BONUS
        : 0
}

export function getValidatedAdaptationUseBreakdown(
    roundEvent: EnvironmentalCrisisDefinition,
    adaptations: AdaptationCollection,
    adaptation: AdaptationId,
    matchupBonus = 0,
    mutationBonus = 0,
): RoundValueBreakdown {
    const state = getValidatedAdaptationState(adaptations, adaptation)
    const eventModifier = roundEvent.modifiers[adaptation]
    if (!Number.isFinite(eventModifier))
        throw new Error(`Invalid event modifier for adaptation "${adaptation}" in "${roundEvent.id}".`)
    const effectiveLevel = Math.min(state.level, MAX_ADAPTATION_LEVEL)
    const levelContribution = LEVEL_BONUS[effectiveLevel]!
    const appliedEventEffects = roundEvent.effects
        .filter((effect) => effect.trait === adaptation)
        .map((effect) => ({ ...effect, contribution: effect.modifier }))
    if (!Number.isFinite(mutationBonus) || mutationBonus < 0) throw new Error('Invalid combat mutation bonus.')
    return {
        actionType: 'USE',
        baseContribution: BASE_USE_VALUE,
        levelContribution,
        eventModifier,
        matchupBonus,
        mutationBonus,
        originalLevel: state.level,
        effectiveLevel,
        total: BASE_USE_VALUE + levelContribution + eventModifier + matchupBonus + mutationBonus,
        appliedEventEffects,
    }
}

export function getValidatedActionBreakdown(
    roundEvent: EnvironmentalCrisisDefinition,
    adaptations: AdaptationCollection,
    adaptation: AdaptationId,
    actionType: ActionType,
    matchupBonus = 0,
    mutationBonus = 0,
): RoundValueBreakdown {
    if (actionType === 'USE')
        return getValidatedAdaptationUseBreakdown(roundEvent, adaptations, adaptation, matchupBonus, mutationBonus)
    if (actionType === 'ACTIVATE_MUTATION') {
        const state = getValidatedAdaptationState(adaptations, adaptation)
        return {
            actionType,
            baseContribution: 0,
            levelContribution: 0,
            eventModifier: 0,
            matchupBonus: 0,
            mutationBonus: 0,
            originalLevel: state.level,
            effectiveLevel: Math.min(state.level, MAX_ADAPTATION_LEVEL),
            total: 0,
            appliedEventEffects: [],
        }
    }
    const state = getValidatedAdaptationState(adaptations, adaptation)
    if (!Number.isFinite(mutationBonus) || mutationBonus < 0) throw new Error('Invalid combat mutation bonus.')
    return {
        actionType: 'EVOLVE',
        baseContribution: EVOLVE_ROUND_VALUE,
        levelContribution: 0,
        eventModifier: 0,
        matchupBonus: 0,
        mutationBonus,
        originalLevel: state.level,
        effectiveLevel: Math.min(state.level, MAX_ADAPTATION_LEVEL),
        total: EVOLVE_ROUND_VALUE + mutationBonus,
        appliedEventEffects: [],
    }
}
