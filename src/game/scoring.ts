import { BASE_USE_VALUE, EVENT_WEIGHT, MAX_EFFECTIVE_TRAIT_LEVEL } from './config.ts'
import { getRoundEventEffectsForTrait } from './round-events.ts'
import type { ActionType, RoundEventDefinition, RoundValueBreakdown, TraitCollection, TraitState, TraitType } from './types.ts'

export function getValidatedRoundEventModifier(roundEvent: RoundEventDefinition, trait: TraitType): {
    modifierTotal: number
    appliedEventEffects: RoundValueBreakdown['appliedEventEffects']
} {
    const effects = getRoundEventEffectsForTrait(roundEvent, trait)

    const appliedEventEffects = effects.map((effect) => {
        if (!Number.isFinite(effect.modifier)) {
            throw new Error(`Invalid round event effect for trait "${trait}" in event "${roundEvent.id}".`)
        }

        if (!effect.reason.trim()) {
            throw new Error(`Round event effect reason is required for trait "${trait}" in event "${roundEvent.id}".`)
        }

        return {
            ...effect,
            contribution: effect.modifier * EVENT_WEIGHT,
        }
    })

    return {
        modifierTotal: appliedEventEffects.reduce((sum, effect) => sum + effect.modifier, 0),
        appliedEventEffects,
    }
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

export function getValidatedTraitRoundValue(roundEvent: RoundEventDefinition, traits: TraitCollection, trait: TraitType): number {
    return getValidatedTraitUseBreakdown(roundEvent, traits, trait).total
}

export function getValidatedTraitUseBreakdown(
    roundEvent: RoundEventDefinition,
    traits: TraitCollection,
    trait: TraitType,
): RoundValueBreakdown {
    const { modifierTotal, appliedEventEffects } = getValidatedRoundEventModifier(roundEvent, trait)
    const traitState = getValidatedTraitState(traits, trait)
    const effectiveLevel = Math.min(traitState.level, MAX_EFFECTIVE_TRAIT_LEVEL)
    const baseContribution = BASE_USE_VALUE
    const eventContribution = modifierTotal * EVENT_WEIGHT
    const levelContribution = effectiveLevel

    return {
        actionType: 'USE',
        baseContribution,
        eventModifierTotal: modifierTotal,
        eventWeight: EVENT_WEIGHT,
        eventContribution,
        appliedEventEffects,
        originalLevel: traitState.level,
        effectiveLevel,
        levelContribution,
        // Negative totals remain valid by design: sufficiently severe event
        // penalties can outweigh both the intrinsic USE value and gene level.
        total: baseContribution + levelContribution + eventContribution,
    }
}

export function getValidatedActionBreakdown(
    roundEvent: RoundEventDefinition,
    traits: TraitCollection,
    trait: TraitType,
    actionType: ActionType,
): RoundValueBreakdown {
    const useBreakdown = getValidatedTraitUseBreakdown(roundEvent, traits, trait)

    if (actionType === 'USE') {
        return useBreakdown
    }

    return {
        ...useBreakdown,
        actionType,
        baseContribution: 0,
        eventContribution: 0,
        levelContribution: 0,
        total: 0,
    }
}
