import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { MAX_TRAIT_LEVEL } from '../shared/game-rules/index.ts'
import { AUDIT_RULE_VERSION } from './audit-config.ts'
import { ACTION_COUNT, COOLDOWN_NONE, GENE_COUNT, STATE_CAPACITY, actionGene, actionKey, actionValue, actionValueFromTable, eventIds, generateSequences, getLegalActions, getLevel, isEvolve, legalActionCount, nextState, type AuditAction } from './audit-core.ts'

const ROUND_COUNT = 6
const EMPTY = -128
const alphabeticalGeneRank = [4, 3, 1, 0, 2] // AQUATIC, METABOLISM, MOBILITY, RESILIENCE, SENSES
const tieRank = (action: AuditAction) => (isEvolve(action) ? 0 : GENE_COUNT) + alphabeticalGeneRank.indexOf(actionGene(action))

export type ExactTrace = { action: AuditAction; state: number; ownValue: number; rivalValue: number }
export type ExactSolve = { outcome: number; trace: ExactTrace[]; statesVisited: number; cacheHits: number; cacheMisses: number }

function greedyAction(eventIndex: number, state: number, values?: Int8Array): AuditAction {
    let best = -1
    let bestValue = -128
    let bestRank = Number.POSITIVE_INFINITY
    for (const action of getLegalActions(state)) if (!isEvolve(action)) {
        const value = values ? actionValueFromTable(values, eventIndex, state, action) : actionValue(eventIndex, state, action)
        const rank = tieRank(action)
        if (value > bestValue || (value === bestValue && rank < bestRank)) { best = action; bestValue = value; bestRank = rank }
    }
    return best
}

export function solveExactSequence(sequence: readonly number[], maxLevel = MAX_TRAIT_LEVEL, values?: Int8Array): ExactSolve {
    const opponentStates = new Int16Array(ROUND_COUNT)
    const opponentActions = new Int8Array(ROUND_COUNT)
    const opponentValues = new Int8Array(ROUND_COUNT)
    let opponentState = COOLDOWN_NONE << 10
    for (let round = 0; round < ROUND_COUNT; round += 1) {
        const action = greedyAction(sequence[round]!, opponentState, values)
        opponentStates[round] = opponentState
        opponentActions[round] = action
        opponentValues[round] = values ? actionValueFromTable(values, sequence[round]!, opponentState, action) : actionValue(sequence[round]!, opponentState, action)
        opponentState = nextState(opponentState, action)
    }
    const memo = new Int8Array((ROUND_COUNT + 1) * STATE_CAPACITY).fill(EMPTY)
    const choices = new Int8Array(ROUND_COUNT * STATE_CAPACITY).fill(-1)
    let statesVisited = 0
    let cacheHits = 0
    let cacheMisses = 0
    const search = (round: number, state: number): number => {
        if (round === ROUND_COUNT) return 0
        const index = round * STATE_CAPACITY + state
        const cached = memo[index]!
        if (cached !== EMPTY) { cacheHits += 1; return cached }
        cacheMisses += 1
        statesVisited += 1
        let bestScore = -127
        let bestAction = -1
        let bestRank = Number.POSITIVE_INFINITY
        const actions = getLegalActions(state)
        for (let slot = 0; slot < legalActionCount[state]!; slot += 1) {
            const action = actions[slot]!
            if (isEvolve(action) && getLevel(state, actionGene(action)) >= maxLevel) continue
            const ownValue = values ? actionValueFromTable(values, sequence[round]!, state, action) : actionValue(sequence[round]!, state, action)
            const rivalValue = opponentValues[round]!
            const score = (ownValue === rivalValue ? 0 : ownValue > rivalValue ? 1 : -1) + search(round + 1, nextState(state, action))
            const rank = tieRank(action)
            if (score > bestScore || (score === bestScore && rank < bestRank)) { bestScore = score; bestAction = action; bestRank = rank }
        }
        memo[index] = bestScore
        choices[index] = bestAction
        return bestScore
    }
    const outcome = search(0, COOLDOWN_NONE << 10)
    const trace: ExactTrace[] = []
    let state = COOLDOWN_NONE << 10
    for (let round = 0; round < ROUND_COUNT; round += 1) {
        const action = choices[round * STATE_CAPACITY + state]!
        trace.push({ action, state, ownValue: values ? actionValueFromTable(values, sequence[round]!, state, action) : actionValue(sequence[round]!, state, action), rivalValue: opponentValues[round]! })
        state = nextState(state, action)
    }
    return { outcome, trace, statesVisited, cacheHits, cacheMisses }
}

export type ExactAudit = {
    methodology: Record<string, unknown>
    benchmark: { elapsedMs: number; statesVisited: number; cacheHits: number; cacheMisses: number; heapUsedBytes: number }
    metrics: Record<string, unknown>
}

