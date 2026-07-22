import { ENVIRONMENT_MODIFIERS, ENVIRONMENT_WEIGHT, MAX_EFFECTIVE_TRAIT_LEVEL } from './config'
import type { ActionType, Environment, RoundValueBreakdown, TraitCollection, TraitState, TraitType } from './types'

export function getValidatedEnvironmentModifier(environment: Environment, trait: TraitType): number {
    const environmentModifiers = ENVIRONMENT_MODIFIERS[environment]

    if (!environmentModifiers) {
        throw new Error(`Unknown environment "${environment}".`)
    }

    if (!(trait in environmentModifiers)) {
        throw new Error(`Unknown trait "${trait}" for environment "${environment}".`)
    }

    const modifier = environmentModifiers[trait]

    if (!Number.isFinite(modifier) || modifier < 0) {
        throw new Error(`Invalid environment modifier for "${environment}" and trait "${trait}".`)
    }

    return modifier
}

export function getValidatedTraitState(traits: TraitCollection, trait: TraitType): TraitState {
    const traitState = traits[trait]

    if (!traitState) {
        throw new Error(`Unknown trait "${trait}".`)
    }

    const { level, cooldown } = traitState

    if (!Number.isFinite(level) || !Number.isFinite(cooldown)) {
        throw new Error(`Invalid trait state for "${trait}": level and cooldown must be finite numbers.`)
    }

    if (level < 0 || cooldown < 0) {
        throw new Error(`Invalid trait state for "${trait}": level and cooldown cannot be negative.`)
    }

    return traitState
}

export function getValidatedTraitRoundValue(environment: Environment, traits: TraitCollection, trait: TraitType): number {
    return getValidatedTraitUseBreakdown(environment, traits, trait).total
}

export function getValidatedTraitUseBreakdown(
    environment: Environment,
    traits: TraitCollection,
    trait: TraitType,
): RoundValueBreakdown {
    const environmentModifier = getValidatedEnvironmentModifier(environment, trait)
    const traitState = getValidatedTraitState(traits, trait)
    const effectiveLevel = Math.min(traitState.level, MAX_EFFECTIVE_TRAIT_LEVEL)
    const environmentContribution = environmentModifier * ENVIRONMENT_WEIGHT
    const levelContribution = effectiveLevel

    return {
        actionType: 'USE',
        environmentModifier,
        environmentWeight: ENVIRONMENT_WEIGHT,
        environmentContribution,
        originalLevel: traitState.level,
        effectiveLevel,
        levelContribution,
        total: environmentContribution + levelContribution,
    }
}

export function getValidatedActionBreakdown(
    environment: Environment,
    traits: TraitCollection,
    trait: TraitType,
    actionType: ActionType,
): RoundValueBreakdown {
    const useBreakdown = getValidatedTraitUseBreakdown(environment, traits, trait)

    if (actionType === 'USE') {
        return useBreakdown
    }

    return {
        ...useBreakdown,
        actionType,
        environmentContribution: 0,
        levelContribution: 0,
        total: 0,
    }
}
