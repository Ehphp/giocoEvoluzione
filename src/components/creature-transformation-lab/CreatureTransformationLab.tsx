import { useEffect, useState } from 'react'

import {
    TRANSFORMATION_INTENSITIES,
    VISUAL_TRAITS,
    type GenerateConceptResponse,
    type TransformationRequestPersistence,
    type TransformationRequestStatusResponse,
    type GenerateImageResponse,
    type TransformationIntensity,
    type VisualTraitId,
    EVOLUTION_TARGETS,
    type EvolutionTargetId,
    type ExperimentalLineage,
} from '../../../shared/creature-transformations/index.ts'
import type { PlayerCreatureRecord } from '../../lib/profile-api'
import {
    createConceptIdempotencyKey,
    createImageIdempotencyKey,
    CreatureTransformationApiError,
    getCreatureTransformationRequestStatus,
    generateCreatureTransformationConcept,
    generateCreatureTransformationImage,
    generateCurrentPipelineExperiment,
    generateLineageFirstExperiment,
    getCurrentCreatureVisual,
    submitLineageComparisonReview,
} from '../../lib/creature-transformations-api'
import { canGenerateMockImage } from './lab-image-state'
import { CreatureTransformationBenchmark } from './CreatureTransformationBenchmark'
import { isCreatureTransformationBenchmarkVisible } from './lab-benchmark-flag'
import { isRealImageExperimentVisible } from './lab-real-image-flag'

import '../technical-screens.css'
import './CreatureTransformationLab.css'

type ConceptMode = 'MOCK' | 'AI'
type LineageReviewKey = 'creativeSurprise' | 'targetTransformationStrength' | 'creatureContinuity' | 'lineagePreservation' | 'nonTargetStability'
const LINEAGE_REVIEW_KEYS: readonly LineageReviewKey[] = ['creativeSurprise', 'targetTransformationStrength', 'creatureContinuity', 'lineagePreservation', 'nonTargetStability']
const REAL_IMAGE_FRONTEND_ENABLED = isRealImageExperimentVisible(import.meta.env.VITE_CREATURE_TRANSFORMATION_REAL_IMAGE_ENABLED)
const BENCHMARK_FRONTEND_ENABLED = isCreatureTransformationBenchmarkVisible(import.meta.env.VITE_CREATURE_TRANSFORMATION_BENCHMARK_ENABLED)
const REAL_POLL_INTERVAL_MS = 2500
const REAL_POLL_TIMEOUT_MS = 60000
const FALLBACK_SOURCE_PREVIEW = '/assets/battle/creatures/verdant-hatchling.png'

type CreatureTransformationLabProps = {
    creature: PlayerCreatureRecord
    onBack: () => void
}

function formatJson(value: unknown): string {
    return JSON.stringify(value, null, 2)
}

function shortHash(sha256: string): string {
    return `${sha256.slice(0, 12)}…${sha256.slice(-8)}`
}

function isTechnicalRetryable(error: unknown): boolean {
    if (!(error instanceof CreatureTransformationApiError)) return true
    return !new Set([
        'DAILY_LIMIT_REACHED',
        'DAILY_BUDGET_REACHED',
        'REQUEST_ALREADY_IN_PROGRESS',
        'IDEMPOTENT_REQUEST_ALREADY_COMPLETED',
        'REQUEST_PREVIOUSLY_FAILED',
        'REQUEST_STALE',
        'REAL_IMAGE_PROVIDER_NOT_IMPLEMENTED',
        'REAL_IMAGE_PROVIDER_DISABLED',
        'REAL_IMAGE_PROVIDER_NOT_ALLOWED',
        'REAL_IMAGE_PROVIDER_NOT_CONFIGURED',
    ]).has(error.code)
}

function isTerminalRequestStatus(status: string | undefined): boolean {
    return status === 'SUCCEEDED' || status === 'FAILED'
}

