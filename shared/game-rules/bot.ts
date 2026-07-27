import { GENE_IDS } from './types.ts'
import { getTraitRoundValue, isGeneEvolvable, isGeneUsable } from './engine.ts'
import type { ActionType, GeneCollection, GeneId, RoundEventDefinition } from './types.ts'

export type BotRoundAction = { trait: GeneId; actionType: ActionType }
export type SelectBotActionInput = {
    traits: GeneCollection
    roundEvent: RoundEventDefinition
    roundNumber: number
    random?: () => number
}

export function getUsableBotTraits(genes: GeneCollection): GeneId[] {
    return GENE_IDS.filter((gene) => isGeneUsable(genes, gene))
}

export function getEvolvableBotTraits(genes: GeneCollection): GeneId[] {
    return GENE_IDS.filter((gene) => isGeneEvolvable(genes, gene))
}

export function pickRandom<T>(items: readonly T[], random: () => number): T {
    if (!items.length) throw new Error('Cannot select from an empty collection.')
    return items[Math.floor(random() * items.length)] ?? items[0]!
}

export function getBotEvolveProbability(roundNumber: number): number {
    if (roundNumber >= 6) return 0
    return roundNumber === 5 ? 0.10 : 0.25
}

export function getLegalBotActions(genes: GeneCollection): BotRoundAction[] {
    return GENE_IDS.flatMap((trait) => [
        ...(isGeneEvolvable(genes, trait) ? [{ trait, actionType: 'EVOLVE' as const }] : []),
        ...(isGeneUsable(genes, trait) ? [{ trait, actionType: 'USE' as const }] : []),
    ])
}

export function selectRandomBotAction(genes: GeneCollection, random: () => number = Math.random): BotRoundAction {
    return pickRandom(getLegalBotActions(genes), random)
}

function selectBestUseTrait(genes: GeneCollection, roundEvent: RoundEventDefinition, random: () => number): GeneId {
    const usableTraits = getUsableBotTraits(genes)
    if (!usableTraits.length) throw new Error('No usable bot traits available.')

    const scoredTraits = usableTraits.map((trait) => ({ trait, score: getTraitRoundValue(roundEvent, genes, trait) }))
    const bestScore = Math.max(...scoredTraits.map(({ score }) => score))
    return pickRandom(scoredTraits.filter(({ score }) => score === bestScore).map(({ trait }) => trait), random)
}

function selectEvolveTrait(genes: GeneCollection, random: () => number): GeneId {
    return pickRandom(getEvolvableBotTraits(genes), random)
}

export function selectBotAction({ traits, roundEvent, roundNumber, random = Math.random }: SelectBotActionInput): BotRoundAction {
    const wantsToEvolve = random() < getBotEvolveProbability(roundNumber)
    const preferredActionType: ActionType = wantsToEvolve ? 'EVOLVE' : 'USE'

    if (preferredActionType === 'USE' && getUsableBotTraits(traits).length) {
        return { trait: selectBestUseTrait(traits, roundEvent, random), actionType: 'USE' }
    }
    if (preferredActionType === 'EVOLVE' && getEvolvableBotTraits(traits).length) {
        return { trait: selectEvolveTrait(traits, random), actionType: 'EVOLVE' }
    }
    if (getUsableBotTraits(traits).length) {
        return { trait: selectBestUseTrait(traits, roundEvent, random), actionType: 'USE' }
    }
    if (getEvolvableBotTraits(traits).length) {
        return { trait: selectEvolveTrait(traits, random), actionType: 'EVOLVE' }
    }
    throw new Error('No legal bot actions available.')
}

// Compatibility entry point for callers that still pass a next-round event.
// The bot deliberately does not use that event for its current decision.
export function selectStrategicBotAction(
    genes: GeneCollection,
    roundEvent: RoundEventDefinition,
    roundNumber: number,
    _nextRoundEvent: RoundEventDefinition | null,
    random: () => number = Math.random,
): BotRoundAction {
    return selectBotAction({ traits: genes, roundEvent, roundNumber, random })
}
