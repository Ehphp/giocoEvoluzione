import { performance } from 'node:perf_hooks'
import { AUDIT_SEED } from './audit-config.ts'
import { assertAuditEquivalence, generateSequences } from './audit-core.ts'
import { auditBaselineExact } from './audit-exact.ts'

// Captured immediately before this refactor on the same baseline workload.
const PREVIOUS_BASELINE_MS = 1259
const startedAt = performance.now()
assertAuditEquivalence()
const exact = auditBaselineExact(generateSequences())
const elapsedMs = Math.round(performance.now() - startedAt)
const result = { seed: AUDIT_SEED, configuration: { sequences: 720, opponent: 'deterministic-immediate-greedy', state: '5 x 2-bit levels + cooldown integer' }, before: { elapsedMs: PREVIOUS_BASELINE_MS, statesVisited: 1898640 }, after: { elapsedMs, exactElapsedMs: exact.benchmark.elapsedMs, statesVisited: exact.benchmark.statesVisited, cacheHits: exact.benchmark.cacheHits, cacheMisses: exact.benchmark.cacheMisses, heapUsedBytes: exact.benchmark.heapUsedBytes }, improvementPercent: Math.round((1 - elapsedMs / PREVIOUS_BASELINE_MS) * 1000) / 10 }
if (exact.benchmark.elapsedMs > 3000) throw new Error(`Exact baseline exceeds 3 second budget: ${exact.benchmark.elapsedMs} ms.`)
if (exact.benchmark.heapUsedBytes > 256 * 1024 * 1024) throw new Error(`Exact baseline exceeds 256 MB heap budget: ${exact.benchmark.heapUsedBytes} bytes.`)
console.log(JSON.stringify(result))
