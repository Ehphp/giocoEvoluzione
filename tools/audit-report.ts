import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AUDIT_FITNESS_VERSION, AUDIT_RULE_VERSION, AUDIT_SEED } from './audit-config.ts'
import { COOLDOWN_NONE, actionGene, actionValue, generateSequences, getLegalActions, isEvolve, nextState, type AuditAction } from './audit-core.ts'
import { auditBaselineExact } from './audit-exact.ts'

type Policy = { id: string; choose: (sequence: readonly number[], round: number, state: number) => AuditAction }

const rank = (action: number) => (isEvolve(action) ? 0 : 5) + actionGene(action)
function bestUse(event: number, state: number): AuditAction {
    let best = -1
    let value = -99
    for (const action of getLegalActions(state)) if (!isEvolve(action) && (actionValue(event, state, action) > value || (actionValue(event, state, action) === value && rank(action) < rank(best)))) {
        best = action
        value = actionValue(event, state, action)
    }
    return best
}

const greedy: Policy = { id: 'greedy', choose(sequence, round, state) { return bestUse(sequence[round]!, state) } }
const evolveFirst: Policy = { id: 'evolve-first', choose(sequence, round, state) { for (const action of getLegalActions(state)) if (isEvolve(action)) return action; return bestUse(sequence[round]!, state) } }
const antiCooldown: Policy = { id: 'anti-cooldown', choose(sequence, round, state) {
    const event = sequence[round]!
    const actions = [...getLegalActions(state)].filter((action) => !isEvolve(action))
    return actions.sort((left, right) => actionGene(left) - actionGene(right) || actionValue(event, state, right) - actionValue(event, state, left))[0] ?? bestUse(event, state)
} }

// Audit-only policy: it knows the remaining event order and evolves only when
// the projected best-USE gain in later rounds exceeds the score it gives up.
const futureValueEvolve: Policy = { id: 'future-value-evolve', choose(sequence, round, state) {
    const currentUse = bestUse(sequence[round]!, state)
    const roundCost = 1
    let bestEvolution = -1
    let bestGain = Number.NEGATIVE_INFINITY
    for (const action of getLegalActions(state)) if (isEvolve(action)) {
        const evolvedState = nextState(state, action)
        let futureGain = 0
        for (let futureRound = round + 1; futureRound < sequence.length; futureRound += 1) {
            const event = sequence[futureRound]!
            futureGain += Math.max(0, actionValue(event, evolvedState, bestUse(event, evolvedState)) - actionValue(event, state, bestUse(event, state)))
        }
        if (futureGain > bestGain || (futureGain === bestGain && rank(action) < rank(bestEvolution))) {
            bestEvolution = action
            bestGain = futureGain
        }
    }
    return bestEvolution >= 0 && bestGain > roundCost ? bestEvolution : currentUse
} }

function tournament() {
    const policies = [greedy, evolveFirst, antiCooldown, futureValueEvolve]
    const sequences = generateSequences()
    const wins = Object.fromEntries(policies.map((policy) => [policy.id, 0])) as Record<string, number>
    const actionCounts = Object.fromEntries(policies.map((policy) => [policy.id, { total: 0, evolves: 0 }])) as Record<string, { total: number; evolves: number }>
    let ties = 0
    for (const sequence of sequences) for (let left = 0; left < policies.length; left += 1) for (let right = left + 1; right < policies.length; right += 1) {
        let leftState = COOLDOWN_NONE << 10, rightState = COOLDOWN_NONE << 10, leftScore = 0, rightScore = 0
        for (let round = 0; round < sequence.length; round += 1) {
            const event = sequence[round]!
            const leftAction = policies[left]!.choose(sequence, round, leftState)
            const rightAction = policies[right]!.choose(sequence, round, rightState)
            for (const [policy, action] of [[policies[left]!, leftAction], [policies[right]!, rightAction]] as const) {
                actionCounts[policy.id].total += 1
                if (isEvolve(action)) actionCounts[policy.id].evolves += 1
            }
            const leftValue = actionValue(event, leftState, leftAction), rightValue = actionValue(event, rightState, rightAction)
            if (leftValue > rightValue) leftScore += 1
            if (rightValue > leftValue) rightScore += 1
            leftState = nextState(leftState, leftAction)
            rightState = nextState(rightState, rightAction)
        }
        if (leftScore === rightScore) ties += 1
        else wins[leftScore > rightScore ? policies[left]!.id : policies[right]!.id] += 1
    }
    const matchesPerPolicy = sequences.length * (policies.length - 1)
    const totalWins = Object.values(wins).reduce((total, count) => total + count, 0)
    return {
        seed: AUDIT_SEED, sequences: sequences.length, policies: policies.map((policy) => policy.id), wins,
        winRates: Object.fromEntries(Object.entries(wins).map(([id, count]) => [id, count / matchesPerPolicy])),
        winShares: Object.fromEntries(Object.entries(wins).map(([id, count]) => [id, count / Math.max(1, totalWins)])),
        evolveRates: Object.fromEntries(Object.entries(actionCounts).map(([id, count]) => [id, count.evolves / count.total])),
        ties,
        methodology: 'deterministic policy tournament; future-value-evolve knows the remaining event order and evolves only when expected later gains exceed this round cost',
    }
}

