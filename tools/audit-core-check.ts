import { performance } from 'node:perf_hooks'
import { assertAuditEquivalence } from './audit-core.ts'

const startedAt = performance.now()
assertAuditEquivalence()
const elapsedMs = Math.round(performance.now() - startedAt)
if (elapsedMs >= 1000) throw new Error(`Core audit exceeded 1 second: ${elapsedMs} ms.`)
console.log(JSON.stringify({ coreAudit: 'passed', elapsedMs, targetMs: 1000 }))