export function CreatureTransformationLab({ creature, onBack }: CreatureTransformationLabProps) {
    const [visualTraitId, setVisualTraitId] = useState<VisualTraitId>(VISUAL_TRAITS[0].id)
    const [intensity, setIntensity] = useState<TransformationIntensity>(2)
    const [conceptMode, setConceptMode] = useState<ConceptMode>('MOCK')
    const [conceptResult, setConceptResult] = useState<GenerateConceptResponse | null>(null)
    const [imageResult, setImageResult] = useState<GenerateImageResponse | null>(null)
    const [error, setError] = useState<CreatureTransformationApiError | Error | null>(null)
    const [isGeneratingConcept, setIsGeneratingConcept] = useState(false)
    const [isGeneratingImage, setIsGeneratingImage] = useState(false)
    const [conceptRetryKey, setConceptRetryKey] = useState<string | null>(null)
    const [imageRetryKey, setImageRetryKey] = useState<string | null>(null)
    const [retryAction, setRetryAction] = useState<'CONCEPT' | 'IMAGE' | null>(null)
    const [realCostConfirmed, setRealCostConfirmed] = useState(false)
    const [realRequestPersistence, setRealRequestPersistence] = useState<TransformationRequestPersistence | null>(null)
    const [realStatus, setRealStatus] = useState<TransformationRequestStatusResponse | null>(null)
    const [realPollingTimedOut, setRealPollingTimedOut] = useState(false)
    const [lineageTargetId, setLineageTargetId] = useState<EvolutionTargetId>('TAIL')
    const [lineage, setLineage] = useState<ExperimentalLineage>({ identityTraits: [], acquiredTraits: [] })
    const [lineageInstruction, setLineageInstruction] = useState('')
    const [lineageTraitDraft, setLineageTraitDraft] = useState('')
    const [lineageRequest, setLineageRequest] = useState<TransformationRequestPersistence | null>(null)
    const [lineageStatus, setLineageStatus] = useState<TransformationRequestStatusResponse | null>(null)
    const [lineageError, setLineageError] = useState<Error | null>(null)
    const [lineageSourceRequestId, setLineageSourceRequestId] = useState<string | null>(null)
    const [canonicalSourcePreview, setCanonicalSourcePreview] = useState<{ signedUrl: string; isBaseVersion: boolean } | null>(null)
    const [lineageSourcePreview, setLineageSourcePreview] = useState<{ requestId: string; signedUrl: string } | null>(null)
    const [lineageReview, setLineageReview] = useState<Record<LineageReviewKey, number>>({ creativeSurprise: 3, targetTransformationStrength: 3, creatureContinuity: 3, lineagePreservation: 3, nonTargetStability: 3 })
    const [preferredResult, setPreferredResult] = useState<'CURRENT' | 'LINEAGE_FIRST' | 'NONE'>('NONE')
    const [lineageReviewSaved, setLineageReviewSaved] = useState(false)
    const realRequestIsRunning = Boolean(realRequestPersistence && !isTerminalRequestStatus(realStatus?.requestPersistence.status ?? realRequestPersistence.status) && !realPollingTimedOut)
    const lineageRequestIsRunning = Boolean(lineageRequest && !isTerminalRequestStatus(lineageStatus?.requestPersistence.status ?? lineageRequest.status))
    const isBusy = isGeneratingConcept || isGeneratingImage || realRequestIsRunning || lineageRequestIsRunning
    const imageGenerationAvailable = canGenerateMockImage(conceptResult, isGeneratingConcept, isGeneratingImage) && !realRequestIsRunning
    const comparisonSource = lineageSourceRequestId && lineageSourcePreview?.requestId === lineageSourceRequestId
        ? { signedUrl: lineageSourcePreview.signedUrl, label: 'Risultato sperimentale condiviso A/B' }
        : canonicalSourcePreview
            ? { signedUrl: canonicalSourcePreview.signedUrl, label: canonicalSourcePreview.isBaseVersion ? 'Visuale base canonica del profilo' : 'Ultima evoluzione attiva del profilo' }
            : { signedUrl: FALLBACK_SOURCE_PREVIEW, label: 'Anteprima della visuale canonica del profilo' }

    function invalidateConceptAndImage() {
        setConceptResult(null)
        setImageResult(null)
        setError(null)
        setConceptRetryKey(null)
        setImageRetryKey(null)
        setRetryAction(null)
        setRealCostConfirmed(false)
        setRealRequestPersistence(null)
        setRealStatus(null)
        setRealPollingTimedOut(false)
    }

    useEffect(() => {
        let cancelled = false
        void (async () => {
            try {
                const response = await getCurrentCreatureVisual({ operation: 'GET_CURRENT_VISUAL', creatureId: creature.id })
                if (!cancelled) setCanonicalSourcePreview({ signedUrl: response.visual.signedUrl, isBaseVersion: response.visual.isBaseVersion })
            } catch {
                // The local fallback still lets the lab operate when visual progression is unavailable.
            }
        })()
        return () => { cancelled = true }
    }, [creature.id])

    useEffect(() => {
        if (!realRequestPersistence || isTerminalRequestStatus(realStatus?.requestPersistence.status) || realPollingTimedOut) return undefined
        let cancelled = false
        const poll = async () => {
            if (document.visibilityState !== 'visible') return
            try {
                const next = await getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId: realRequestPersistence.transformationRequestId })
                if (!cancelled) setRealStatus(next)
            } catch (nextError) {
                if (!cancelled) setError(nextError instanceof Error ? nextError : new Error('Impossibile aggiornare lo stato della richiesta reale.'))
            }
        }
        const interval = window.setInterval(() => void poll(), REAL_POLL_INTERVAL_MS)
        const deadline = window.setTimeout(() => { if (!cancelled) setRealPollingTimedOut(true) }, REAL_POLL_TIMEOUT_MS)
        const visibilityListener = () => { if (document.visibilityState === 'visible') void poll() }
        document.addEventListener('visibilitychange', visibilityListener)
        void poll()
        return () => {
            cancelled = true
            window.clearInterval(interval)
            window.clearTimeout(deadline)
            document.removeEventListener('visibilitychange', visibilityListener)
        }
    }, [realPollingTimedOut, realRequestPersistence, realStatus?.requestPersistence.status])

    useEffect(() => {
        if (!lineageRequest || isTerminalRequestStatus(lineageStatus?.requestPersistence.status)) return undefined
        let cancelled = false
        const poll = async () => {
            try {
                const next = await getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId: lineageRequest.transformationRequestId })
                if (!cancelled) setLineageStatus(next)
            } catch (nextError) { if (!cancelled) setLineageError(nextError instanceof Error ? nextError : new Error('Impossibile aggiornare il test lineage-first.')) }
        }
        const interval = window.setInterval(() => void poll(), REAL_POLL_INTERVAL_MS)
        void poll()
        return () => { cancelled = true; window.clearInterval(interval) }
    }, [lineageRequest, lineageStatus?.requestPersistence.status])

    async function handleGenerateLineageFirst() {
        if (!realCostConfirmed || isBusy) return
        setLineageError(null)
        try {
            const response = await generateLineageFirstExperiment({ operation: 'GENERATE_LINEAGE_FIRST_EXPERIMENT', creatureId: creature.id, evolutionTargetId: lineageTargetId, lineage, ...(lineageInstruction.trim() ? { instruction: lineageInstruction.trim() } : {}), ...(lineageSourceRequestId ? { experimentalSourceRequestId: lineageSourceRequestId } : {}), idempotencyKey: createImageIdempotencyKey() })
            if (!response.success || !('requestPersistence' in response) || !response.requestPersistence) throw new Error('Risposta lineage-first non valida.')
            setLineageRequest(response.requestPersistence)
            setLineageStatus(null)
        } catch (nextError) { setLineageError(nextError instanceof Error ? nextError : new Error('Generazione lineage-first non riuscita.')) }
    }

    async function handleGenerateCurrentPipeline() {
        if (!realCostConfirmed || isBusy) return
        setIsGeneratingImage(true)
        setError(null)
        setRealPollingTimedOut(false)
        try {
            const response = await generateCurrentPipelineExperiment({ operation: 'GENERATE_CURRENT_PIPELINE_EXPERIMENT', creatureId: creature.id, evolutionTargetId: lineageTargetId, ...(lineageSourceRequestId ? { experimentalSourceRequestId: lineageSourceRequestId } : {}), idempotencyKey: createImageIdempotencyKey() })
            if (!response.success || !('requestPersistence' in response) || !response.requestPersistence) throw new Error('Risposta Current pipeline non valida.')
            setRealRequestPersistence(response.requestPersistence)
            setRealStatus(null)
        } catch (nextError) { setError(nextError instanceof Error ? nextError : new Error('Generazione Current pipeline non riuscita.')) } finally { setIsGeneratingImage(false) }
    }

    async function handleSaveLineageReview() {
        if (!lineageRequest) return
        setLineageError(null)
        try {
            await submitLineageComparisonReview({ operation: 'SUBMIT_LINEAGE_COMPARISON_REVIEW', creatureId: creature.id, lineageRequestId: lineageRequest.transformationRequestId, ...(realRequestPersistence ? { currentRequestId: realRequestPersistence.transformationRequestId } : {}), scores: lineageReview as { creativeSurprise: 1 | 2 | 3 | 4 | 5, targetTransformationStrength: 1 | 2 | 3 | 4 | 5, creatureContinuity: 1 | 2 | 3 | 4 | 5, lineagePreservation: 1 | 2 | 3 | 4 | 5, nonTargetStability: 1 | 2 | 3 | 4 | 5 }, preferredResult })
            setLineageReviewSaved(true)
        } catch (nextError) { setLineageError(nextError instanceof Error ? nextError : new Error('Impossibile salvare la review A/B.')) }
    }

    async function handleGenerateConcept(retry = false) {
        setIsGeneratingConcept(true)
        setError(null)
        setImageResult(null)
        setRetryAction(null)
        const idempotencyKey = retry && conceptRetryKey ? conceptRetryKey : createConceptIdempotencyKey()
        if (!retry) setConceptRetryKey(idempotencyKey)

        try {
            const nextResult = await generateCreatureTransformationConcept({
                operation: 'GENERATE_CONCEPT',
                creatureId: creature.id,
                visualTraitId,
                intensity,
                conceptMode,
                idempotencyKey,
            })
            setConceptResult(nextResult)
            setConceptRetryKey(null)
        } catch (nextError) {
            setConceptResult(null)
            const normalizedError = nextError instanceof Error ? nextError : new Error('Generazione concept non riuscita.')
            setError(normalizedError)
            if (isTechnicalRetryable(normalizedError)) setRetryAction('CONCEPT')
        } finally {
            setIsGeneratingConcept(false)
        }
    }

    async function handleGenerateImage(retry = false) {
        if (!conceptResult || !imageGenerationAvailable) return

        setIsGeneratingImage(true)
        setError(null)
        setRetryAction(null)
        const idempotencyKey = retry && imageRetryKey ? imageRetryKey : createImageIdempotencyKey()
        if (!retry) setImageRetryKey(idempotencyKey)
        try {
            const nextResult = await generateCreatureTransformationImage({
                operation: 'GENERATE_IMAGE',
                creatureId: creature.id,
                concept: conceptResult.concept,
                imageProviderMode: 'MOCK',
                idempotencyKey,
            })
            if ('accepted' in nextResult) {
                setError(new Error('La richiesta mock non puo essere accettata in background.'))
            } else {
                setImageResult(nextResult)
                setImageRetryKey(null)
            }
        } catch (nextError) {
            const normalizedError = nextError instanceof Error ? nextError : new Error('Generazione immagine mock non riuscita.')
            setError(normalizedError)
            if (isTechnicalRetryable(normalizedError)) setRetryAction('IMAGE')
        } finally {
            setIsGeneratingImage(false)
        }
    }

    async function handleGenerateExperimentalImage() {
        if (!conceptResult || !imageGenerationAvailable || !realCostConfirmed || realRequestIsRunning) return
        setIsGeneratingImage(true)
        setError(null)
        setRetryAction(null)
        setRealPollingTimedOut(false)
        const idempotencyKey = createImageIdempotencyKey()
        try {
            const response = await generateCreatureTransformationImage({
                operation: 'GENERATE_IMAGE', creatureId: creature.id, concept: conceptResult.concept, imageProviderMode: 'REAL', idempotencyKey,
            })
            setRealRequestPersistence(response.requestPersistence)
            setRealStatus(null)
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError : new Error('Generazione immagine sperimentale non riuscita.'))
        } finally {
            setIsGeneratingImage(false)
        }
    }

    return (
        <section className="creature-transformation-lab" aria-labelledby="creature-transformation-lab-title">
            <header className="creature-transformation-lab__header">
                <button type="button" onClick={onBack}>{'<- Home'}</button>
                <div>
                    <span className="eyebrow">Development-only</span>
                    <h1 id="creature-transformation-lab-title">Laboratorio trasformazioni</h1>
                </div>
            </header>

            <section className="creature-transformation-lab__identity" aria-label="Creatura autenticata">
                <img src="/assets/battle/creatures/verdant-hatchling.png" alt="Anteprima del drago sorgente" />
                <div>
                    <span>Creatura autenticata</span>
                    <strong>{creature.name ?? 'Creatura iniziale'}</strong>
                    <small>Anteprima browser della stessa creatura base usata dal source canonico server-side.</small>
                    {conceptResult ? <p>{conceptResult.identity.description}</p> : null}
                </div>
            </section>

            <section className="creature-transformation-lab__shared-input" aria-label="Input condiviso A/B">
                <header><span className="eyebrow">INPUT CONDIVISO</span><h2>Esperimento A/B</h2><p>Entrambe le pipeline partono dalla stessa visuale produttiva e dallo stesso target anatomico.</p></header>
                <label>Source<select value={lineageSourceRequestId ? 'EXPERIMENTAL_SHARED_SOURCE' : 'CURRENT_PROFILE_VISUAL'} disabled><option value="CURRENT_PROFILE_VISUAL">Ultima evoluzione attiva del profilo</option>{lineageSourceRequestId ? <option value="EXPERIMENTAL_SHARED_SOURCE">Risultato sperimentale condiviso A/B</option> : null}</select></label>
                <label>Target anatomico<select value={lineageTargetId} onChange={(event) => setLineageTargetId(event.target.value as EvolutionTargetId)} disabled={isBusy}>{EVOLUTION_TARGETS.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select></label>
                <label className="creature-transformation-lab__cost-confirmation"><input type="checkbox" checked={realCostConfirmed} onChange={(event) => setRealCostConfirmed(event.target.checked)} disabled={isBusy} /> Confermo che entrambe le generazioni REAL possono avere un costo.</label>
            </section>

            <section className="creature-transformation-lab__controls creature-transformation-lab__current" aria-label="Configurazione pipeline corrente">
                <header className="creature-transformation-lab__panel-heading"><span className="eyebrow">A · CONTROL</span><h2>Current pipeline</h2><p>Il flusso attuale, invariato: usalo come riferimento A.</p></header>
                <label>
                    Visual Trait
                    <select value={visualTraitId} onChange={(event) => { setVisualTraitId(event.target.value as VisualTraitId); invalidateConceptAndImage() }} disabled={isBusy}>
                        {VISUAL_TRAITS.map((trait) => <option key={trait.id} value={trait.id}>{trait.displayName}</option>)}
                    </select>
                </label>
                <p className="creature-transformation-lab__trait-description">Il server risolve visual trait e funzione a partire dal target condiviso, poi esegue concept AI, evaluator e immagine REAL.</p>
                <label>
                    Intensita
                    <select value={intensity} onChange={(event) => { setIntensity(Number(event.target.value) as TransformationIntensity); invalidateConceptAndImage() }} disabled={isBusy}>
                        {TRANSFORMATION_INTENSITIES.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                </label>
                <label>
                    Concept Generator
                    <select value={conceptMode} onChange={(event) => { setConceptMode(event.target.value as ConceptMode); invalidateConceptAndImage() }} disabled={isBusy}>
                        <option value="MOCK">MOCK - nessun costo</option>
                        <option value="AI">AI - server-side</option>
                    </select>
                </label>
                <button type="button" className="primary-button" onClick={() => void handleGenerateCurrentPipeline()} disabled={!realCostConfirmed || isBusy}>
                    {isGeneratingImage ? 'Genero A...' : 'Generate A · Current'}
                </button>
            </section>

            <section className="creature-transformation-lab__controls creature-transformation-lab__lineage" aria-label="Lineage-first experimental configuration">
                <header><span className="eyebrow">Admin-only · experimental</span><h2>Lineage-first experimental</h2><p>Preserve the past, do not prescribe the future. Questo percorso genera solo asset <strong>EXPERIMENT_ONLY</strong> e non puo adottare visuali nel profilo.</p></header>
                <label>Identity / lineage traits<textarea value={lineage.identityTraits.join('\n')} onChange={(event) => setLineage((current) => ({ ...current, identityTraits: event.target.value.split('\n').filter(Boolean) }))} placeholder="Un tratto per riga" disabled={isBusy} /></label>
                <fieldset><legend>Acquired traits</legend>{lineage.acquiredTraits.map((trait, index) => <p key={`${trait.target ?? 'any'}-${index}`}>{trait.target ? `${trait.target}: ` : ''}{trait.description} <button type="button" onClick={() => setLineage((current) => ({ ...current, acquiredTraits: current.acquiredTraits.filter((_, itemIndex) => itemIndex !== index) }))}>Rimuovi</button></p>)}<input value={lineageTraitDraft} onChange={(event) => setLineageTraitDraft(event.target.value)} placeholder="Mutazione già acquisita" disabled={isBusy} /><button type="button" onClick={() => { if (lineageTraitDraft.trim()) { setLineage((current) => ({ ...current, acquiredTraits: [...current.acquiredTraits, { target: lineageTargetId, description: lineageTraitDraft.trim() }] })); setLineageTraitDraft('') } }} disabled={isBusy}>Aggiungi tratto</button></fieldset>
                <label>Experimental instruction (optional)<textarea value={lineageInstruction} maxLength={2000} onChange={(event) => setLineageInstruction(event.target.value)} disabled={isBusy} /></label>
                {lineageSourceRequestId ? <p>Source sperimentale condivisa A/B: {lineageSourceRequestId} <button type="button" onClick={() => { setLineageSourceRequestId(null); setLineageSourcePreview(null) }} disabled={isBusy}>Ripristina visuale canonica del profilo</button></p> : <p>Source: visuale canonica corrente, identica alla pipeline A.</p>}
                <label className="creature-transformation-lab__cost-confirmation"><input type="checkbox" checked={realCostConfirmed} onChange={(event) => setRealCostConfirmed(event.target.checked)} disabled={isBusy} /> Confermo che questa generazione REAL può avere un costo.</label>
                <div className="creature-transformation-lab__lineage-actions"><button type="button" className="primary-button" onClick={() => void handleGenerateLineageFirst()} disabled={!realCostConfirmed || isBusy}>Generate Lineage-first</button><small>Richiede allowlist server-side e protezioni REAL attive.</small></div>
            </section>

            {lineageError ? <section className="creature-transformation-lab__error" role="alert"><strong>Lineage-first experimental</strong><p>{lineageError.message}</p></section> : null}
            {realRequestPersistence || lineageRequest ? (
                <section className="creature-transformation-lab__comparison-workspace" aria-label="Confronto risultati e prompt A B" aria-live="polite">
                    <article className="creature-transformation-lab__comparison-card creature-transformation-lab__comparison-card--source">
                        <header><span className="eyebrow">SOURCE CONDIVISA</span><h2>Immagine di partenza</h2></header>
                        <figure className="creature-transformation-lab__experimental-image"><img src={comparisonSource.signedUrl} alt="Immagine di partenza condivisa dalle pipeline A e B" /><figcaption>{comparisonSource.label}</figcaption></figure>
                        <p>Questa è la stessa sorgente inviata dal server a entrambe le pipeline per questo confronto.</p>
                    </article>

                    <article className="creature-transformation-lab__comparison-card creature-transformation-lab__comparison-card--current">
                        <header><span className="eyebrow">A · CONTROL</span><h2>Current pipeline</h2></header>
                        {realRequestPersistence ? <>
                            <p><strong>Request:</strong> {realRequestPersistence.transformationRequestId} · {realStatus?.requestPersistence.status ?? realRequestPersistence.status}</p>
                            {realStatus?.generation ? <dl className="creature-transformation-lab__image-metadata"><div><dt>Model</dt><dd>{realStatus.generation.model}</dd></div><div><dt>Latenza</dt><dd>{realStatus.generation.latencyMs ?? '…'} ms</dd></div><div><dt>Costo stimato</dt><dd>${realStatus.generation.estimatedCostUsd ?? 0}</dd></div></dl> : null}
                            {realStatus?.result ? <figure className="creature-transformation-lab__experimental-image"><img src={realStatus.result.signedUrl} alt="Risultato A della pipeline corrente" /><figcaption>{realStatus.result.assetReadiness} — non adottabile</figcaption></figure> : null}
                            {realStatus?.error ? <div className="creature-transformation-lab__error" role="alert"><strong>{realStatus.error.code}</strong><p>{realStatus.error.message}</p></div> : null}
                            {realPollingTimedOut ? <p>Il polling locale ha raggiunto il timeout; riapri il laboratorio per verificare lo stato.</p> : null}
                            {!realStatus?.result && !realStatus?.error && !realPollingTimedOut ? <p>Generazione A in corso…</p> : null}
                            <details className="creature-transformation-lab__prompt" open><summary>Prompt inviato ad A</summary>{realStatus?.prompt ? <><pre>{realStatus.prompt.text}</pre><small>SHA-256: {shortHash(realStatus.prompt.sha256)}</small></> : <p>Il prompt sarà disponibile al termine della richiesta A. Le richieste precedenti a questo aggiornamento non lo contengono.</p>}</details>
                        </> : <p className="creature-transformation-lab__comparison-empty">Avvia “Generate A · Current” per popolare questo lato del confronto.</p>}
                    </article>

                    <article className="creature-transformation-lab__comparison-card creature-transformation-lab__comparison-card--lineage">
                        <header><span className="eyebrow">B · EXPERIMENTAL</span><h2>Lineage-first</h2></header>
                        {lineageRequest ? <>
                            <p><strong>Request:</strong> {lineageRequest.transformationRequestId} · {lineageStatus?.requestPersistence.status ?? lineageRequest.status}</p>
                            {lineageStatus?.generation ? <dl className="creature-transformation-lab__image-metadata"><div><dt>Model</dt><dd>{lineageStatus.generation.model}</dd></div><div><dt>Latenza</dt><dd>{lineageStatus.generation.latencyMs ?? '…'} ms</dd></div><div><dt>Costo stimato</dt><dd>${lineageStatus.generation.estimatedCostUsd ?? 0}</dd></div></dl> : null}
                            {lineageStatus?.result ? <><figure className="creature-transformation-lab__experimental-image"><img src={lineageStatus.result.signedUrl} alt="Risultato B lineage-first" /><figcaption>EXPERIMENT_ONLY — non adottabile</figcaption></figure><button type="button" onClick={() => { const selectedResult = lineageStatus?.result; if (!selectedResult) return; setLineageSourceRequestId(lineageRequest.transformationRequestId); setLineageSourcePreview({ requestId: lineageRequest.transformationRequestId, signedUrl: selectedResult.signedUrl }) }}>Use as next shared A/B source</button></> : null}
                            {lineageStatus?.error ? <div className="creature-transformation-lab__error" role="alert"><strong>{lineageStatus.error.code}</strong><p>{lineageStatus.error.message}</p><p>La generazione B è terminata con errore; non è in corso.</p></div> : null}
                            {!lineageStatus?.result && !lineageStatus?.error ? <p>Generazione B in corso…</p> : null}
                            <details className="creature-transformation-lab__prompt" open><summary>Prompt inviato a B</summary>{lineageStatus?.prompt ? <><pre>{lineageStatus.prompt.text}</pre><small>SHA-256: {shortHash(lineageStatus.prompt.sha256)}</small></> : <p>Il prompt sarà disponibile al termine della richiesta B. Le richieste precedenti a questo aggiornamento non lo contengono.</p>}</details>
                            <details><summary>Lineage inviato</summary><pre>{formatJson(lineage)}</pre></details>
                            {lineageStatus?.result ? <fieldset className="creature-transformation-lab__review"><legend>Review A/B (1–5)</legend>{LINEAGE_REVIEW_KEYS.map((key) => <label key={key}>{key}<select value={lineageReview[key]} onChange={(event) => { setLineageReviewSaved(false); setLineageReview((current) => ({ ...current, [key]: Number(event.target.value) })) }}>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}</select></label>)}<label>Preferred result<select value={preferredResult} onChange={(event) => { setLineageReviewSaved(false); setPreferredResult(event.target.value as typeof preferredResult) }}><option value="CURRENT">CURRENT</option><option value="LINEAGE_FIRST">LINEAGE_FIRST</option><option value="NONE">NONE</option></select></label><button type="button" onClick={() => void handleSaveLineageReview()}>Salva review A/B</button>{lineageReviewSaved ? <p>Review A/B salvata.</p> : null}</fieldset> : null}
                        </> : <p className="creature-transformation-lab__comparison-empty">Avvia “Generate Lineage-first” per popolare questo lato del confronto.</p>}
                    </article>
                </section>
            ) : null}
            {lineageRequest ? (
                <section className="creature-transformation-lab__image-result creature-transformation-lab__legacy-lineage-result" aria-live="polite">
                    <h2>Result B · Lineage-first</h2>
                    <p>Request: {lineageRequest.transformationRequestId} · {lineageStatus?.requestPersistence.status ?? lineageRequest.status}</p>
                    {lineageStatus?.result ? <>
                        <figure className="creature-transformation-lab__experimental-image"><img src={lineageStatus.result.signedUrl} alt="Risultato lineage-first sperimentale" /><figcaption>EXPERIMENT_ONLY — non adottabile</figcaption></figure>
                        <button type="button" onClick={() => setLineageSourceRequestId(lineageRequest.transformationRequestId)}>Use as next shared A/B source</button>
                        <fieldset className="creature-transformation-lab__review"><legend>Review A/B (1–5)</legend>{LINEAGE_REVIEW_KEYS.map((key) => <label key={key}>{key}<select value={lineageReview[key]} onChange={(event) => { setLineageReviewSaved(false); setLineageReview((current) => ({ ...current, [key]: Number(event.target.value) })) }}>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}</select></label>)}<label>Preferred result<select value={preferredResult} onChange={(event) => { setLineageReviewSaved(false); setPreferredResult(event.target.value as typeof preferredResult) }}><option value="CURRENT">CURRENT</option><option value="LINEAGE_FIRST">LINEAGE_FIRST</option><option value="NONE">NONE</option></select></label><button type="button" onClick={() => void handleSaveLineageReview()}>Salva review A/B</button>{lineageReviewSaved ? <p>Review A/B salvata.</p> : null}</fieldset>
                    </> : lineageStatus?.error ? <div className="creature-transformation-lab__error" role="alert"><strong>{lineageStatus.error.code}</strong><p>{lineageStatus.error.message}</p><p>La generazione B è terminata con errore; non è in corso.</p></div> : <p>Generazione sperimentale in corso…</p>}
                    <details><summary>Lineage inviato</summary><pre>{formatJson(lineage)}</pre></details>
                </section>
            ) : null}

            {error ? (
                <section className="creature-transformation-lab__error" role="alert">
                    <strong>{error instanceof CreatureTransformationApiError ? error.code : 'Errore richiesta'}</strong>
                    <p>{error.message}</p>
                    {error instanceof CreatureTransformationApiError && error.requestPersistence ? <p><strong>Request record:</strong> {error.requestPersistence.transformationRequestId} · {error.requestPersistence.status} · {error.requestPersistence.idempotencyStatus}</p> : null}
                    {error instanceof CreatureTransformationApiError && error.problems?.length ? (
                        <ul>{error.problems.map((problem) => <li key={`${problem.code}-${problem.path ?? ''}`}>{problem.code}: {problem.message}</li>)}</ul>
                    ) : null}
                    {retryAction ? <button type="button" onClick={() => void (retryAction === 'CONCEPT' ? handleGenerateConcept(true) : handleGenerateImage(true))} disabled={isBusy}>Riprova tecnicamente</button> : null}
                </section>
            ) : null}

            {conceptResult ? (
                <section className="creature-transformation-lab__result" aria-live="polite">
                    <header>
                        <div><span>Request</span><strong>{conceptResult.requestId}</strong></div>
                        <div><span>Request record</span><strong>{conceptResult.requestPersistence.transformationRequestId}</strong></div>
                        <div><span>Stato</span><strong>{conceptResult.requestPersistence.status} ({conceptResult.requestPersistence.idempotencyStatus})</strong></div>
                        <div><span>Generator</span><strong>{conceptResult.generation.generator}{conceptResult.generation.isMock ? ' (mock)' : ''}</strong></div>
                        {conceptResult.generation.model ? <div><span>Modello</span><strong>{conceptResult.generation.model}</strong></div> : null}
                        <div><span>Tentativi</span><strong>{conceptResult.generation.attempts}</strong></div>
                        <div><span>Latenza</span><strong>{conceptResult.generation.latencyMs} ms</strong></div>
                    </header>

                    <section className="creature-transformation-lab__evaluation">
                        <h2>Valutazione</h2>
                        <p><strong>Identity risk:</strong> {conceptResult.evaluation.identityRisk}</p>
                        <p><strong>Transformation strength:</strong> {conceptResult.evaluation.transformationStrength}</p>
                        {conceptResult.evaluation.problems.length ? <ul>{conceptResult.evaluation.problems.map((problem) => <li key={`${problem.code}-${problem.path ?? ''}`}>{problem.code}: {problem.message}</li>)}</ul> : <p>Nessun warning qualitativo.</p>}
                    </section>

                    <section className="creature-transformation-lab__image-controls" aria-label="Generazione immagine mock">
                        <label>
                            Image provider mode
                            <select value="MOCK" disabled><option value="MOCK">MOCK - simulazione tecnica</option></select>
                        </label>
                        <button type="button" className="primary-button" onClick={() => void handleGenerateImage()} disabled={!imageGenerationAvailable}>
                            {isGeneratingImage ? 'Genero immagine mock...' : 'Genera immagine mock'}
                        </button>
                        {REAL_IMAGE_FRONTEND_ENABLED ? (
                            <div className="creature-transformation-lab__real-image-controls">
                                <p><strong>Generazione nativa:</strong> GPT Image 1.5 restituisce direttamente il PNG trasparente; l adozione resta sempre manuale.</p>
                                <label><input type="checkbox" checked={realCostConfirmed} onChange={(event) => setRealCostConfirmed(event.target.checked)} disabled={isBusy} /> Ho compreso che la richiesta reale puo avere un costo.</label>
                                <button type="button" className="primary-button" onClick={() => void handleGenerateExperimentalImage()} disabled={!imageGenerationAvailable || !realCostConfirmed || isBusy}>
                                    {isGeneratingImage ? 'Avvio generazione nativa...' : 'Rielabora ultimo concept: PNG trasparente'}
                                </button>
                                <small>Il PNG deve superare i controlli server-side su dimensioni, alpha e copertura trasparente.</small>
                            </div>
                        ) : null}
                    </section>

                    <details open><summary>Concept JSON</summary><pre>{formatJson(conceptResult.concept)}</pre></details>
                    <details><summary>Prompt finale</summary><pre>{conceptResult.prompt.prompt}</pre></details>
                </section>
            ) : null}

            {imageResult ? (
                <section className="creature-transformation-lab__image-result" aria-live="polite">
                    <div className="creature-transformation-lab__mock-banner">Mock: nessuna trasformazione visiva applicata</div>
                    <div className="creature-transformation-lab__image-compare">
                        <figure><img src="/assets/battle/creatures/verdant-hatchling.png" alt="Sorgente canonica della creatura" /><figcaption>Sorgente: anteprima browser della creatura base</figcaption></figure>
                        <figure><img src={imageResult.result.signedUrl} alt="Risultato mock della trasformazione" /><figcaption>Risultato: byte della sorgente restituiti dal provider mock</figcaption></figure>
                    </div>
                    <dl className="creature-transformation-lab__image-metadata">
                        <div><dt>Request ID</dt><dd>{imageResult.requestId}</dd></div>
                        <div><dt>Request record</dt><dd>{imageResult.requestPersistence.transformationRequestId}</dd></div>
                        <div><dt>Persistenza</dt><dd>{imageResult.requestPersistence.status} ({imageResult.requestPersistence.idempotencyStatus})</dd></div>
                        <div><dt>Provider</dt><dd>{imageResult.generation.provider}</dd></div>
                        <div><dt>Model</dt><dd>{imageResult.generation.model}</dd></div>
                        <div><dt>isMock</dt><dd>{String(imageResult.generation.isMock)}</dd></div>
                        <div><dt>Latenza</dt><dd>{imageResult.generation.latencyMs} ms</dd></div>
                        <div><dt>Costo</dt><dd>${imageResult.generation.estimatedCostUsd ?? 0}</dd></div>
                        <div><dt>Costo stimato</dt><dd>${imageResult.requestPersistence.estimatedCostUsd ?? 0}</dd></div>
                        <div><dt>Costo effettivo</dt><dd>${imageResult.requestPersistence.actualCostUsd ?? 0}</dd></div>
                        <div><dt>Dimensioni</dt><dd>{imageResult.result.width} × {imageResult.result.height}</dd></div>
                        <div><dt>SHA-256</dt><dd title={imageResult.result.sha256}>{shortHash(imageResult.result.sha256)}</dd></div>
                        <div><dt>Scadenza URL</dt><dd>{new Date(imageResult.result.expiresAt).toLocaleString()}</dd></div>
                    </dl>
                    {imageResult.validation.warnings.length ? <ul className="creature-transformation-lab__warnings">{imageResult.validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
                </section>
            ) : null}

            {realRequestPersistence ? (
                <section className="creature-transformation-lab__image-result creature-transformation-lab__legacy-current-result" aria-live="polite">
                    <div className="creature-transformation-lab__mock-banner">Risultato sperimentale: non sostituisce ancora la creatura del profilo.</div>
                    <p><strong>Request record:</strong> {realRequestPersistence.transformationRequestId}</p>
                    <p><strong>Stato:</strong> {realStatus?.requestPersistence.status ?? realRequestPersistence.status}</p>
                    {realPollingTimedOut ? <p>Il polling locale ha raggiunto il timeout; puoi riaprire il laboratorio per verificare lo stato.</p> : null}
                    {realStatus?.generation ? <dl className="creature-transformation-lab__image-metadata">
                        <div><dt>Provider</dt><dd>{realStatus.generation.provider}</dd></div>
                        <div><dt>Model</dt><dd>{realStatus.generation.model}</dd></div>
                        {realStatus.generation.providerRequestId ? <div><dt>OpenAI request ID</dt><dd>{realStatus.generation.providerRequestId}</dd></div> : null}
                        {realStatus.generation.latencyMs !== undefined ? <div><dt>Latenza</dt><dd>{realStatus.generation.latencyMs} ms</dd></div> : null}
                        <div><dt>Costo stimato</dt><dd>${realStatus.generation.estimatedCostUsd ?? 0}</dd></div>
                        <div><dt>Costo effettivo</dt><dd>{realStatus.generation.actualCostUsd === undefined ? 'Non disponibile' : `$${realStatus.generation.actualCostUsd}`}</dd></div>
                    </dl> : null}
                    {realStatus?.result ? <>
                        <figure className="creature-transformation-lab__experimental-image"><img src={realStatus.result.signedUrl} alt="Risultato sperimentale della trasformazione" /><figcaption>{realStatus.result.assetReadiness}</figcaption></figure>
                        <p><strong>Asset:</strong> {realStatus.result.assetReadiness}</p>
                        {realStatus.result.warnings.length ? <ul className="creature-transformation-lab__warnings">{realStatus.result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
                    </> : null}
                    {realStatus?.error ? <p role="alert"><strong>{realStatus.error.code}</strong>: {realStatus.error.message}</p> : null}
                </section>
            ) : null}
            {BENCHMARK_FRONTEND_ENABLED ? <CreatureTransformationBenchmark creature={creature} /> : null}
        </section>
    )
}
