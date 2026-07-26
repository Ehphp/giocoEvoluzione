import { BASE_USE_VALUE, MAX_TRAIT_LEVEL } from './catalog.ts'
import type { ActionType, GeneCollection, GeneId, RoundEventDefinition, RoundValueBreakdown } from './types.ts'

export function getValidatedGeneState(genes: GeneCollection, gene: GeneId) {
    const state = genes[gene]
    if (!state || !Number.isFinite(state.level) || !Number.isFinite(state.cooldown) || state.level < 0 || state.cooldown < 0) {
        throw new Error(`Invalid gene state for "${gene}".`)
    }
    return state
}

export function getValidatedGeneUseBreakdown(roundEvent: RoundEventDefinition, genes: GeneCollection, gene: GeneId): RoundValueBreakdown {
    const state = getValidatedGeneState(genes, gene)
    const eventModifier = roundEvent.modifiers[gene]
    if (!Number.isFinite(eventModifier)) throw new Error(`Invalid event modifier for gene "${gene}" in "${roundEvent.id}".`)
    const effectiveLevel = Math.min(state.level, MAX_TRAIT_LEVEL)
    const appliedEventEffects = roundEvent.effects.filter((effect) => effect.trait === gene).map((effect) => ({ ...effect, contribution: effect.modifier }))
    return {
        actionType: 'USE', baseContribution: BASE_USE_VALUE, eventModifier, levelContribution: effectiveLevel,
        originalLevel: state.level, effectiveLevel, total: BASE_USE_VALUE + effectiveLevel + eventModifier, appliedEventEffects,
    }
}

export function getValidatedActionBreakdown(roundEvent: RoundEventDefinition, genes: GeneCollection, gene: GeneId, actionType: ActionType): RoundValueBreakdown {
    const useBreakdown = getValidatedGeneUseBreakdown(roundEvent, genes, gene)
    return actionType === 'USE' ? useBreakdown : { ...useBreakdown, actionType, baseContribution: 0, eventModifier: 0, levelContribution: 0, total: 0, appliedEventEffects: [] }
}
