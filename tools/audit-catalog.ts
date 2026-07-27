import { createHash } from 'node:crypto'
import { ROUND_EVENT_DEFINITIONS } from '../shared/game-rules/catalog.ts'
import { GENE_IDS } from '../shared/game-rules/types.ts'
import { GENE_COUNT, buildUseValueTable } from './audit-core.ts'

export type CandidateCatalog = { id: string; modifiers: number[][]; signature: string }
export const baselineModifiers = ROUND_EVENT_DEFINITIONS.map((event) => GENE_IDS.map((gene) => event.modifiers[gene]))

export function catalogSignature(modifiers: readonly (readonly number[])[]): string {
    return createHash('sha256').update(JSON.stringify(modifiers)).digest('hex').slice(0, 16)
}
export function candidateFromMatrix(id: string, modifiers: number[][]): CandidateCatalog {
    return { id, modifiers, signature: catalogSignature(modifiers) }
}
export function validateCandidate(modifiers: readonly (readonly number[])[]): string[] {
    const errors: string[] = []
    if (modifiers.length !== 6 || modifiers.some((row) => row.length !== GENE_COUNT)) return ['matrix-shape']
    const totals = new Int8Array(GENE_COUNT), positives = new Int8Array(GENE_COUNT), negatives = new Int8Array(GENE_COUNT), primaries = new Int8Array(GENE_COUNT)
    for (const row of modifiers) {
        let plusTwo = 0, plusOne = 0, minusOne = 0
        for (let gene = 0; gene < GENE_COUNT; gene += 1) {
            const value = row[gene]!
            if (value === 2) plusTwo += 1
            if (value === 1) plusOne += 1
            if (value === -1) minusOne += 1
            if (value < -1 || value > 2) errors.push('modifier-range')
            totals[gene] += value; if (value > 0) positives[gene] += 1; if (value < 0) negatives[gene] += 1; if (value === 2) primaries[gene] += 1
        }
        if (plusTwo !== 1 || plusOne > 2 || minusOne < 1 || minusOne > 3) errors.push('event-invariant')
    }
    for (let gene = 0; gene < GENE_COUNT; gene += 1) if (totals[gene] < 0 || totals[gene] > 2 || positives[gene] < 2 || positives[gene] > 3 || negatives[gene] < 2 || negatives[gene] > 3 || primaries[gene] > 2) errors.push('gene-invariant')
    return errors
}
// Two-event swaps preserve each gene's total; the static validator keeps only
// mutations that also preserve per-event constraints. Global permutations fill
// the deterministic stream when a small smoke limit needs more candidates.
export function generateCandidateCatalogs(limit: number): CandidateCatalog[] {
    const output: CandidateCatalog[] = []
    const signatures = new Set<string>()
    const add = (matrix: number[][]) => {
        const candidate = candidateFromMatrix(`candidate-${output.length.toString().padStart(4, '0')}`, matrix)
        if (output.length < limit && !signatures.has(candidate.signature) && validateCandidate(matrix).length === 0) { signatures.add(candidate.signature); output.push(candidate) }
    }
    add(baselineModifiers.map((row) => [...row]))
    for (let firstEvent = 0; firstEvent < baselineModifiers.length && output.length < limit; firstEvent += 1) for (let secondEvent = firstEvent + 1; secondEvent < baselineModifiers.length && output.length < limit; secondEvent += 1) for (let firstGene = 0; firstGene < GENE_COUNT && output.length < limit; firstGene += 1) for (let secondGene = firstGene + 1; secondGene < GENE_COUNT && output.length < limit; secondGene += 1) {
        const matrix = baselineModifiers.map((row) => [...row])
        for (const gene of [firstGene, secondGene]) [matrix[firstEvent]![gene], matrix[secondEvent]![gene]] = [matrix[secondEvent]![gene]!, matrix[firstEvent]![gene]!]
        add(matrix)
    }
    const genes = [...Array(GENE_COUNT).keys()]
    const visit = (index: number) => {
        if (output.length >= limit) return
        if (index === genes.length) {
            const matrix = baselineModifiers.map((row) => genes.map((gene) => row[gene]!))
            add(matrix); return
        }
        for (let swap = index; swap < genes.length; swap += 1) { [genes[index], genes[swap]] = [genes[swap]!, genes[index]!]; visit(index + 1); [genes[index], genes[swap]] = [genes[swap]!, genes[index]!] }
    }
    visit(0)
    return output
}
export function candidateUseValues(candidate: CandidateCatalog): Int8Array { return buildUseValueTable(candidate.modifiers) }
