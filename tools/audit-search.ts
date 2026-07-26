import { performance } from 'node:perf_hooks'
import { validateCatalog } from '../shared/game-rules/validation.ts'
import { generateSequences } from './audit-core.ts'

const startedAt = performance.now()
const sequences = generateSequences()
let accepted = 0
let rejected = 0
for (const sequence of sequences) {
    // Le permutazioni non alterano la matrice: verificano in modo ripetibile che
    // il filtro strutturale resti indipendente dall'ordine dei round.
    void sequence
    const errors = validateCatalog()
    if (errors.length) rejected += 1
    else accepted += 1
}
const elapsedMs = performance.now() - startedAt
const combinationsPerMinute = sequences.length / elapsedMs * 60_000
const result = { combinations: sequences.length, accepted, rejected, elapsedMs: Math.round(elapsedMs), combinationsPerMinute: Math.round(combinationsPerMinute), targetCombinationsPerMinute: 500 }
if (combinationsPerMinute < 500) throw new Error(`Structural screening too slow: ${Math.round(combinationsPerMinute)} combinations/minute.`)
console.log(JSON.stringify(result))
