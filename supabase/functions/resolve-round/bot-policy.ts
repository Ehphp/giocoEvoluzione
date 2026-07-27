// This stays local to the Edge Function so its deployed bot policy does not
// depend on frontend modules. Keep it semantically aligned with shared/game-rules/bot.ts.
const EDGE_GENE_IDS = ['RESILIENCE', 'MOBILITY', 'SENSES', 'METABOLISM', 'AQUATIC'] as const
const EDGE_MAX_TRAIT_LEVEL = 2
const EDGE_BASE_USE_VALUE = 1
const EDGE_LEVEL_BONUS = [0, 1, 3] as const

type EdgeGeneId = (typeof EDGE_GENE_IDS)[number]
type EdgeGeneCollection = Record<EdgeGeneId, { level: number; cooldown: number }>
type EdgeRoundEvent = { modifiers: Record<EdgeGeneId, number> }

export type EdgeBotRoundAction = { trait: EdgeGeneId; actionType: 'USE' | 'EVOLVE' }
export type SelectEdgeBotActionInput = {
    traits: EdgeGeneCollection
    roundEvent: EdgeRoundEvent
    roundNumber: number
    random?: () => number
}

function getUsableTraits(traits: EdgeGeneCollection): EdgeGeneId[] {
    return EDGE_GENE_IDS.filter((trait) => traits[trait].cooldown === 0)
}

function getEvolvableTraits(traits: EdgeGeneCollection): EdgeGeneId[] {
    return EDGE_GENE_IDS.filter((trait) => traits[trait].level < EDGE_MAX_TRAIT_LEVEL)
}

function pickRandom<T>(items: readonly T[], random: () => number): T {
    if (!items.length) throw new Error('Cannot select from an empty collection.')
    return items[Math.floor(random() * items.length)] ?? items[0]!
}

function getEvolveProbability(roundNumber: number): number {
    if (roundNumber >= 6) return 0
    return roundNumber === 5 ? 0.10 : 0.25
}

function getTraitRoundValue(roundEvent: EdgeRoundEvent, traits: EdgeGeneCollection, trait: EdgeGeneId): number {
    return EDGE_BASE_USE_VALUE + EDGE_LEVEL_BONUS[Math.min(traits[trait].level, EDGE_MAX_TRAIT_LEVEL)]! + roundEvent.modifiers[trait]
}

function selectBestUseTrait(traits: EdgeGeneCollection, roundEvent: EdgeRoundEvent, random: () => number): EdgeGeneId {
    const scoredTraits = getUsableTraits(traits).map((trait) => ({ trait, score: getTraitRoundValue(roundEvent, traits, trait) }))
    if (!scoredTraits.length) throw new Error('No usable bot traits available.')
    const bestScore = Math.max(...scoredTraits.map(({ score }) => score))
    return pickRandom(scoredTraits.filter(({ score }) => score === bestScore).map(({ trait }) => trait), random)
}

export function selectEdgeBotAction({ traits, roundEvent, roundNumber, random = Math.random }: SelectEdgeBotActionInput): EdgeBotRoundAction {
    const wantsToEvolve = random() < getEvolveProbability(roundNumber)
    const preferredActionType = wantsToEvolve ? 'EVOLVE' : 'USE'

    if (preferredActionType === 'USE' && getUsableTraits(traits).length) {
        return { trait: selectBestUseTrait(traits, roundEvent, random), actionType: 'USE' }
    }
    if (preferredActionType === 'EVOLVE' && getEvolvableTraits(traits).length) {
        return { trait: pickRandom(getEvolvableTraits(traits), random), actionType: 'EVOLVE' }
    }
    if (getUsableTraits(traits).length) {
        return { trait: selectBestUseTrait(traits, roundEvent, random), actionType: 'USE' }
    }
    if (getEvolvableTraits(traits).length) {
        return { trait: pickRandom(getEvolvableTraits(traits), random), actionType: 'EVOLVE' }
    }
    throw new Error('No legal bot actions available.')
}
