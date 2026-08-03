import { useEffect, useMemo, useState } from 'react'

import {
    CREATURE_TRANSFORMATION_VISUAL_ISSUES,
    EXPERIMENT_REVIEW_VERDICTS,
    type ExperimentReviewScores,
    type GenerateConceptResponse,
    type GetBenchmarkResultsResponse,
    type TransformationRequestPersistence,
    type TransformationRequestStatusResponse,
} from '../../../shared/creature-transformations/index.ts'
import type { PlayerCreatureRecord } from '../../lib/profile-api'
import {
    CreatureTransformationApiError,
    createConceptIdempotencyKey,
    createImageIdempotencyKey,
    generateCreatureTransformationConcept,
    generateCreatureTransformationImage,
    getCreatureTransformationBenchmarkResults,
    getCreatureTransformationRequestStatus,
    submitCreatureTransformationExperimentReview,
} from '../../lib/creature-transformations-api'

const POLL_INTERVAL_MS = 2500
const POLL_TIMEOUT_MS = 60000
const SOURCE_PREVIEW = '/assets/battle/creatures/verdant-hatchling.png'
const DEFAULT_SCORES: ExperimentReviewScores = Object.freeze({
    identityPreservation: 3, facePreservation: 3, poseComposition: 3, traitReadability: 3,
    styleCoherence: 3, anatomyQuality: 3, technicalQuality: 3, overall: 3,
})

type Props = { creature: PlayerCreatureRecord }

function isTerminal(status: string | undefined): boolean {
    return status === 'SUCCEEDED' || status === 'FAILED'
}

function exportRows(results: GetBenchmarkResultsResponse) {
    return results.entries.map((entry) => ({
        benchmarkCaseId: entry.benchmarkCaseId, transformationRequestId: entry.transformationRequestId,
        generationProfileId: entry.generationProfileId, provider: entry.provider, model: entry.model, quality: entry.quality,
        promptTemplateVersion: entry.promptTemplateVersion, promptSha256: entry.promptSha256, visualTraitId: entry.visualTraitId,
        intensity: entry.intensity, readiness: entry.assetReadiness, warnings: entry.validationWarnings.join('|'),
        classification: entry.classification, verdict: entry.review?.verdict ?? null, issueFlags: entry.review?.issueFlags.join('|') ?? '',
        scores: entry.review?.scores ?? null, latencyMs: entry.generationLatencyMs, estimatedCostUsd: entry.estimatedCostUsd,
        actualCostUsd: entry.actualCostUsd,
    }))
}

function download(name: string, contents: string, type: string) {
    const blob = new Blob([contents], { type })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    URL.revokeObjectURL(url)
}

function downloadCsv(results: GetBenchmarkResultsResponse) {
    const rows = exportRows(results)
    const headers = Object.keys(rows[0] ?? { benchmarkCaseId: '' })
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
    download('creature-transformation-benchmark.csv', [headers.join(','), ...rows.map((row) => headers.map((header) => quote(row[header as keyof typeof row])).join(','))].join('\n'), 'text/csv;charset=utf-8')
}

