import { ROUND_EVENT_DEFINITIONS } from './catalog.ts'
import { GENE_IDS, type GeneId } from './types.ts'

type Sign = 'negative' | 'zero' | 'positive'
function sign(value: number): Sign { return value < 0 ? 'negative' : value > 0 ? 'positive' : 'zero' }
function error(scope: string, constraint: string, observed: unknown, allowed: string): string { return `${scope}: ${constraint}; observed=${String(observed)}; allowed=${allowed}` }

export function validateCatalog(): string[] {
    const errors: string[] = []
    if (ROUND_EVENT_DEFINITIONS.length !== 6) errors.push(error('catalog', 'event-count', ROUND_EVENT_DEFINITIONS.length, '6'))
    const distributions = Object.fromEntries(GENE_IDS.map((gene) => [gene, new Map<number, number>()])) as Record<GeneId, Map<number, number>>
    for (const roundEvent of ROUND_EVENT_DEFINITIONS) {
        for (const gene of GENE_IDS) {
            const value = roundEvent.modifiers[gene]
            if (![-1, 0, 1, 2, 3].includes(value)) errors.push(error(`event=${roundEvent.id};gene=${gene}`, 'modifier', value, '-1|0|1|2|3'))
            distributions[gene].set(value, (distributions[gene].get(value) ?? 0) + 1)
        }
    }
    for (const gene of GENE_IDS) {
        for (const [modifier, expected] of [[3, 1], [2, 1], [1, 1], [0, 1], [-1, 2]] as const) {
            const actual = distributions[gene].get(modifier) ?? 0
            if (actual !== expected) errors.push(error(`gene=${gene}`, `modifier-${modifier}`, actual, String(expected)))
        }
    }
    for (let left = 0; left < GENE_IDS.length; left += 1) for (let right = left + 1; right < GENE_IDS.length; right += 1) {
        const first = GENE_IDS[left]!
        const second = GENE_IDS[right]!
        const matchingSigns = ROUND_EVENT_DEFINITIONS.filter((roundEvent) => sign(roundEvent.modifiers[first]) === sign(roundEvent.modifiers[second])).length
        if (matchingSigns > 4) errors.push(error(`genes=${first},${second}`, 'same-sign-events', matchingSigns, '0..4 (negative/zero/positive)'))
    }
    return errors
}
