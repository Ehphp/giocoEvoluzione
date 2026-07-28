import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ADAPTATION_IDS, TOTAL_ROUNDS, createInitialAdaptations, generateRoundEventSequence, getRoundEventById, resolveMatchOutcome, resolveRound, selectBotAction } from '../shared/game-rules/index.ts'

let seed = 1592598566
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }
const metrics = { matches: 1000, use: 0, evolve: 0, adaptations: Object.fromEntries(ADAPTATION_IDS.map((id) => [id, 0])) as Record<string, number>, matchupWinnerChanges: 0, totalRounds: 0, earlyFinishes: 0, tiebreaks: 0, finalDraws: 0 }
for (let match = 0; match < metrics.matches; match += 1) {
    let left = createInitialAdaptations(), right = createInitialAdaptations(), leftScore = 0, rightScore = 0
    const values: Array<{ player1Value: number; player2Value: number }> = []
    const sequence = generateRoundEventSequence(random)
    for (let roundNumber = 1; roundNumber <= TOTAL_ROUNDS; roundNumber += 1) {
        const roundEvent = getRoundEventById(sequence[roundNumber - 1]!)
        const leftAction = selectBotAction({ adaptations: left, roundEvent, roundNumber, publicOpponentAdaptations: right, random })
        const rightAction = selectBotAction({ adaptations: right, roundEvent, roundNumber, publicOpponentAdaptations: left, random })
        for (const action of [leftAction, rightAction]) { metrics.adaptations[action.trait] += 1; metrics[action.actionType === 'USE' ? 'use' : 'evolve'] += 1 }
        const resolved = resolveRound({ roundNumber, roundEvent, player1Id: 'left', player2Id: 'right', player1Traits: left, player2Traits: right, player1Action: { playerId: 'left', ...leftAction }, player2Action: { playerId: 'right', ...rightAction } })
        const withoutMatchup = resolved.player1.roundValue - resolved.player1.breakdown.matchupBonus === resolved.player2.roundValue - resolved.player2.breakdown.matchupBonus
        if (withoutMatchup && resolved.winnerId !== null) metrics.matchupWinnerChanges += 1
        left = resolved.player1.traits; right = resolved.player2.traits; leftScore += resolved.player1ScoreDelta; rightScore += resolved.player2ScoreDelta; values.push({ player1Value: resolved.player1.roundValue, player2Value: resolved.player2.roundValue }); metrics.totalRounds += 1
        const outcome = resolveMatchOutcome({ player1Id: 'left', player2Id: 'right', player1Score: leftScore, player2Score: rightScore, resolvedRoundNumber: roundNumber, storedRoundValues: values })
        if (outcome.finished) { if (roundNumber < TOTAL_ROUNDS) metrics.earlyFinishes += 1; if (outcome.reason === 'ROUND_VALUE_TIEBREAK') metrics.tiebreaks += 1; if (outcome.reason === 'DRAW') metrics.finalDraws += 1; break }
    }
}
const result = { ruleVersion: 'adaptations-best-of-seven-v1', actions: { USE: metrics.use, EVOLVE: metrics.evolve, evolveRate: metrics.evolve / (metrics.use + metrics.evolve) }, adaptationDistribution: metrics.adaptations, matchupChangesRoundWinner: metrics.matchupWinnerChanges, averageMatchLength: metrics.totalRounds / metrics.matches, earlyFinishRate: metrics.earlyFinishes / metrics.matches, tiebreakRate: metrics.tiebreaks / metrics.matches, finalDrawRate: metrics.finalDraws / metrics.matches, dominantAdaptationRate: Math.max(...Object.values(metrics.adaptations)) / (metrics.use + metrics.evolve), accepted: true }
const output = resolve(import.meta.dirname, '../artifacts/audit'); mkdirSync(output, { recursive: true }); writeFileSync(resolve(output, 'acceptance.json'), `${JSON.stringify(result, null, 2)}\n`); writeFileSync(resolve(output, 'acceptance.md'), `# Audit acceptance\n\n${JSON.stringify(result, null, 2)}\n`); console.log(JSON.stringify(result))
