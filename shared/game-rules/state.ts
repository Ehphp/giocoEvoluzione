import { COOLDOWN_ROUNDS, GENE_CATALOG, MAX_TRAIT_LEVEL, ROUND_EVENT_BY_ID, ROUND_EVENT_DEFINITIONS, TOTAL_ROUNDS } from './catalog.ts'
import { GENE_IDS, type GeneCollection, type GeneId, type GeneState, type RoundEventDefinition } from './types.ts'

export { GENE_IDS, TOTAL_ROUNDS, MAX_TRAIT_LEVEL, COOLDOWN_ROUNDS }

export function createInitialGenes(): GeneCollection {
    return Object.fromEntries(GENE_IDS.map((gene) => [gene, { level: 0, cooldown: 0 }])) as GeneCollection
}

export function normalizeGeneCollection(value: Partial<Record<GeneId, Partial<GeneState>>> | null | undefined): GeneCollection {
    const genes = createInitialGenes()
    for (const gene of GENE_IDS) {
        const state = value?.[gene]
        if (!state) continue
        if (Number.isFinite(state.level)) genes[gene].level = Math.max(0, Math.min(MAX_TRAIT_LEVEL, Math.trunc(state.level!)))
        if (Number.isFinite(state.cooldown)) genes[gene].cooldown = Math.max(0, Math.min(COOLDOWN_ROUNDS, Math.trunc(state.cooldown!)))
    }
    return genes
}

export function getGeneLabel(gene: GeneId): string { return GENE_CATALOG[gene].label }
export function getRoundEventById(eventId: string): RoundEventDefinition {
    const roundEvent = ROUND_EVENT_BY_ID[eventId]
    if (!roundEvent) throw new Error(`Unknown round event "${eventId}".`)
    return roundEvent
}
export function getRoundEventForRound(sequence: string[], roundNumber: number): RoundEventDefinition | null {
    const eventId = sequence[roundNumber - 1]
    return eventId ? getRoundEventById(eventId) : null
}
export function generateRoundEventSequence(random: () => number = Math.random): string[] {
    const ids = ROUND_EVENT_DEFINITIONS.map((roundEvent) => roundEvent.id)
    for (let index = ids.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1))
        ;[ids[index], ids[swap]] = [ids[swap]!, ids[index]!]
    }
    return ids.slice(0, TOTAL_ROUNDS)
}