export function CreatureTransformationBenchmark({ creature }: Props) {
    const [results, setResults] = useState<GetBenchmarkResultsResponse | null>(null)
    const [hidden, setHidden] = useState(false)
    const [authorized, setAuthorized] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [benchmarkCaseId, setBenchmarkCaseId] = useState('')
    const [generationProfileId, setGenerationProfileId] = useState('')
    const [concept, setConcept] = useState<GenerateConceptResponse | null>(null)
    const [costConfirmed, setCostConfirmed] = useState(false)
    const [generatingConcept, setGeneratingConcept] = useState(false)
    const [generatingImage, setGeneratingImage] = useState(false)
    const [requestPersistence, setRequestPersistence] = useState<TransformationRequestPersistence | null>(null)
    const [requestStatus, setRequestStatus] = useState<TransformationRequestStatusResponse | null>(null)
    const [reviewTargetId, setReviewTargetId] = useState('')
    const [scores, setScores] = useState<ExperimentReviewScores>(DEFAULT_SCORES)
    const [verdict, setVerdict] = useState<(typeof EXPERIMENT_REVIEW_VERDICTS)[number]>('PROMISING')
    const [issueFlags, setIssueFlags] = useState<string[]>([])
    const [notes, setNotes] = useState('')
    const [compareA, setCompareA] = useState('')
    const [compareB, setCompareB] = useState('')

    const selectedCase = results?.catalog.cases.find((benchmarkCase) => benchmarkCase.id === benchmarkCaseId) ?? null
    const enabledProfiles = results?.catalog.profiles.filter((profile) => profile.enabled) ?? []
    const selectedProfile = enabledProfiles.find((profile) => profile.id === generationProfileId) ?? null
    const running = Boolean(requestPersistence && !isTerminal(requestStatus?.requestPersistence.status ?? requestPersistence.status))
    const compareEntries = useMemo(() => results?.entries.filter((entry) => entry.result) ?? [], [results])
    const entryA = compareEntries.find((entry) => entry.transformationRequestId === compareA) ?? null
    const entryB = compareEntries.find((entry) => entry.transformationRequestId === compareB) ?? null

    async function refresh() {
        try {
            const next = await getCreatureTransformationBenchmarkResults()
            setResults(next)
            setHidden(false)
            setAuthorized(true)
            setError(null)
            setBenchmarkCaseId((current) => current || next.catalog.cases[0]?.id || '')
            setGenerationProfileId((current) => current || next.catalog.profiles.find((profile) => profile.enabled)?.id || '')
        } catch (nextError) {
            if (nextError instanceof CreatureTransformationApiError && nextError.code === 'BENCHMARK_REVIEWER_NOT_ALLOWED') {
                setHidden(true)
                setAuthorized(false)
                return
            }
            setError(nextError instanceof Error ? nextError.message : 'Impossibile caricare il benchmark.')
        }
    }

    useEffect(() => { void refresh() }, [])

    useEffect(() => {
        if (!requestPersistence || isTerminal(requestStatus?.requestPersistence.status)) return undefined
        let cancelled = false
        const poll = async () => {
            try {
                const next = await getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId: requestPersistence.transformationRequestId })
                if (!cancelled) {
                    setRequestStatus(next)
                    if (isTerminal(next.requestPersistence.status)) setReviewTargetId(next.requestPersistence.transformationRequestId)
                }
            } catch (nextError) {
                if (!cancelled) setError(nextError instanceof Error ? nextError.message : 'Impossibile aggiornare lo stato benchmark.')
            }
        }
        const interval = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
        const timeout = window.setTimeout(() => { if (!cancelled) setError('Polling benchmark scaduto: aggiorna manualmente i risultati.') }, POLL_TIMEOUT_MS)
        void poll()
        return () => { cancelled = true; window.clearInterval(interval); window.clearTimeout(timeout) }
    }, [requestPersistence, requestStatus?.requestPersistence.status])

    if (hidden || !authorized) return null

    async function prepareConcept() {
        if (!selectedCase || generatingConcept || running) return
        setGeneratingConcept(true)
        setError(null)
        setConcept(null)
        try {
            const next = await generateCreatureTransformationConcept({
                operation: 'GENERATE_CONCEPT', creatureId: creature.id, visualTraitId: selectedCase.visualTraitId,
                intensity: selectedCase.intensity, conceptMode: 'MOCK', idempotencyKey: createConceptIdempotencyKey(), benchmarkCaseId: selectedCase.id,
            })
            setConcept(next)
            setCostConfirmed(false)
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Impossibile preparare il concept benchmark.')
        } finally {
            setGeneratingConcept(false)
        }
    }

    async function generateRealImage() {
        if (!selectedCase || !selectedProfile || !concept || !costConfirmed || generatingImage || running) return
        setGeneratingImage(true)
        setError(null)
        try {
            const next = await generateCreatureTransformationImage({
                operation: 'GENERATE_IMAGE', creatureId: creature.id, concept: concept.concept, imageProviderMode: 'REAL',
                idempotencyKey: createImageIdempotencyKey(), benchmarkCaseId: selectedCase.id, generationProfileId: selectedProfile.id,
            })
            setRequestPersistence(next.requestPersistence)
            setRequestStatus(null)
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Impossibile avviare l immagine benchmark.')
        } finally {
            setGeneratingImage(false)
        }
    }

    async function submitReview() {
        if (!reviewTargetId) return
        try {
            await submitCreatureTransformationExperimentReview({
                operation: 'SUBMIT_EXPERIMENT_REVIEW', transformationRequestId: reviewTargetId, scores, verdict,
                issueFlags: issueFlags as never[], ...(notes.trim() ? { notes: notes.trim() } : {}),
            })
            await refresh()
            setError(null)
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Impossibile salvare la review.')
        }
    }

    function changeCase(nextId: string) {
        setBenchmarkCaseId(nextId)
        setConcept(null)
        setCostConfirmed(false)
    }

    return (
        <section className="creature-transformation-lab__benchmark" aria-labelledby="creature-transformation-benchmark-title">
            <header><div><span className="eyebrow">Development-only · benchmark controllato</span><h2 id="creature-transformation-benchmark-title">Benchmark immagini reali</h2></div><button type="button" onClick={() => void refresh()}>Aggiorna risultati</button></header>
            {error ? <p className="creature-transformation-lab__error" role="alert">{error}</p> : null}
            {!results ? <p>Verifico l autorizzazione benchmark senza avviare alcuna generazione.</p> : <>
                <div className="creature-transformation-lab__benchmark-controls">
                    <label>Benchmark case<select value={benchmarkCaseId} onChange={(event) => changeCase(event.target.value)} disabled={running}>{results.catalog.cases.map((benchmarkCase) => <option key={benchmarkCase.id} value={benchmarkCase.id}>{benchmarkCase.id} · {benchmarkCase.visualTraitId}</option>)}</select></label>
                    <label>Generation profile<select value={generationProfileId} onChange={(event) => { setGenerationProfileId(event.target.value); setCostConfirmed(false) }} disabled={running}>{enabledProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.id} · {profile.model} · {profile.quality} · {profile.promptTemplateVersion}</option>)}</select></label>
                    {selectedCase ? <p><strong>Trait:</strong> {selectedCase.visualTraitId} · <strong>Intensita:</strong> {selectedCase.intensity} · <strong>Seed:</strong> {selectedCase.conceptSeed}</p> : null}
                    {selectedProfile ? <p><strong>Costo stimato:</strong> ${selectedProfile.estimatedCostUsd.toFixed(2)} · <strong>Massimo per richiesta:</strong> {results.catalog.maxRealImageEstimatedCostUsd === null ? 'non configurato' : `$${results.catalog.maxRealImageEstimatedCostUsd.toFixed(2)}`}</p> : null}
                    <button type="button" onClick={() => void prepareConcept()} disabled={!selectedCase || generatingConcept || running}>{generatingConcept ? 'Preparo concept...' : 'Prepara concept benchmark mock'}</button>
                    {concept ? <><details><summary>Concept controllato</summary><pre>{JSON.stringify(concept.concept, null, 2)}</pre></details><label><input type="checkbox" checked={costConfirmed} onChange={(event) => setCostConfirmed(event.target.checked)} disabled={running} /> Confermo il costo della singola generazione reale.</label><button type="button" className="primary-button" onClick={() => void generateRealImage()} disabled={!selectedProfile || !costConfirmed || generatingImage || running}>{generatingImage ? 'Avvio richiesta...' : 'Genera una immagine benchmark reale'}</button></> : null}
                </div>
                {requestPersistence ? <section className="creature-transformation-lab__image-result"><p><strong>Request:</strong> {requestPersistence.transformationRequestId} · {requestStatus?.requestPersistence.status ?? requestPersistence.status}</p>{requestStatus?.generation ? <p>{requestStatus.generation.model} · ${requestStatus.generation.estimatedCostUsd ?? 0} · {requestStatus.generation.latencyMs ?? '…'} ms</p> : null}{requestStatus?.result ? <div className="creature-transformation-lab__image-compare"><figure><img src={SOURCE_PREVIEW} alt="Sorgente benchmark" /><figcaption>Sorgente canonica</figcaption></figure><figure><img src={requestStatus.result.signedUrl} alt="Risultato benchmark" /><figcaption>{requestStatus.result.assetReadiness}</figcaption></figure></div> : null}{requestStatus?.error ? <p role="alert">{requestStatus.error.code}: {requestStatus.error.message}</p> : null}</section> : null}
                <section className="creature-transformation-lab__review"><h3>Review manuale persistente</h3><label>Risultato<select value={reviewTargetId} onChange={(event) => setReviewTargetId(event.target.value)}><option value="">Seleziona richiesta completata</option>{results.entries.filter((entry) => entry.status === 'SUCCEEDED' && entry.result).map((entry) => <option key={entry.transformationRequestId} value={entry.transformationRequestId}>{entry.benchmarkCaseId} · {entry.generationProfileId} · {entry.transformationRequestId}</option>)}</select></label><div className="creature-transformation-lab__score-grid">{Object.entries(scores).map(([key, value]) => <label key={key}>{key}<select value={value} onChange={(event) => setScores((current) => ({ ...current, [key]: Number(event.target.value) }))}>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}</select></label>)}</div><label>Verdict<select value={verdict} onChange={(event) => setVerdict(event.target.value as typeof verdict)}>{EXPERIMENT_REVIEW_VERDICTS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><fieldset><legend>Issue flags</legend>{CREATURE_TRANSFORMATION_VISUAL_ISSUES.map((flag) => <label key={flag}><input type="checkbox" checked={issueFlags.includes(flag)} onChange={() => setIssueFlags((current) => current.includes(flag) ? current.filter((item) => item !== flag) : [...current, flag])} /> {flag}</label>)}</fieldset><label>Note<textarea value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} /></label><button type="button" onClick={() => void submitReview()} disabled={!reviewTargetId}>Salva review</button></section>
                <section className="creature-transformation-lab__metrics"><header><h3>Metriche descrittive</h3><div><button type="button" onClick={() => download('creature-transformation-benchmark.json', JSON.stringify(exportRows(results), null, 2), 'application/json')}>Esporta JSON</button><button type="button" onClick={() => downloadCsv(results)}>Esporta CSV</button></div></header><p>{results.metrics.generated} generazioni · {results.metrics.succeeded} successi · {results.metrics.failed} fallimenti · {results.metrics.finalAssets} FINAL_ASSET · {results.metrics.experimentOnly} EXPERIMENT_ONLY</p><p>Latenza media: {results.metrics.latencyMs.mean?.toFixed(0) ?? '—'} ms · mediana: {results.metrics.latencyMs.median?.toFixed(0) ?? '—'} ms · p95: {results.metrics.latencyMs.p95?.toFixed(0) ?? '—'} ms</p><p>Costo stimato totale: ${results.metrics.estimatedCostUsdTotal.toFixed(2)} · per risultato PASS: {results.metrics.estimatedCostUsdPerAcceptable === null ? '—' : `$${results.metrics.estimatedCostUsdPerAcceptable.toFixed(2)}`}</p><p>Campione piccolo: metriche descrittive, non statisticamente significative.</p></section>
                <section className="creature-transformation-lab__compare"><h3>Confronto affiancato</h3><label>Risultato A<select value={compareA} onChange={(event) => setCompareA(event.target.value)}><option value="">Seleziona</option>{compareEntries.map((entry) => <option key={entry.transformationRequestId} value={entry.transformationRequestId}>{entry.benchmarkCaseId} · {entry.generationProfileId}</option>)}</select></label><label>Risultato B<select value={compareB} onChange={(event) => setCompareB(event.target.value)}><option value="">Seleziona</option>{compareEntries.map((entry) => <option key={entry.transformationRequestId} value={entry.transformationRequestId}>{entry.benchmarkCaseId} · {entry.generationProfileId}</option>)}</select></label>{entryA && entryB && entryA.benchmarkCaseId !== entryB.benchmarkCaseId ? <p role="alert">I risultati devono appartenere allo stesso benchmark case.</p> : null}{entryA && entryB && entryA.benchmarkCaseId === entryB.benchmarkCaseId ? <div className="creature-transformation-lab__image-compare"><figure><img src={SOURCE_PREVIEW} alt="Sorgente condivisa" /><figcaption>Sorgente</figcaption></figure><figure><img src={entryA.result!.signedUrl} alt="Risultato A" /><figcaption>{entryA.generationProfileId} · {entryA.classification} · ${entryA.estimatedCostUsd ?? 0}</figcaption></figure><figure><img src={entryB.result!.signedUrl} alt="Risultato B" /><figcaption>{entryB.generationProfileId} · {entryB.classification} · ${entryB.estimatedCostUsd ?? 0}</figcaption></figure></div> : null}</section>
            </>}
        </section>
    )
}
