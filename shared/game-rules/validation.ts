import { ROUND_EVENT_DEFINITIONS } from './catalog.ts'
import { GENE_IDS, type GeneId } from './types.ts'

type Sign = 'negative' | 'zero' | 'positive'
function sign(value: number): Sign { return value < 0 ? 'negative' : value > 0 ? 'positive' : 'zero' }
function error(scope: string, constraint: string, observed: unknown, allowed: string): string { return `${scope}: ${constraint}; observed=${String(observed)}; allowed=${allowed}` }

export function validateCatalog(): string[] {
    const errors: string[] = []
    if (ROUND_EVENT_DEFINITIONS.length !== 6) errors.push(error('catalog', 'event-count', ROUND_EVENT_DEFINITIONS.length, '6'))
    const totals = Object.fromEntries(GENE_IDS.map((gene) => [gene, 0])) as Record<GeneId, number>
    const positives = Object.fromEntries(GENE_IDS.map((gene) => [gene, 0])) as Record<GeneId, number>
    const negatives = Object.fromEntries(GENE_IDS.map((gene) => [gene, 0])) as Record<GeneId, number>
    const primaries = Object.fromEntries(GENE_IDS.map((gene) => [gene, 0])) as Record<GeneId, number>
    for (const roundEvent of ROUND_EVENT_DEFINITIONS) {
        const values = GENE_IDS.map((gene) => roundEvent.modifiers[gene])
        const plusTwo = values.filter((value) => value === 2).length
        const plusOne = values.filter((value) => value === 1).length
        const minusOne = values.filter((value) => value === -1).length
        if (plusTwo !== 1) errors.push(error(`event=${roundEvent.id}`, 'primary-count', plusTwo, '1'))
        if (plusOne > 2) errors.push(error(`event=${roundEvent.id}`, 'secondary-count', plusOne, '0..2'))
        if (minusOne < 1 || minusOne > 3) errors.push(error(`event=${roundEvent.id}`, 'negative-count', minusOne, '1..3'))
        for (const gene of GENE_IDS) {
            const value = roundEvent.modifiers[gene]
            if (![-1, 0, 1, 2].includes(value)) errors.push(error(`event=${roundEvent.id};gene=${gene}`, 'modifier', value, '-1|0|1|2'))
            totals[gene] += value
            if (value > 0) positives[gene] += 1
            if (value < 0) negatives[gene] += 1
            if (value === 2) primaries[gene] += 1
        }
    }
    for (const gene of GENE_IDS) {
        if (totals[gene] < 0 || totals[gene] > 2) errors.push(error(`gene=${gene}`, 'modifier-total', totals[gene], '0..2'))
        if (positives[gene] < 2 || positives[gene] > 3) errors.push(error(`gene=${gene}`, 'positive-events', positives[gene], '2..3'))
        if (negatives[gene] < 2 || negatives[gene] > 3) errors.push(error(`gene=${gene}`, 'negative-events', negatives[gene], '2..3'))
        if (primaries[gene] > 2) errors.push(error(`gene=${gene}`, 'primary-events', primaries[gene], '0..2'))
    }
    for (let left = 0; left < GENE_IDS.length; left += 1) for (let right = left + 1; right < GENE_IDS.length; right += 1) {
        const first = GENE_IDS[left]!
        const second = GENE_IDS[right]!
        const matchingSigns = ROUND_EVENT_DEFINITIONS.filter((roundEvent) => sign(roundEvent.modifiers[first]) === sign(roundEvent.modifiers[second])).length
        if (matchingSigns > 4) errors.push(error(`genes=${first},${second}`, 'same-sign-events', matchingSigns, '0..4 (negative/zero/positive)'))
    }
    return errors
}
