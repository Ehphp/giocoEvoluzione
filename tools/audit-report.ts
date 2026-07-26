import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const output = resolve(import.meta.dirname, '../artifacts/audit')
const baseline = JSON.parse(readFileSync(resolve(output, 'exact-baseline.json'), 'utf8'))
const { benchmark, methodology, metrics } = baseline
const lines = [
    '# Audit baseline — five genes',
    '',
    `- Metodo: ricerca esatta su ${methodology.sequences} permutazioni, contro ${methodology.opponent}.`,
    `- Tempo: ${benchmark.elapsedMs} ms; stati memoizzati: ${benchmark.memoizedStates}.`,
    `- Esiti: ${metrics.wins} vittorie, ${metrics.draws} pareggi, ${metrics.losses} sconfitte (${(metrics.finalDrawRate * 100).toFixed(2)}% pareggi).`,
    `- Pareggi di round: ${metrics.roundTies}; distribuzione punteggi finali: ${Object.entries(metrics.matchScoreDistribution).map(([score, count]) => `${score}=${count}`).join(', ')}.`,
    `- Livello 3: raggiunto in ${metrics.level3Reached}/${methodology.sequences} sequenze (${(metrics.level3ReachRate * 100).toFixed(2)}%), round medio ${metrics.averageThirdEvolveRound ?? 'n/a'}, usi successivi medi ${metrics.averageLevel3UsesAfterReach.toFixed(2)}.`,
    `- Confronto con tetto al livello 2: ${metrics.thirdEvolveNecessary} terze evoluzioni hanno aumentato il risultato ottimo; ${metrics.thirdEvolveNotNecessary} non lo hanno aumentato.`,
    `- Azioni ottime: ${Object.entries(metrics.optimalActions).map(([action, count]) => `${action}=${count}`).join(', ')}.`,
    '',
    '## Esito',
    '',
    benchmark.elapsedMs <= 3000
        ? 'Il baseline esatto rispetta il budget di 3 secondi.'
        : 'Il baseline esatto supera il budget di 3 secondi: serve ottimizzazione prima di trattarlo come gate.',
    'Non sono state modificate automaticamente né la matrice né le soglie: il report descrive soltanto il baseline.',
]
writeFileSync(resolve(output, 'baseline-report.md'), `${lines.join('\n')}\n`)
console.log(lines.slice(0, 8).join('\n'))
