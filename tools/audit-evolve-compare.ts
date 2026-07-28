import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const output = resolve(import.meta.dirname, '../artifacts/audit')
const read = (name: string) => JSON.parse(readFileSync(resolve(output, name), 'utf8'))
const previousEvolution = read('evolution-evolve-1.json'); const currentEvolution = read('evolution.json'); const previousMetagame = read('metagame-evolve-1.json'); const currentMetagame = read('metagame.json')
const evolution = (report: Record<string, unknown>) => (report.policies as Record<string, { evolve: { selectedRate: number; averageImmediateRegret: number; nearBest: number; opportunities: number } }>)['lookahead-2']!.evolve
const policy = (report: Record<string, unknown>, id: string) => (report.summary as Record<string, { winRate: number; scoreRate?: number; wins: number; draws: number; matches: number }>) [id]!
const scoreRate = (entry: { scoreRate?: number; wins: number; draws: number; matches: number }) => entry.scoreRate ?? (entry.wins + entry.draws * 0.5) / entry.matches
const beforeEvolution = evolution(previousEvolution); const afterEvolution = evolution(currentEvolution); const beforeEvolveFirst = policy(previousMetagame, 'evolve-first'); const afterEvolveFirst = policy(currentMetagame, 'evolve-first'); const beforeLookahead = policy(previousMetagame, 'lookahead-2'); const afterLookahead = policy(currentMetagame, 'lookahead-2')
const rows = [
    ['Frequenza ottimale EVOLVE (lookahead-2)', beforeEvolution.selectedRate, afterEvolution.selectedRate],
    ['Regret immediato medio', beforeEvolution.averageImmediateRegret, afterEvolution.averageImmediateRegret],
    ['Near-best EVOLVE', beforeEvolution.nearBest / beforeEvolution.opportunities, afterEvolution.nearBest / afterEvolution.opportunities],
    ['Win rate evolve-first', beforeEvolveFirst.winRate, afterEvolveFirst.winRate],
    ['Score rate evolve-first', scoreRate(beforeEvolveFirst), scoreRate(afterEvolveFirst)],
    ['Win rate lookahead-2', beforeLookahead.winRate, afterLookahead.winRate],
    ['Score rate lookahead-2', scoreRate(beforeLookahead), scoreRate(afterLookahead)],
    ['Pareggi policy diverse', previousMetagame.metrics.distinctPolicyDrawRate as number, currentMetagame.metrics.distinctPolicyDrawRate as number],
    ['Margine finale medio', previousMetagame.metrics.averageFinalMargin as number, currentMetagame.metrics.averageFinalMargin as number],
].map(([metric, before, after]) => ({ metric, evolve1: before, evolve2: after, difference: (after as number) - (before as number) }))
const payload = { methodology: 'Comparison of preserved EVOLVE=1 artifacts with the current EVOLVE=2 artifacts, on the same seeded audit configurations.', rows }
writeFileSync(resolve(output, 'evolve-value-comparison.json'), `${JSON.stringify(payload, null, 2)}\n`)
const percent = new Set(['Frequenza ottimale EVOLVE (lookahead-2)', 'Near-best EVOLVE', 'Win rate evolve-first', 'Score rate evolve-first', 'Win rate lookahead-2', 'Score rate lookahead-2', 'Pareggi policy diverse'])
const format = (metric: string, value: number) => percent.has(metric) ? `${(value * 100).toFixed(1)}%` : value.toFixed(2)
const lines = ['# Confronto EVOLVE = 1 → 2', '', '| Metrica | EVOLVE=1 | EVOLVE=2 | Differenza |', '|---|---:|---:|---:|', ...rows.map((row) => `| ${row.metric} | ${format(row.metric, row.evolve1)} | ${format(row.metric, row.evolve2)} | ${format(row.metric, row.difference)} |`)]
writeFileSync(resolve(output, 'evolve-value-comparison.md'), `${lines.join('\n')}\n`)
console.log(JSON.stringify({ comparison: 'evolve-value', metrics: rows.length }))