export function auditBaselineExact(sequences = generateSequences(), values?: Int8Array): ExactAudit {
    const startedAt = performance.now()
    const totals = {
        wins: 0, draws: 0, losses: 0, roundTies: 0, level2Reached: 0, level2Uses: 0, secondEvolveNecessary: 0, secondEvolveNotNecessary: 0,
        actionCounts: new Int32Array(ACTION_COUNT), pickCounts: new Int32Array(GENE_COUNT), valuesByGene: new Int32Array(GENE_COUNT), valuesByEvent: new Int32Array(6),
        statesVisited: 0, cacheHits: 0, cacheMisses: 0, minimumOutcome: 9, maximumOutcome: -9, matchScoreDistribution: new Map<string, number>(),
    }
    for (const sequence of sequences) {
        const result = solveExactSequence(sequence, MAX_TRAIT_LEVEL, values)
        totals.statesVisited += result.statesVisited; totals.cacheHits += result.cacheHits; totals.cacheMisses += result.cacheMisses
        let ownPoints = 0
        let opponentPoints = 0
        let reachedLevel2 = false
        for (let round = 0; round < ROUND_COUNT; round += 1) {
            const entry = result.trace[round]!
            const gene = actionGene(entry.action)
            totals.actionCounts[entry.action] += 1; totals.pickCounts[gene] += 1; totals.valuesByGene[gene] += entry.ownValue; totals.valuesByEvent[sequence[round]!] += entry.ownValue
            if (entry.ownValue === entry.rivalValue) totals.roundTies += 1
            if (entry.ownValue > entry.rivalValue) ownPoints += 1
            if (entry.ownValue < entry.rivalValue) opponentPoints += 1
            if (isEvolve(entry.action) && getLevel(entry.state, gene) === 1) reachedLevel2 = true
            if (!isEvolve(entry.action) && getLevel(entry.state, gene) === 2) totals.level2Uses += 1
        }
        if (ownPoints > opponentPoints) totals.wins += 1
        else if (ownPoints === opponentPoints) totals.draws += 1
        else totals.losses += 1
        const scoreKey = `${ownPoints}-${opponentPoints}`
        totals.matchScoreDistribution.set(scoreKey, (totals.matchScoreDistribution.get(scoreKey) ?? 0) + 1)
        totals.minimumOutcome = Math.min(totals.minimumOutcome, result.outcome)
        totals.maximumOutcome = Math.max(totals.maximumOutcome, result.outcome)
        if (reachedLevel2) {
            totals.level2Reached += 1
            const capped = solveExactSequence(sequence, 1, values)
            if (result.outcome > capped.outcome) totals.secondEvolveNecessary += 1
            else totals.secondEvolveNotNecessary += 1
        }
    }
    const actionCounts = Object.fromEntries([...Array(ACTION_COUNT).keys()].map((action) => [actionKey(action), totals.actionCounts[action]!]))
    const pickRate = Object.fromEntries([...Array(GENE_COUNT).keys()].map((gene) => [String(gene), totals.pickCounts[gene]! / (sequences.length * ROUND_COUNT)]))
    return {
        methodology: { exact: true, ruleVersion: AUDIT_RULE_VERSION, opponent: 'deterministic-immediate-greedy', sequences: sequences.length, stateEncoding: 'ten level bits (0-2) plus three cooldown bits', scope: 'exact best response to fixed greedy policy; not simultaneous-game equilibrium' },
        benchmark: { elapsedMs: Math.round(performance.now() - startedAt), statesVisited: totals.statesVisited, cacheHits: totals.cacheHits, cacheMisses: totals.cacheMisses, heapUsedBytes: process.memoryUsage().heapUsed },
        metrics: {
            wins: totals.wins, draws: totals.draws, losses: totals.losses, finalDrawRate: totals.draws / sequences.length, roundTies: totals.roundTies,
            level2Reached: totals.level2Reached, level2ReachRate: totals.level2Reached / sequences.length, level2Uses: totals.level2Uses,
            secondEvolveNecessary: totals.secondEvolveNecessary, secondEvolveNotNecessary: totals.secondEvolveNotNecessary,
            orderOutcomeSpread: totals.maximumOutcome - totals.minimumOutcome,
            actionCounts, pickRate, matchScoreDistribution: Object.fromEntries(totals.matchScoreDistribution),
            valuesByGene: Object.fromEntries([...Array(GENE_COUNT).keys()].map((gene) => [String(gene), { sum: totals.valuesByGene[gene]!, average: totals.valuesByGene[gene]! / Math.max(1, totals.pickCounts[gene]!) }])),
            valuesByEvent: Object.fromEntries(eventIds.map((eventId, event) => [eventId, { sum: totals.valuesByEvent[event]!, average: totals.valuesByEvent[event]! / sequences.length }])),
        },
    }
}

function isMain(): boolean { return process.argv[1]?.replaceAll('\\', '/').endsWith('/audit-exact.ts') ?? false }
if (isMain()) {
    const report = auditBaselineExact()
    const output = resolve(import.meta.dirname, '../artifacts/audit')
    mkdirSync(output, { recursive: true })
    writeFileSync(resolve(output, 'exact-baseline.json'), `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify(report))
}
