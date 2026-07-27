import { parentPort } from 'node:worker_threads'
import { screenCandidate } from './audit-search.ts'
import type { CandidateCatalog } from './audit-catalog.ts'

parentPort?.on('message', (message: { stop?: boolean; candidate?: CandidateCatalog; sequences?: number[][] }) => {
    if (message.stop) { parentPort?.close(); return }
    parentPort?.postMessage(screenCandidate(message.candidate!, message.sequences!))
})
