import { performance } from 'node:perf_hooks'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RULE_VERSION } from '../shared/game-rules/index.ts'
import { assertAuditEquivalence, generateSequences } from './audit-core.ts'
const started = performance.now(); assertAuditEquivalence(); const payload = { audit: 'exact-domain-parity', ruleVersion: RULE_VERSION, sequences: generateSequences().length, elapsedMs: Math.round(performance.now() - started), implementation: 'shared-game-rules-only' }; const output = resolve(import.meta.dirname, '../artifacts/audit'); mkdirSync(output, { recursive: true }); writeFileSync(resolve(output, 'exact-baseline.json'), `${JSON.stringify(payload, null, 2)}\n`); console.log(JSON.stringify(payload))
