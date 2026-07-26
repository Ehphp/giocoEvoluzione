import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GENE_IDS, MAX_TRAIT_LEVEL } from '../shared/game-rules/index.ts'
import { actionKey, actionValue, assertAuditEquivalence, decodeState, generateSequences, getLevel, legalActions, transition, type AuditAction } from './audit-core.ts'

const ROUND_COUNT = 6
const STATE_COUNT = 4 ** GENE_IDS.length * (GENE_IDS.length + 1)
const EMPTY = -128
const traitByAlphabeticalName = [...GENE_IDS].sort()
const actionRank = (action: AuditAction) => (action.actionType === 'EVOLVE' ? 0 : GENE_IDS.length) + traitByAlphabeticalName.indexOf(GENE_IDS[action.trait]!)

function greedyAction(eventId: string, state: number): AuditAction {
    return legalActions(state)
        .filter((action) => action.actionType === 'USE')
        .sort((left, right) => actionValue(eventId, state, right) - actionValue(eventId, state, left) || actionRank(left) - actionRank(right))[0]!
}

function solve(sequence: string[], maxLevel = MAX_TRAIT_LEVEL) {
    const opponent: AuditAction[] = []
    const opponentStates: number[] = []
    let opponentState = 0
    for (const eventId of sequence) {
        opponentStates.push(opponentState)
        const action = greedyAction(eventId, opponentState)
        opponent.push(action)
        opponentState = transition(opponentState, action)
    }
    const rivalValues = sequence.map((eventId, round) => actionValue(eventId, opponentStates[round]!, opponent[round]!))
    const memo = new Int8Array((ROUND_COUNT + 1) * STATE_COUNT).fill(EMPTY)
    const choices = new Int8Array(ROUND_COUNT * STATE_COUNT)
    let memoizedStates = 0
    const search = (round: number, state: number): number => {
        if (round === ROUND_COUNT) return 0
        const index = round * STATE_COUNT + state
        if (memo[index] !== EMPTY) return memo[index]!
        memoizedStates += 1
        const { levelCode, cooldown } = decodeState(state)
        let bestScore = -127
        let bestTrait = 0
        let bestType: AuditAction['actionType'] = 'USE'
        let bestRank = Number.POSITIVE_INFINITY
        for (let trait = 0; trait < GENE_IDS.length; trait += 1) {
            const level = getLevel(levelCode, trait)
            const candidates: AuditAction[] = []
            if (trait !== cooldown) candidates.push({ trait, actionType: 'USE' })
            if (level < maxLevel) candidates.push({ trait, actionType: 'EVOLVE' })
            for (const action of candidates) {
                const ownValue = actionValue(sequence[round]!, state, action)
                const delta = ownValue === rivalValues[round] ? 0 : ownValue > rivalValues[round]! ? 1 : -1
                const candidateScore = delta + search(round + 1, transition(state, action))
                const rank = actionRank(action)
                if (candidateScore > bestScore || (candidateScore === bestScore && rank < bestRank)) {
                    bestScore = candidateScore
                    bestTrait = trait
                    bestType = action.actionType
                    bestRank = rank
                }
            }
        }
        memo[index] = bestScore
        choices[index] = bestTrait * 2 + (bestType === 'EVOLVE' ? 1 : 0)
        return bestScore
    }
    const outcome = search(0, 0)
    let state = 0
    const trace: Array<{ round: number; action: AuditAction; levelBefore: number; ownValue: number; rivalValue: number }> = []
    for (let round = 0; round < ROUND_COUNT; round += 1) {
        const code = choices[round * STATE_COUNT + state]!
        const action: AuditAction = { trait: Math.floor(code / 2), actionType: code % 2 ? 'EVOLVE' : 'USE' }
        const levelBefore = getLevel(decodeState(state).levelCode, action.trait)
        trace.push({ round: round + 1, action, levelBefore, ownValue: actionValue(sequence[round]!, state, action), rivalValue: rivalValues[round]! })
        state = transition(state, action)
    }
    return { outcome, trace, memoizedStates }
}

const startedAt = performance.now()
assertAuditEquivalence()
const sequences = generateSequences()
const totals = {
    wins: 0, draws: 0, losses: 0, roundTies: 0, level3Reached: 0, thirdEvolveRoundTotal: 0, thirdEvolveCount: 0, level3Uses: 0,
    optimalActions: {} as Record<string, number>, pickRate: {} as Record<string, number>, memoizedStates: 0,
    matchScoreDistribution: {} as Record<string, number>, thirdEvolveNecessary: 0, thirdEvolveNotNecessary: 0,
}
for (const sequence of sequences) {
    const result = solve(sequence)
    const cappedResult = solve(sequence, 2)
    totals.memoizedStates += result.memoizedStates + cappedResult.memoizedStates
    const optimizerPoints = result.trace.filter((entry) => entry.ownValue > entry.rivalValue).length
    const opponentPoints = result.trace.filter((entry) => entry.ownValue < entry.rivalValue).length
    if (optimizerPoints > opponentPoints) totals.wins += 1
    else if (optimizerPoints === opponentPoints) totals.draws += 1
    else totals.losses += 1
    const scoreKey = `${optimizerPoints}-${opponentPoints}`
    totals.matchScoreDistribution[scoreKey] = (totals.matchScoreDistribution[scoreKey] ?? 0) + 1
    let reached = false
    let thirdRound = 0
    for (const entry of result.trace) {
        const key = actionKey(entry.action)
        const gene = GENE_IDS[entry.action.trait]!
        totals.optimalActions[key] = (totals.optimalActions[key] ?? 0) + 1
        totals.pickRate[gene] = (totals.pickRate[gene] ?? 0) + 1
        if (entry.ownValue === entry.rivalValue) totals.roundTies += 1
        if (entry.action.actionType === 'EVOLVE' && entry.levelBefore === 2 && !reached) {
            reached = true
            thirdRound = entry.round
        }
        if (entry.action.actionType === 'USE' && entry.levelBefore === 3) totals.level3Uses += 1
    }
    if (reached) {
        totals.level3Reached += 1
        totals.thirdEvolveCount += 1
        totals.thirdEvolveRoundTotal += thirdRound
        if (result.outcome > cappedResult.outcome) totals.thirdEvolveNecessary += 1
        else totals.thirdEvolveNotNecessary += 1
    }
}
const report = {
    methodology: {
        exact: true,
        opponent: 'deterministic-immediate-greedy',
        sequences: sequences.length,
        stateEncoding: 'base-4 levels plus one cooldown slot',
        comparedStrategies: ['optimal with level 3 available', 'optimal capped at level 2'],
    },
    benchmark: { elapsedMs: Math.round(performance.now() - startedAt), memoizedStates: totals.memoizedStates },
    metrics: {
        ...totals,
        level3ReachRate: totals.level3Reached / sequences.length,
        averageThirdEvolveRound: totals.thirdEvolveCount ? totals.thirdEvolveRoundTotal / totals.thirdEvolveCount : null,
        averageLevel3UsesAfterReach: totals.level3Reached ? totals.level3Uses / totals.level3Reached : 0,
        finalDrawRate: totals.draws / sequences.length,
        thirdEvolveNecessaryRate: totals.thirdEvolveCount ? totals.thirdEvolveNecessary / totals.thirdEvolveCount : 0,
    },
}
const output = resolve(import.meta.dirname, '../artifacts/audit')
mkdirSync(output, { recursive: true })
writeFileSync(resolve(output, 'exact-baseline.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report))
