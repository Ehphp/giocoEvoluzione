import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { Worker, isMainThread } from 'node:worker_threads'
import { AUDIT_FITNESS_VERSION, AUDIT_RULE_VERSION, FITNESS_CONFIG, SCREENING_CONFIG } from './audit-config.ts'
import { candidateUseValues, generateCandidateCatalogs, validateCandidate, type CandidateCatalog } from './audit-catalog.ts'
import { actionGene, generateSequences, isEvolve } from './audit-core.ts'
import { auditBaselineExact, solveExactSequence } from './audit-exact.ts'

type ScreeningResult = { candidate: CandidateCatalog; approximate: true; accepted: boolean; pruned: boolean; sequences: number; fitness: number; breakdown: Record<string, number>; raw: Record<string, number> }
const args = new Set(process.argv.slice(2))
const numberArg = (name: string, fallback: number) => { const value = process.argv[process.argv.indexOf(name) + 1]; return value && Number.isFinite(Number(value)) ? Math.max(1, Math.trunc(Number(value))) : fallback }
const deterministicSample = (count: number) => { const all = generateSequences(); const result: number[][] = []; const seen = new Set<number>(); let seed = SCREENING_CONFIG.seed; while (result.length < count) { seed = (seed * 1664525 + 1013904223) >>> 0; const index = seed % all.length; if (!seen.has(index)) { seen.add(index); result.push(all[index]!) } } return result }
function score(raw: Record<string, number>): { score: number; breakdown: Record<string, number> } {
    const concentration = Math.max(0, 1 - Math.max(0, raw.pickConcentration - FITNESS_CONFIG.targets.maximumPickConcentration) / 0.58)
    const depth = raw.actionDiversity
    const evolve = Math.min(1, raw.evolveRate / FITNESS_CONFIG.targets.minimumEvolveRate)
    const cooldown = Math.min(1, raw.cooldownRelevance / FITNESS_CONFIG.targets.minimumCooldownForcedChoices)
    const futureInformation = Math.min(1, raw.futureInformationAdvantage / 0.2)
    const draw = Math.max(0, 1 - Math.abs(raw.drawRate - FITNESS_CONFIG.targets.drawRate) / FITNESS_CONFIG.targets.drawRate)
    const order = Math.max(0, 1 - raw.orderSpread / FITNESS_CONFIG.targets.maximumOrderSpread)
    // Policy dominance needs the policy tournament; screening deliberately
    // keeps a neutral value rather than double-counting pick concentration.
    const policyDominance = 0.5
    const breakdown = { geneBalance: concentration, decisionDepth: depth, evolveUtility: evolve, cooldownRelevance: cooldown, futureInformation, drawRate: draw, policyDominance, orderRobustness: order }
    return { score: Object.entries(FITNESS_CONFIG.weights).reduce((total, [name, weight]) => total + breakdown[name]! * weight, 0), breakdown }
}
export function screenCandidate(candidate: CandidateCatalog, sequences = deterministicSample(SCREENING_CONFIG.sampleSequences), threshold = 0): ScreeningResult {
    const errors = validateCandidate(candidate.modifiers)
    if (errors.length) return { candidate, approximate: true, accepted: false, pruned: true, sequences: 0, fitness: 0, breakdown: {}, raw: { structuralErrors: errors.length } }
    const values = candidateUseValues(candidate); const picks = new Int32Array(5); let actions = 0, evolves = 0, cooldownUses = 0, draws = 0, nonLosses = 0, outcomeTotal = 0, actionMask = 0, minOutcome = 9, maxOutcome = -9
    for (let index = 0; index < sequences.length; index += 1) {
        const solved = solveExactSequence(sequences[index]!, undefined, values); outcomeTotal += solved.outcome; minOutcome = Math.min(minOutcome, solved.outcome); maxOutcome = Math.max(maxOutcome, solved.outcome)
        if (solved.outcome >= 0) nonLosses += 1
        for (const entry of solved.trace) { actions += 1; actionMask |= 1 << entry.action; picks[actionGene(entry.action)] += 1; if (isEvolve(entry.action)) evolves += 1; if (!isEvolve(entry.action) && (entry.state >> 10) !== 5) cooldownUses += 1; if (entry.ownValue === entry.rivalValue) draws += 1 }
        // Win/non-loss rate is bounded above by treating every remaining sequence as a non-loss.
        if (index >= 3 && (nonLosses + sequences.length - index - 1) / sequences.length < threshold) return { candidate, approximate: true, accepted: false, pruned: true, sequences: index + 1, fitness: 0, breakdown: {}, raw: { upperBoundNonLossRate: (nonLosses + sequences.length - index - 1) / sequences.length } }
    }
    const raw = { pickConcentration: Math.max(...picks) / actions, actionDiversity: actionMask.toString(2).replaceAll('0', '').length / 10, evolveRate: evolves / actions, cooldownRelevance: cooldownUses / Math.max(1, actions), drawRate: draws / actions, nonLossRate: nonLosses / sequences.length, futureInformationAdvantage: outcomeTotal / (sequences.length * 6), orderSpread: (maxOutcome - minOutcome) / 12, policyDominance: 0.5 }
    const fitness = score(raw)
    return { candidate, approximate: true, accepted: fitness.score >= SCREENING_CONFIG.minimumScreeningScore, pruned: false, sequences: sequences.length, fitness: fitness.score, breakdown: fitness.breakdown, raw }
}
function checkpointPath() { return resolve(import.meta.dirname, '../artifacts/audit/search-checkpoint.json') }
function readCompatibleCheckpoint() { const file = checkpointPath(); if (!existsSync(file)) return null; const checkpoint = JSON.parse(readFileSync(file, 'utf8')); if (checkpoint.ruleVersion !== AUDIT_RULE_VERSION || checkpoint.fitnessVersion !== AUDIT_FITNESS_VERSION || checkpoint.seed !== SCREENING_CONFIG.seed) { console.warn('Ignoring incompatible audit checkpoint.'); return null } return checkpoint }
function screenInWorkers(candidates: CandidateCatalog[], sequences: number[][], workers: number): Promise<ScreeningResult[]> {
    return new Promise((resolveResults, reject) => {
        const results: ScreeningResult[] = []; let next = 0; let completed = 0
        const dispatch = (worker: Worker) => { const candidate = candidates[next++]; if (candidate) worker.postMessage({ candidate, sequences }); else worker.postMessage({ stop: true }) }
        for (let index = 0; index < Math.min(workers, candidates.length); index += 1) {
            const worker = new Worker(new URL('./audit-search-worker.ts', import.meta.url), { execArgv: process.execArgv })
            worker.once('error', reject)
            worker.on('message', (message: ScreeningResult) => { results.push(message); completed += 1; if (completed === candidates.length) { worker.terminate().catch(() => undefined); resolveResults(results) } else dispatch(worker) })
            dispatch(worker)
        }
    })
}
async function main() {
    const smoke = args.has('--smoke'); const full = args.has('--full'); const limit = numberArg('--limit', smoke ? 3 : full ? 120 : SCREENING_CONFIG.maximumCandidates); const workers = numberArg('--workers', Math.min(Math.max(cpus().length - 1, 1), 4))
    const started = performance.now(); const sequences = deterministicSample(smoke ? 4 : SCREENING_CONFIG.sampleSequences); const candidates = generateCandidateCatalogs(limit); const prior = readCompatibleCheckpoint(); let best = prior?.bestFitness ?? 0
    const results = (workers === 1 ? candidates.map((candidate) => { const result = screenCandidate(candidate, sequences, best); if (result.accepted) best = Math.max(best, result.fitness); return result }) : await screenInWorkers(candidates, sequences, workers)).sort((left, right) => right.fitness - left.fitness)
    const promoted = full ? results.filter((result) => result.accepted && !result.pruned).slice(0, SCREENING_CONFIG.promotionCount).map((result) => ({ id: result.candidate.id, exact: auditBaselineExact(generateSequences(), candidateUseValues(result.candidate)).benchmark })) : []
    const output = resolve(import.meta.dirname, '../artifacts/audit'); mkdirSync(output, { recursive: true })
    const payload = { ruleVersion: AUDIT_RULE_VERSION, fitnessVersion: AUDIT_FITNESS_VERSION, seed: SCREENING_CONFIG.seed, screening: { ...SCREENING_CONFIG, approximate: true }, workers, candidates: results, promoted, elapsedMs: Math.round(performance.now() - started) }
    writeFileSync(resolve(output, 'search-screening.json'), `${JSON.stringify(payload, null, 2)}\n`)
    writeFileSync(checkpointPath(), `${JSON.stringify({ ruleVersion: AUDIT_RULE_VERSION, fitnessVersion: AUDIT_FITNESS_VERSION, seed: SCREENING_CONFIG.seed, bestFitness: best, screening: SCREENING_CONFIG, catalogSignatures: results.map((result) => result.candidate.signature) }, null, 2)}\n`)
    console.log(JSON.stringify({ candidates: candidates.length, promoted: promoted.length, elapsedMs: payload.elapsedMs, approximate: true }))
}
if (isMainThread && process.argv[1]?.replaceAll('\\', '/').endsWith('/audit-search.ts')) void main()
