import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { ADAPTATION_IDS, COMBAT_MUTATION_IDS, ROUND_EVENT_DEFINITIONS, RULE_VERSION, TOTAL_ROUNDS, createLookaheadPolicy, createParametricPolicy, createSeededRandom, evolveFirstPolicy, greedyUsePolicy, heuristicPolicy, randomPolicy, simulateMatch, type BotPolicy, type CombatMutationLoadout, type LookaheadStats } from '../shared/game-rules/index.ts'

type Outcome = { wins: number; draws: number; losses: number; leftWins: number; rightWins: number; actions: number; uses: number; evolves: number; genes: Record<string, number>; levels: number; matches: number }
type Repro = { reason: string; seed: number; events: string[]; leftPolicy: string; rightPolicy: string; score: string }
const seed = 1592598566
const sequences = (() => { const all = ROUND_EVENT_DEFINITIONS.map((event) => event.id); const result: string[][] = []; const random = createSeededRandom(seed); for (let sample = 0; sample < 3; sample += 1) { const copy = [...all]; for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j]!, copy[i]!] } result.push([...copy, copy[0]!]) } return result })()
const lookaheadStats: LookaheadStats = { statesVisited: 0, cacheHits: 0, cacheMisses: 0 }
const policies: BotPolicy[] = [randomPolicy, greedyUsePolicy, evolveFirstPolicy, heuristicPolicy, createLookaheadPolicy({ depth: 2, stats: lookaheadStats }), createParametricPolicy({ id: 'param-evolve-1', evolveRounds: 1 }), createParametricPolicy({ id: 'param-matchup', useMatchup: true }), createParametricPolicy({ id: 'param-evolve-behind', evolveWhen: 'behind' })]
const id = (policy: BotPolicy) => policy.id
const hash = (value: string) => { let result = 2166136261; for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619) } return result >>> 0 }
const empty = (): Outcome => ({ wins: 0, draws: 0, losses: 0, leftWins: 0, rightWins: 0, actions: 0, uses: 0, evolves: 0, genes: Object.fromEntries(ADAPTATION_IDS.map((gene) => [gene, 0])), levels: 0, matches: 0 })
const addAction = (outcome: Outcome, action: { trait: string; actionType: string }) => { outcome.actions += 1; outcome.genes[action.trait] += 1; if (action.actionType === 'USE') outcome.uses += 1; else outcome.evolves += 1 }
const loadouts: CombatMutationLoadout[] = COMBAT_MUTATION_IDS.flatMap((first, index) => COMBAT_MUTATION_IDS.slice(index + 1).map((second) => [first, second] as CombatMutationLoadout))
const loadoutKey = (loadout: CombatMutationLoadout) => loadout.join('+')
type LoadoutOutcome = { matches: number; wins: number; draws: number; losses: number; leftWins: number; rightWins: number; evolves: number; exhaustedAfterUse: number; tiebreaks: number; illegalActions: number; activations: Record<string, number> }
const emptyLoadoutOutcome = (): LoadoutOutcome => ({ matches: 0, wins: 0, draws: 0, losses: 0, leftWins: 0, rightWins: 0, evolves: 0, exhaustedAfterUse: 0, tiebreaks: 0, illegalActions: 0, activations: Object.fromEntries(COMBAT_MUTATION_IDS.map((mutation) => [mutation, 0])) })
function main() {
    const started = performance.now(); const results = Object.fromEntries(policies.map((policy) => [id(policy), empty()])) as Record<string, Outcome>
    const headToHead: Record<string, { left: string; right: string; matches: number; leftWins: number; rightWins: number; draws: number }> = {}
    const combatMutations = { elasticActivations: 0, adaptiveCoreArmed: 0, adaptiveCoreBonuses: 0, adaptiveCoreUnspentAtEnd: 0 }
    const evolutionByGene: Record<string, number> = Object.fromEntries(ADAPTATION_IDS.map((gene) => [gene, 0])); const evolutionByRound: Record<string, number> = {}; const decidedByRound: Record<string, number> = {}; const endReasons: Record<string, number> = {}; const matchupDetail: Record<string, { frequency: number; decisive: number; bonusTotal: number }> = {}; let tiebreaks = 0; let decidedEarly = 0; let matchups = 0; let decisiveMatchups = 0; let distinctPolicyMatches = 0; let distinctPolicyDraws = 0; let finalMarginTotal = 0; const examples: Repro[] = []
    for (let leftIndex = 0; leftIndex < policies.length; leftIndex += 1) for (let rightIndex = 0; rightIndex < policies.length; rightIndex += 1) for (let sequenceIndex = 0; sequenceIndex < sequences.length; sequenceIndex += 1) for (let seedOffset = 0; seedOffset < 2; seedOffset += 1) {
        const left = policies[leftIndex]!; const right = policies[rightIndex]!; const pairKey = [id(left), id(right)].sort().join('|'); const matchSeed = seed ^ hash(pairKey) ^ Math.imul(sequenceIndex + 1, 101) ^ Math.imul(seedOffset + 1, 7919)
        const report = simulateMatch({ leftPolicy: left, rightPolicy: right, eventSequence: sequences[sequenceIndex]!, seed: matchSeed, trace: true })
        const key = `${id(left)}__${id(right)}`; const duel = headToHead[key] ??= { left: id(left), right: id(right), matches: 0, leftWins: 0, rightWins: 0, draws: 0 }; duel.matches += 1
        const leftResult = results[id(left)]!; const rightResult = results[id(right)]!; leftResult.matches += 1; rightResult.matches += 1
        if (report.winner === 'left') { leftResult.wins += 1; leftResult.leftWins += 1; rightResult.losses += 1; duel.leftWins += 1 } else if (report.winner === 'right') { rightResult.wins += 1; rightResult.rightWins += 1; leftResult.losses += 1; duel.rightWins += 1 } else { leftResult.draws += 1; rightResult.draws += 1; duel.draws += 1 }
        if (report.tiebreak) tiebreaks += 1
        endReasons[report.endReason ?? 'UNFINISHED'] = (endReasons[report.endReason ?? 'UNFINISHED'] ?? 0) + 1; finalMarginTotal += Math.abs(report.finalScore.left - report.finalScore.right)
        if (id(left) !== id(right)) { distinctPolicyMatches += 1; if (!report.winner) distinctPolicyDraws += 1 }
        let locked = false; let scoreAtRoundLeft = 0; let scoreAtRoundRight = 0
        for (const round of report.trace) {
            addAction(leftResult, round.leftAction); addAction(rightResult, round.rightAction)
            for (const effect of [...round.leftMutationEffects, ...round.rightMutationEffects]) {
                if (effect.id === 'ELASTIC_LIMBS') combatMutations.elasticActivations += 1
                else if (effect.effect === 'CORE_ARMED') combatMutations.adaptiveCoreArmed += 1
                else combatMutations.adaptiveCoreBonuses += 1
            }
            for (const action of [round.leftAction, round.rightAction]) if (action.actionType === 'EVOLVE') { evolutionByGene[action.trait] += 1; evolutionByRound[String(round.roundNumber)] = (evolutionByRound[String(round.roundNumber)] ?? 0) + 1 }
            for (const [action, opponentAction, breakdown] of [[round.leftAction, round.rightAction, round.leftBreakdown], [round.rightAction, round.leftAction, round.rightBreakdown]] as const) if (breakdown.matchupBonus) { const key = `${action.trait}>${opponentAction.trait}`; const detail = matchupDetail[key] ??= { frequency: 0, decisive: 0, bonusTotal: 0 }; matchups += 1; detail.frequency += 1; detail.bonusTotal += breakdown.matchupBonus; if (Math.abs(round.leftValue - round.rightValue) <= Math.abs(breakdown.matchupBonus)) { decisiveMatchups += 1; detail.decisive += 1 } }
            if (round.winnerId === 'left') scoreAtRoundLeft += 1
            if (round.winnerId === 'right') scoreAtRoundRight += 1
            const remaining = 7 - round.roundNumber
            if (!locked && (Math.abs(scoreAtRoundLeft - scoreAtRoundRight) > remaining || scoreAtRoundLeft >= 4 || scoreAtRoundRight >= 4) && round.roundNumber < 7) { decidedEarly += 1; decidedByRound[String(round.roundNumber)] = (decidedByRound[String(round.roundNumber)] ?? 0) + 1; locked = true }
        }
        combatMutations.adaptiveCoreUnspentAtEnd += Number(report.finalCombatMutationStates.left.adaptiveCoreStatus === 'ARMED') + Number(report.finalCombatMutationStates.right.adaptiveCoreStatus === 'ARMED')
        for (const side of ['left', 'right'] as const) results[id(side === 'left' ? left : right)]!.levels += Object.values(report.finalAdaptations[side]).reduce((sum, trait) => sum + trait.level, 0)
        const winnerRate = report.winner === 'left' ? leftResult.wins / leftResult.matches : report.winner === 'right' ? rightResult.wins / rightResult.matches : 0
        if (examples.length < 12 && (report.tiebreak || winnerRate > 0.72)) examples.push({ reason: report.tiebreak ? 'Tie-break' : 'Win rate iniziale anomalo', seed: matchSeed, events: sequences[sequenceIndex]!, leftPolicy: id(left), rightPolicy: id(right), score: `${report.finalScore.left}-${report.finalScore.right}` })
    }
    const loadoutResults = Object.fromEntries(loadouts.map((loadout) => [loadoutKey(loadout), emptyLoadoutOutcome()])) as Record<string, LoadoutOutcome>
    const loadoutHeadToHead: Array<{ left: string; right: string; matches: number; leftWins: number; rightWins: number; draws: number; tiebreaks: number; illegalActions: number }> = []
    for (const leftLoadout of loadouts) for (const rightLoadout of loadouts) {
        const duel = { left: loadoutKey(leftLoadout), right: loadoutKey(rightLoadout), matches: 0, leftWins: 0, rightWins: 0, draws: 0, tiebreaks: 0, illegalActions: 0 }
        for (let sequenceIndex = 0; sequenceIndex < sequences.length; sequenceIndex += 1) for (let seedOffset = 0; seedOffset < 2; seedOffset += 1) {
            const matchSeed = seed ^ hash(`${duel.left}|${duel.right}|${sequenceIndex}|${seedOffset}`)
            try {
                const report = simulateMatch({ leftPolicy: heuristicPolicy, rightPolicy: heuristicPolicy, eventSequence: sequences[sequenceIndex]!, seed: matchSeed, trace: true, initialState: { leftCombatMutationLoadout: leftLoadout, rightCombatMutationLoadout: rightLoadout } })
                const replay = simulateMatch({ leftPolicy: heuristicPolicy, rightPolicy: heuristicPolicy, eventSequence: sequences[sequenceIndex]!, seed: matchSeed, trace: true, initialState: { leftCombatMutationLoadout: leftLoadout, rightCombatMutationLoadout: rightLoadout } })
                if (JSON.stringify(report) !== JSON.stringify(replay)) throw new Error('NON_DETERMINISTIC_LOADOUT_MATRIX')
                duel.matches += 1
                const left = loadoutResults[duel.left]!; const right = loadoutResults[duel.right]!
                left.matches += 1; right.matches += 1
                if (report.winner === 'left') { duel.leftWins += 1; left.wins += 1; left.leftWins += 1; right.losses += 1 } else if (report.winner === 'right') { duel.rightWins += 1; right.wins += 1; right.rightWins += 1; left.losses += 1 } else { duel.draws += 1; left.draws += 1; right.draws += 1 }
                if (report.tiebreak) { duel.tiebreaks += 1; left.tiebreaks += 1; right.tiebreaks += 1 }
                for (const round of report.trace) for (const [action, after, effects, aggregate] of [[round.leftAction, round.leftAdaptationsAfter, round.leftMutationEffects, left], [round.rightAction, round.rightAdaptationsAfter, round.rightMutationEffects, right]] as const) {
                    if (action.actionType === 'EVOLVE') aggregate.evolves += 1
                    if (action.actionType === 'USE' && after[action.trait].exhausted) aggregate.exhaustedAfterUse += 1
                    for (const effect of effects) aggregate.activations[effect.id] += 1
                }
            } catch {
                duel.illegalActions += 1
                loadoutResults[duel.left]!.illegalActions += 1
                loadoutResults[duel.right]!.illegalActions += 1
            }
        }
        loadoutHeadToHead.push(duel)
    }
    const loadoutSummary = Object.fromEntries(Object.entries(loadoutResults).map(([key, value]) => [key, { ...value, winRate: value.wins / Math.max(1, value.matches), scoreRate: (value.wins + value.draws * 0.5) / Math.max(1, value.matches), leftWinRate: value.leftWins / Math.max(1, value.matches / 2), rightWinRate: value.rightWins / Math.max(1, value.matches / 2), evolveRate: value.evolves / Math.max(1, value.matches * 2 * TOTAL_ROUNDS) }]))
    const summary = Object.fromEntries(Object.entries(results).map(([policy, value]) => [policy, { ...value, winRate: value.wins / value.matches, scoreRate: (value.wins + value.draws * 0.5) / value.matches, positionWinRate: { left: value.leftWins / Math.max(1, value.matches / 2), right: value.rightWins / Math.max(1, value.matches / 2) }, useRate: value.uses / value.actions, evolveRate: value.evolves / value.actions, geneFrequency: Object.fromEntries(Object.entries(value.genes).map(([gene, count]) => [gene, count / value.actions])), averageFinalLevel: value.levels / value.matches, actionConcentration: Math.max(...Object.values(value.genes)) / value.actions }]))
    const anomalies = [
        ...Object.entries(summary).filter(([, value]) => value.winRate > 0.65).map(([policy, value]) => ({ type: 'dominant-policy', policy, value: value.winRate, examples: examples.filter((example) => example.leftPolicy === policy || example.rightPolicy === policy).slice(0, 2) })),
        ...ADAPTATION_IDS.filter((gene) => Object.values(summary).reduce((sum, value) => sum + value.geneFrequency[gene], 0) / policies.length > 0.35).map((gene) => ({ type: 'overused-gene', gene, value: Object.values(summary).reduce((sum, value) => sum + value.geneFrequency[gene], 0) / policies.length, examples: examples.slice(0, 1) })),
        ...(Math.abs(Object.values(summary).reduce((sum, value) => sum + value.positionWinRate.left - value.positionWinRate.right, 0) / policies.length) > 0.08 ? [{ type: 'position-advantage', value: Object.values(summary).reduce((sum, value) => sum + value.positionWinRate.left - value.positionWinRate.right, 0) / policies.length, examples: examples.slice(0, 2) }] : []),
    ]
    const output = resolve(import.meta.dirname, '../artifacts/audit'); mkdirSync(output, { recursive: true }); const baselinePath = resolve(output, `metagame-baseline-${RULE_VERSION}.json`); const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null
    const regressions = baseline ? Object.entries(summary).flatMap(([policy, value]) => { const previous = baseline.summary?.[policy]?.winRate; return typeof previous === 'number' && Math.abs(value.winRate - previous) >= 0.1 ? [{ policy, previous, current: value.winRate }] : [] }) : []
    const payload = { ruleVersion: RULE_VERSION, seed, sequences, methodology: 'Round-robin over deterministic production simulation. Every ordered pairing uses 3 seeded event orders × 2 seeds; the loadout matrix uses the same heuristic policy for all 6 × 6 ordered loadout pairs.', policies: policies.map(id), summary, headToHead: Object.values(headToHead), loadoutMatrix: { baseline: loadoutKey(['ELASTIC_LIMBS', 'ADAPTIVE_CORE']), loadouts: loadouts.map(loadoutKey), summary: loadoutSummary, headToHead: loadoutHeadToHead }, metrics: { tiebreaks, endReasons, distinctPolicyDrawRate: distinctPolicyDraws / Math.max(1, distinctPolicyMatches), decidedEarly, decidedByRound, averageFinalMargin: finalMarginTotal / Math.max(1, Object.values(headToHead).reduce((sum, entry) => sum + entry.matches, 0)), matchups, decisiveMatchups, matchupDetail, evolutionByGene, evolutionByRound, combatMutations, elapsedMs: Math.round(performance.now() - started), lookahead: lookaheadStats }, anomalies, regressions, examples }
    writeFileSync(resolve(output, 'metagame.json'), `${JSON.stringify(payload, null, 2)}\n`)
    if (!baseline) writeFileSync(baselinePath, `${JSON.stringify({ ruleVersion: RULE_VERSION, summary, seed, sequences }, null, 2)}\n`)
    const loadoutRows = Object.entries(loadoutSummary).map(([loadout, value]) => `| ${loadout} | ${(value.scoreRate * 100).toFixed(1)}% | ${(value.leftWinRate * 100).toFixed(1)} / ${(value.rightWinRate * 100).toFixed(1)} | ${(value.evolveRate * 100).toFixed(1)}% | ${Object.entries(value.activations).filter(([, count]) => count).map(([mutation, count]) => `${mutation}=${count}`).join(', ') || 'nessuno'} | ${value.illegalActions} |`)
    const lines = ['# Metagame audit', '', `- ${policies.length} policy; ${sequences.length} sequenze; seed ${seed}; ${payload.metrics.elapsedMs} ms.`, `- Tie-break: ${tiebreaks}; pareggi fra policy diverse: ${(payload.metrics.distinctPolicyDrawRate * 100).toFixed(1)}%; margine finale medio: ${payload.metrics.averageFinalMargin.toFixed(2)}.`, `- Partite decise prima dell’ultimo round: ${decidedEarly} (${Object.entries(decidedByRound).map(([round, count]) => `R${round}=${count}`).join(', ') || 'nessuna'}); matchup ${matchups} (${decisiveMatchups} decisivi).`, `- Combat Mutations: Elastic ${combatMutations.elasticActivations}; Core armato ${combatMutations.adaptiveCoreArmed}; bonus ${combatMutations.adaptiveCoreBonuses}; armato non consumato ${combatMutations.adaptiveCoreUnspentAtEnd}.`, `- Lookahead: ${lookaheadStats.statesVisited} stati, cache ${lookaheadStats.cacheHits}/${lookaheadStats.cacheMisses} hit/miss.`, '', '## Matrice policy', '', '| Policy | Win rate | SX/DX | USE/EVOLVE | Concentrazione |', '|---|---:|---:|---:|---:|', ...Object.entries(summary).map(([policy, value]) => `| ${policy} | ${(value.winRate * 100).toFixed(1)}% | ${(value.positionWinRate.left * 100).toFixed(1)} / ${(value.positionWinRate.right * 100).toFixed(1)} | ${(value.useRate * 100).toFixed(1)} / ${(value.evolveRate * 100).toFixed(1)} | ${(value.actionConcentration * 100).toFixed(1)}% |`), '', '## Matrice loadout 2/4', '', '| Loadout | Score rate | SX/DX | Evolvi | Effetti | Azioni illegali |', '|---|---:|---:|---:|---|---:|', ...loadoutRows, '', '## Anomalie', '', ...(anomalies.length ? anomalies.map((item) => `- ${item.type}: ${JSON.stringify(item)}`) : ['- Nessuna soglia automatica superata nel campione.']), '', '## Esempi riproducibili', '', ...examples.map((example) => `- ${example.reason}: ${example.leftPolicy} vs ${example.rightPolicy}, seed ${example.seed}, eventi ${example.events.join(', ')}, punteggio ${example.score}.`)]
    writeFileSync(resolve(output, 'metagame.md'), `${lines.join('\n')}\n`); console.log(JSON.stringify({ audit: 'metagame', elapsedMs: payload.metrics.elapsedMs, matches: Object.values(headToHead).reduce((sum, item) => sum + item.matches, 0), anomalies: anomalies.length }))
}
main()
