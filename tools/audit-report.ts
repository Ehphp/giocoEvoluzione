import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AUDIT_FITNESS_VERSION, AUDIT_RULE_VERSION, AUDIT_SEED } from './audit-config.ts'
import { COOLDOWN_NONE, actionGene, actionValue, generateSequences, getLegalActions, isEvolve, nextState, type AuditAction } from './audit-core.ts'
import { auditBaselineExact } from './audit-exact.ts'

type Policy = { id: string; choose: (event: number, state: number) => AuditAction }
const rank = (action: number) => (isEvolve(action) ? 0 : 5) + actionGene(action)
const greedy: Policy = { id: 'greedy', choose(event, state) { let best = -1, value = -99; for (const action of getLegalActions(state)) if (!isEvolve(action) && (actionValue(event, state, action) > value || (actionValue(event, state, action) === value && rank(action) < rank(best)))) { best = action; value = actionValue(event, state, action) } return best } }
const evolveFirst: Policy = { id: 'evolve-first', choose(event, state) { for (const action of getLegalActions(state)) if (isEvolve(action)) return action; return greedy.choose(event, state) } }
const antiCooldown: Policy = { id: 'anti-cooldown', choose(event, state) { const actions = [...getLegalActions(state)].filter((action) => !isEvolve(action)); return actions.sort((left, right) => actionGene(left) - actionGene(right) || actionValue(event, state, right) - actionValue(event, state, left))[0] ?? greedy.choose(event, state) } }
function tournament() {
    const policies = [greedy, evolveFirst, antiCooldown]; const sequences = generateSequences(); const wins = Object.fromEntries(policies.map((policy) => [policy.id, 0])) as Record<string, number>; let ties = 0
    for (const sequence of sequences) for (let left = 0; left < policies.length; left += 1) for (let right = left + 1; right < policies.length; right += 1) {
        let leftState = COOLDOWN_NONE << 10, rightState = COOLDOWN_NONE << 10, leftScore = 0, rightScore = 0
        for (const event of sequence) { const leftAction = policies[left]!.choose(event, leftState), rightAction = policies[right]!.choose(event, rightState); const leftValue = actionValue(event, leftState, leftAction), rightValue = actionValue(event, rightState, rightAction); if (leftValue > rightValue) leftScore += 1; if (rightValue > leftValue) rightScore += 1; leftState = nextState(leftState, leftAction); rightState = nextState(rightState, rightAction) }
        if (leftScore === rightScore) ties += 1; else wins[leftScore > rightScore ? policies[left]!.id : policies[right]!.id] += 1
    }
    return { seed: AUDIT_SEED, sequences: sequences.length, policies: policies.map((policy) => policy.id), wins, ties, methodology: 'deterministic policy tournament; not a stochastic population estimate' }
}
const exact = auditBaselineExact(); const policyTournament = tournament(); const output = resolve(import.meta.dirname, '../artifacts/audit'); mkdirSync(output, { recursive: true })
const report = { ruleVersion: AUDIT_RULE_VERSION, fitnessVersion: AUDIT_FITNESS_VERSION, exact, policyTournament }
writeFileSync(resolve(output, 'baseline-report.json'), `${JSON.stringify(report, null, 2)}\n`)
const lines = ['# Audit baseline — five genes', '', `- Regole: ${AUDIT_RULE_VERSION}; fitness: ${AUDIT_FITNESS_VERSION}.`, `- Esatto (best response contro greedy): ${exact.benchmark.elapsedMs} ms, ${exact.benchmark.statesVisited} stati visitati, cache ${exact.benchmark.cacheHits}/${exact.benchmark.cacheMisses} hit/miss.`, `- Torneo policy seeded (${policyTournament.sequences} ordini): ${Object.entries(policyTournament.wins).map(([id, wins]) => `${id}=${wins}`).join(', ')}; pareggi=${policyTournament.ties}.`, '', 'Le metriche esatte e il torneo sono distinti: nessuno dei due modifica il catalogo produttivo o costituisce una raccomandazione definitiva.']
writeFileSync(resolve(output, 'baseline-report.md'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
