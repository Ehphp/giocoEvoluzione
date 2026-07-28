import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { ADAPTATION_IDS, EVOLVE_ROUND_VALUE, ROUND_EVENT_DEFINITIONS, createLookaheadPolicy, createParametricPolicy, createSeededRandom, evolveFirstPolicy, getAdaptationRoundValue, getLegalBotActions, getRoundEventById, greedyUsePolicy, heuristicPolicy, resolveRound, simulateMatch, type BotPolicy, type LookaheadStats, type SimulatedMatchReport } from '../shared/game-rules/index.ts'

type Counter = { decisions: number; opportunities: number; selected: number; immediateRegretSum: number; immediateBest: number; nearBest: number; clearlyBad: number; nextVisibleGainSum: number; winnerChanged: number }
type GeneMetric = { use: number; evolve: number; value: number; roundWins: number; evolutions: number; events: Record<string, number>; cooldownImposed: number }
const seed = 1592598566
const deep = process.argv.includes('--deep'); const mode = deep ? 'deep' : 'quick'
const sequences = (() => { const ids = ROUND_EVENT_DEFINITIONS.map((event) => event.id); const random = createSeededRandom(seed); return Array.from({ length: deep ? 4 : 3 }, () => { const copy = [...ids]; for (let index = copy.length - 1; index > 0; index -= 1) { const swap = Math.floor(random() * (index + 1)); [copy[index], copy[swap]] = [copy[swap]!, copy[index]!] } return [...copy, copy[0]!] }) })()
const makeStats = (): LookaheadStats => ({ statesVisited: 0, cacheHits: 0, cacheMisses: 0 })
const policies = [
    { id: 'lookahead-2', stats: makeStats(), policy: null as unknown as BotPolicy }, { id: 'lookahead-3', stats: makeStats(), policy: null as unknown as BotPolicy }, { id: 'lookahead-4', stats: makeStats(), policy: null as unknown as BotPolicy }, { id: 'lookahead-full-last-3', stats: makeStats(), policy: null as unknown as BotPolicy },
]
policies[0]!.policy = createLookaheadPolicy({ depth: 2, stats: policies[0]!.stats }); policies[1]!.policy = createLookaheadPolicy({ depth: 3, stats: policies[1]!.stats }); policies[2]!.policy = createLookaheadPolicy({ depth: 4, fullSearchLastRounds: 4, id: 'lookahead-4', stats: policies[2]!.stats }); policies[3]!.policy = createLookaheadPolicy({ depth: 2, fullSearchLastRounds: 3, stats: policies[3]!.stats })
const geneMetrics = (): Record<string, GeneMetric> => Object.fromEntries(ADAPTATION_IDS.map((gene) => [gene, { use: 0, evolve: 0, value: 0, roundWins: 0, evolutions: 0, events: {}, cooldownImposed: 0 }]))
function winnerForSide(report: SimulatedMatchReport, side: 'left' | 'right') { return report.winner === side }
function inspectAction(counter: Counter, genes: Record<string, GeneMetric>, report: SimulatedMatchReport, roundIndex: number, side: 'left' | 'right', policy: BotPolicy, opponent: BotPolicy, sequence: string[], matchSeed: number) {
    const round = report.trace[roundIndex]!; const action = side === 'left' ? round.leftAction : round.rightAction; const own = side === 'left' ? round.leftAdaptationsBefore : round.rightAdaptationsBefore; const rival = side === 'left' ? round.rightAdaptationsBefore : round.leftAdaptationsBefore
    const metric = genes[action.trait]!; metric.events[round.eventId] = (metric.events[round.eventId] ?? 0) + 1; metric.value += side === 'left' ? round.leftValue : round.rightValue; if (round.winnerId === side) metric.roundWins += 1
    const legal = getLegalBotActions(own); const bestUse = Math.max(...legal.filter((candidate) => candidate.actionType === 'USE').map((candidate) => getAdaptationRoundValue(round.event, own, candidate.trait)))
    for (const _evolution of legal.filter((candidate) => candidate.actionType === 'EVOLVE')) { const regret = Math.max(bestUse, EVOLVE_ROUND_VALUE) - EVOLVE_ROUND_VALUE; counter.opportunities += 1; counter.immediateRegretSum += regret; if (regret === 0) counter.immediateBest += 1; else if (regret <= 1) counter.nearBest += 1; else counter.clearlyBad += 1 }
    if (action.actionType === 'USE') { metric.use += 1; metric.cooldownImposed += 1; return }
    metric.evolve += 1; metric.evolutions += 1; counter.selected += 1
    const nextEvent = sequence[round.roundNumber] ? getRoundEventById(sequence[round.roundNumber]!) : null
    if (nextEvent) { const evolved = { ...own, [action.trait]: { ...own[action.trait], level: own[action.trait].level + 1 } }; counter.nextVisibleGainSum += getAdaptationRoundValue(nextEvent, evolved, action.trait) - getAdaptationRoundValue(nextEvent, own, action.trait) }
    const otherAction = side === 'left' ? round.rightAction : round.leftAction; const replacement = legal.filter((candidate) => candidate.actionType === 'USE').sort((a, b) => getAdaptationRoundValue(round.event, own, b.trait) - getAdaptationRoundValue(round.event, own, a.trait))[0]
    if (!replacement) return
    const resolution = side === 'left'
        ? resolveRound({ roundNumber: round.roundNumber, roundEvent: round.event, player1Id: 'left', player2Id: 'right', player1Traits: own, player2Traits: rival, player1Action: { playerId: 'left', ...replacement }, player2Action: { playerId: 'right', ...otherAction } })
        : resolveRound({ roundNumber: round.roundNumber, roundEvent: round.event, player1Id: 'left', player2Id: 'right', player1Traits: rival, player2Traits: own, player1Action: { playerId: 'left', ...otherAction }, player2Action: { playerId: 'right', ...replacement } })
    const priorRoundValues = report.trace.slice(0, roundIndex).map((entry) => ({ player1Value: entry.leftValue, player2Value: entry.rightValue })); priorRoundValues.push({ player1Value: resolution.player1.roundValue, player2Value: resolution.player2.roundValue })
    const alternative = simulateMatch({ leftPolicy: side === 'left' ? policy : opponent, rightPolicy: side === 'left' ? opponent : policy, eventSequence: sequence, seed: matchSeed, offline: true, priorRoundValues, initialState: { roundNumber: round.roundNumber + 1, leftScore: round.leftScoreBefore + resolution.player1ScoreDelta, rightScore: round.rightScoreBefore + resolution.player2ScoreDelta, leftAdaptations: resolution.player1.traits, rightAdaptations: resolution.player2.traits } })
    if (winnerForSide(report, side) !== winnerForSide(alternative, side)) counter.winnerChanged += 1
}
function main() {
    const started = performance.now(); const result: Record<string, unknown> = {}
    const candidates = deep ? policies : policies.slice(0, 2); const opponents = deep ? [greedyUsePolicy, heuristicPolicy, createLookaheadPolicy({ depth: 2 }), createParametricPolicy({ id: 'param-matchup', useMatchup: true }), evolveFirstPolicy] : [greedyUsePolicy]
    for (const candidate of candidates) {
        const counter: Counter = { decisions: 0, opportunities: 0, selected: 0, immediateRegretSum: 0, immediateBest: 0, nearBest: 0, clearlyBad: 0, nextVisibleGainSum: 0, winnerChanged: 0 }; const genes = geneMetrics(); let wins = 0; let draws = 0; let losses = 0
        for (const opponent of opponents) for (let sequenceIndex = 0; sequenceIndex < sequences.length; sequenceIndex += 1) for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
            const left = sideIndex === 0 ? candidate.policy : opponent; const right = sideIndex === 0 ? opponent : candidate.policy; const report = simulateMatch({ leftPolicy: left, rightPolicy: right, eventSequence: sequences[sequenceIndex]!, seed: seed ^ (sequenceIndex + 1) ^ (sideIndex + 1) ^ opponent.id.length, trace: true, offline: true }); const side = sideIndex === 0 ? 'left' : 'right'
            if (report.winner === side) wins += 1; else if (!report.winner) draws += 1; else losses += 1
            for (let roundIndex = 0; roundIndex < report.trace.length; roundIndex += 1) { counter.decisions += 1; inspectAction(counter, genes, report, roundIndex, side, candidate.policy, opponent, sequences[sequenceIndex]!, seed ^ (sequenceIndex + 1) ^ (sideIndex + 1) ^ opponent.id.length) }
        }
        result[candidate.id] = { matches: wins + draws + losses, wins, draws, losses, evolve: { ...counter, selectedRate: counter.selected / Math.max(1, counter.decisions), averageImmediateRegret: counter.immediateRegretSum / Math.max(1, counter.opportunities), averageNextVisibleGain: counter.nextVisibleGainSum / Math.max(1, counter.selected) }, genes, lookahead: candidate.stats }
    }
    const payload = { mode, seed, sequences, opponents: opponents.map((opponent) => opponent.id), methodology: `Offline privileged ${mode} diagnostic: remaining event order is supplied only to audit lookahead policies. Deep uses a deterministic stratified sample of four event orders, five opponents and both orientations; it is not a simultaneous-game equilibrium. Regret is the immediate best USE value minus EVOLVE=2.`, elapsedMs: Math.round(performance.now() - started), policies: result }
    const output = resolve(import.meta.dirname, '../artifacts/audit'); const base = deep ? 'evolution-depth' : 'evolution'; mkdirSync(output, { recursive: true }); writeFileSync(resolve(output, `${base}.json`), `${JSON.stringify(payload, null, 2)}\n`)
    const lines = ['# Evolution diagnostic', '', `- ${payload.elapsedMs} ms; ${sequences.length} seeded event sequences.`, '', '| Policy | W-D-L | EVOLVE/decisioni | Regret medio | Best/Near/Bad | Gain prossimo evento | Winner changed | Cache hit/miss |', '|---|---:|---:|---:|---:|---:|---:|---:|', ...Object.entries(result).map(([id, value]) => { const metric = value as { wins: number; draws: number; losses: number; evolve: Counter & { selectedRate: number; averageImmediateRegret: number; averageNextVisibleGain: number }; lookahead: LookaheadStats }; return `| ${id} | ${metric.wins}-${metric.draws}-${metric.losses} | ${metric.evolve.selected}/${metric.evolve.decisions} (${(metric.evolve.selectedRate * 100).toFixed(1)}%) | ${metric.evolve.averageImmediateRegret.toFixed(2)} | ${metric.evolve.immediateBest}/${metric.evolve.nearBest}/${metric.evolve.clearlyBad} | ${metric.evolve.averageNextVisibleGain.toFixed(2)} | ${metric.evolve.winnerChanged} | ${metric.lookahead.cacheHits}/${metric.lookahead.cacheMisses} |` })]
    writeFileSync(resolve(output, `${base}.md`), `${lines.join('\n')}\n`); console.log(JSON.stringify({ audit: `evolution-${mode}`, elapsedMs: payload.elapsedMs }))
}
main()
