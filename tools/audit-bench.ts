import { performance } from 'node:perf_hooks'
import { ROUND_EVENT_DEFINITIONS, greedyUsePolicy, heuristicPolicy, simulateMatch } from '../shared/game-rules/index.ts'
const started = performance.now(); for (let seed = 0; seed < 20; seed += 1) simulateMatch({ leftPolicy: heuristicPolicy, rightPolicy: greedyUsePolicy, eventSequence: ROUND_EVENT_DEFINITIONS.map((event) => event.id), seed }); console.log(JSON.stringify({ audit: 'production-simulation-benchmark', matches: 20, elapsedMs: Math.round(performance.now() - started) }))