const exact = auditBaselineExact()
const policyTournament = tournament()
const pickRates = Object.values(exact.metrics.pickRate as Record<string, number>)
const evolveActions = Object.entries(exact.metrics.actionCounts as Record<string, number>).filter(([action]) => action.startsWith('EVOLVE:')).reduce((total, [, count]) => total + count, 0)
const acceptance = {
    maxGenePickRate: Math.max(...pickRates),
    maxPolicyWinRate: Math.max(...Object.values(policyTournament.winRates)),
    maxPolicyWinShare: Math.max(...Object.values(policyTournament.winShares)),
    evolveRate: evolveActions / (policyTournament.sequences * 6),
    orderOutcomeSpread: Number(exact.metrics.orderOutcomeSpread),
}
const report = {
    ruleVersion: AUDIT_RULE_VERSION,
    fitnessVersion: AUDIT_FITNESS_VERSION,
    exact,
    policyTournament,
    acceptance: {
        ...acceptance,
        passes: {
            geneBalance: acceptance.maxGenePickRate <= 0.30,
            policyBalance: acceptance.maxPolicyWinShare <= 0.60,
            evolveUsedButNotAutomatic: acceptance.evolveRate >= 0.08 && acceptance.evolveRate < 0.50,
            eventOrderMatters: acceptance.orderOutcomeSpread > 0,
        },
    },
}
const output = resolve(import.meta.dirname, '../artifacts/audit')
mkdirSync(output, { recursive: true })
writeFileSync(resolve(output, 'baseline-report.json'), `${JSON.stringify(report, null, 2)}\n`)
const lines = [
    '# Audit baseline - five genes', '',
    `- Regole: ${AUDIT_RULE_VERSION}; fitness: ${AUDIT_FITNESS_VERSION}.`,
    `- Esatto (best response contro greedy): ${exact.benchmark.elapsedMs} ms, ${exact.benchmark.statesVisited} stati visitati, cache ${exact.benchmark.cacheHits}/${exact.benchmark.cacheMisses} hit/miss.`,
    `- Torneo policy seeded (${policyTournament.sequences} ordini): ${Object.entries(policyTournament.winRates).map(([id, rate]) => `${id}=${(rate * 100).toFixed(1)}%`).join(', ')}; pareggi=${policyTournament.ties}.`,
    `- Criteri: scelta gene max ${(acceptance.maxGenePickRate * 100).toFixed(1)}%; quota vittorie policy max ${(acceptance.maxPolicyWinShare * 100).toFixed(1)}% (win rate testa-a-testa max ${(acceptance.maxPolicyWinRate * 100).toFixed(1)}%); evolve ${(acceptance.evolveRate * 100).toFixed(1)}%; spread ordine=${acceptance.orderOutcomeSpread}.`, '',
    'La policy future-value-evolve e un controllo di audit: conosce l ordine futuro e valuta il guadagno atteso prima di rinunciare al punteggio corrente.',
]
writeFileSync(resolve(output, 'baseline-report.md'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
