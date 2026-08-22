import { performance } from 'node:perf_hooks'
import {
    BOT_COMBAT_MUTATION_LOADOUT,
    ROUND_EVENT_DEFINITIONS,
    RULE_VERSION,
    createInitialCombatMutationState,
    greedyUsePolicy,
    heuristicPolicy,
    simulateMatch,
} from '../shared/game-rules/index.ts'
const started = performance.now()
for (let seed = 0; seed < 20; seed += 1)
    simulateMatch({
        leftPolicy: heuristicPolicy,
        rightPolicy: greedyUsePolicy,
        eventSequence: ROUND_EVENT_DEFINITIONS.map((event) => event.id),
        seed,
        ruleVersion: RULE_VERSION,
        initialState: {
            leftCombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT,
            rightCombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT,
            leftCombatMutationState: createInitialCombatMutationState(),
            rightCombatMutationState: createInitialCombatMutationState(),
        },
    })
console.log(
    JSON.stringify({
        audit: 'production-simulation-benchmark',
        matches: 20,
        elapsedMs: Math.round(performance.now() - started),
    }),
)
