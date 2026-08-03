import { useEffect, useState } from 'react'

import {
    TRANSFORMATION_INTENSITIES,
    VISUAL_TRAIT_BY_ID,
    VISUAL_TRAITS,
    type GenerateConceptResponse,
    type TransformationRequestPersistence,
    type TransformationRequestStatusResponse,
    type GenerateImageResponse,
    type TransformationIntensity,
    type VisualTraitId,
} from '../../../shared/creature-transformations/index.ts'
import type { PlayerCreatureRecord } from '../../lib/profile-api'
import {
    createConceptIdempotencyKey,
    createImageIdempotencyKey,
    CreatureTransformationApiError,
    getCreatureTransformationRequestStatus,
    generateCreatureTransformationConcept,
    generateCreatureTransformationImage,
} from '../../lib/creature-transformations-api'
import { canGenerateMockImage } from './lab-image-state'
import { CreatureTransformationBenchmark } from './CreatureTransformationBenchmark'
import { isCreatureTransformationBenchmarkVisible } from './lab-benchmark-flag'
import { isRealImageExperimentVisible } from './lab-real-image-flag'

import './CreatureTransformationLab.css'

type ConceptMode = 'MOCK' | 'AI'
const REAL_IMAGE_FRONTEND_ENABLED = isRealImageExperimentVisible(import.meta.env.VITE_CREATURE_TRANSFORMATION_REAL_IMAGE_ENABLED)
const BENCHMARK_FRONTEND_ENABLED = isCreatureTransformationBenchmarkVisible(import.meta.env.VITE_CREATURE_TRANSFORMATION_BENCHMARK_ENABLED)
const REAL_POLL_INTERVAL_MS = 2500
const REAL_POLL_TIMEOUT_MS = 60000

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
    const visualTrait = VISUAL_TRAIT_BY_ID[visualTraitId]
    const realRequestIsRunning = Boolean(realRequestPersistence && !isTerminalRequestStatus(realStatus?.requestPersistence.status ?? realRequestPersistence.status) && !realPollingTimedOut)
    const isBusy = isGeneratingConcept || isGeneratingImage || realRequestIsRunning
    const imageGenerationAvailable = canGenerateMockImage(conceptResult, isGeneratingConcept, isGeneratingImage) && !realRequestIsRunning

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

            <section className="creature-transformation-lab__controls" aria-label="Configurazione concept">
                <label>
                    Visual Trait
                    <select value={visualTraitId} onChange={(event) => { setVisualTraitId(event.target.value as VisualTraitId); invalidateConceptAndImage() }} disabled={isBusy}>
                        {VISUAL_TRAITS.map((trait) => <option key={trait.id} value={trait.id}>{trait.displayName}</option>)}
                    </select>
                </label>
                <p className="creature-transformation-lab__trait-description">{visualTrait.description}</p>
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
                <button type="button" className="primary-button" onClick={() => void handleGenerateConcept()} disabled={isBusy}>
                    {isGeneratingConcept ? 'Genero concept...' : 'Genera concept'}
                </button>
            </section>

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
                                <p><strong>Pilot a pagamento:</strong> il risultato e sperimentale e non sostituisce la creatura del profilo.</p>
                                <label><input type="checkbox" checked={realCostConfirmed} onChange={(event) => setRealCostConfirmed(event.target.checked)} disabled={isBusy} /> Ho compreso che la richiesta reale puo avere un costo.</label>
                                <button type="button" className="primary-button" onClick={() => void handleGenerateExperimentalImage()} disabled={!imageGenerationAvailable || !realCostConfirmed || isBusy}>
                                    {isGeneratingImage ? 'Avvio richiesta sperimentale...' : 'Genera immagine sperimentale'}
                                </button>
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
                <section className="creature-transformation-lab__image-result" aria-live="polite">
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
                        <figure><img src={realStatus.result.signedUrl} alt="Risultato sperimentale della trasformazione" /><figcaption>{realStatus.result.assetReadiness}</figcaption></figure>
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
