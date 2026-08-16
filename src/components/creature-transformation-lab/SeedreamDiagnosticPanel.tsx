import { useEffect, useState } from 'react'

import {
    EVOLUTION_TARGETS,
    type EvolutionTargetId,
    type RunSeedreamDiagnosticRequest,
    type TransformationRequestStatusResponse,
} from '../../../shared/creature-transformations/index.ts'
import {
    createVisualTransformationIdempotencyKey,
    getCreatureTransformationRequestStatus,
    runSeedreamDiagnostic,
} from '../../lib/creature-transformations-api'

type ExperimentMode = RunSeedreamDiagnosticRequest['experimentMode']
type ChainMode = RunSeedreamDiagnosticRequest['chainMode']
type ImageSize = Exclude<RunSeedreamDiagnosticRequest['seedream']['imageSize'], { width: number, height: number }>
type SourceFile = Readonly<{ base64: string, mimeType: 'image/png' | 'image/jpeg', name: string, size: number, previewUrl: string }>
type Diagnostic = Readonly<{ transformationRequestId: string, status: TransformationRequestStatusResponse | null }>

const POLL_INTERVAL_MS = 2_500
const DIAGNOSTIC_STORAGE_PREFIX = 'seedream-diagnostic-panel:'
const IMAGE_SIZES: ReadonlyArray<Readonly<{ value: ImageSize, label: string }>> = [
    { value: 'square_hd', label: 'Quadrata HD' },
    { value: 'square', label: 'Quadrata' },
    { value: 'portrait_4_3', label: 'Verticale 4:3' },
    { value: 'portrait_16_9', label: 'Verticale 16:9' },
    { value: 'landscape_4_3', label: 'Orizzontale 4:3' },
    { value: 'landscape_16_9', label: 'Orizzontale 16:9' },
    { value: 'auto_2K', label: 'Auto 2K' },
    { value: 'auto_4K', label: 'Auto 4K' },
]

function encodeBase64(bytes: Uint8Array): string {
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
    return btoa(binary)
}

function parseOptionalInteger(value: string, minimum: number, maximum: number): number | undefined | null {
    if (!value.trim()) return undefined
    const number = Number(value)
    return Number.isInteger(number) && number >= minimum && number <= maximum ? number : null
}

function sourceMimeType(file: File): 'image/png' | 'image/jpeg' | null {
    return file.type === 'image/png' || file.type === 'image/jpeg' ? file.type : null
}

function statusLabel(status: TransformationRequestStatusResponse['requestPersistence']['status'] | null): string {
    if (status === 'RESERVED') return 'In coda'
    if (status === 'RUNNING') return 'In elaborazione'
    if (status === 'SUCCEEDED') return 'Completata'
    if (status === 'FAILED') return 'Fallita'
    return 'Avvio in corso'
}

function diagnosticStorageKey(creatureId: string): string {
    return DIAGNOSTIC_STORAGE_PREFIX + creatureId
}

function readStoredDiagnosticId(creatureId: string): string | null {
    try {
        const requestId = window.localStorage.getItem(diagnosticStorageKey(creatureId))
        return requestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId) ? requestId : null
    } catch {
        return null
    }
}

function storeDiagnosticId(creatureId: string, requestId: string) {
    try { window.localStorage.setItem(diagnosticStorageKey(creatureId), requestId) } catch { /* Restoring the last result is a convenience only. */ }
}

function isLockedFullPromptExperiment(experimentMode: ExperimentMode): boolean {
    return experimentMode === 'fixed-concept-locked-prompt' || experimentMode === 'dynamic-concept-locked-prompt'
}

/**
 * Developer-facing Seedream replay. It sends explicit source bytes to the isolated diagnostic
 * endpoint and only renders the experiment-only result persisted by that endpoint.
 */
export function SeedreamDiagnosticPanel({ creatureId }: { creatureId: string }) {
    const [experimentMode, setExperimentMode] = useState<ExperimentMode>('FIXED_FULL_PROMPT')
    const [chainMode, setChainMode] = useState<ChainMode>('NONE')
    const [evolutionTargetId, setEvolutionTargetId] = useState<EvolutionTargetId>('HEAD_AND_CROWN')
    const [imageSize, setImageSize] = useState<ImageSize>('square_hd')
    const [numImages, setNumImages] = useState('1')
    const [maxImages, setMaxImages] = useState('1')
    const [seed, setSeed] = useState('')
    const [syncMode, setSyncMode] = useState(false)
    const [enableSafetyChecker, setEnableSafetyChecker] = useState(true)
    const [fixedFullPrompt, setFixedFullPrompt] = useState('')
    const [conceptName, setConceptName] = useState('Adattamento diagnostico')
    const [mutationIdea, setMutationIdea] = useState('Rafforza la regione scelta conservando identita, silhouette e stile della creatura.')
    const [visualDetails, setVisualDetails] = useState('Una trasformazione anatomica chiara e leggibile.')
    const [avoid, setAvoid] = useState('')
    const [source, setSource] = useState<SourceFile | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null)

    const previewUrl = source?.previewUrl
    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

    // The raw upload stays out of browser storage, while the server-owned request ID lets a
    // refresh obtain a new signed result URL and show the latest diagnostic again.
    useEffect(() => {
        const transformationRequestId = readStoredDiagnosticId(creatureId)
        setDiagnostic(transformationRequestId ? { transformationRequestId, status: null } : null)
    }, [creatureId])

    useEffect(() => {
        const requestId = diagnostic?.transformationRequestId
        const currentStatus = diagnostic?.status?.requestPersistence.status
        if (!requestId || currentStatus === 'SUCCEEDED' || currentStatus === 'FAILED') return undefined
        let cancelled = false
        const poll = async () => {
            try {
                const status = await getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId: requestId })
                if (!cancelled) setDiagnostic({ transformationRequestId: requestId, status })
            } catch (nextError) {
                if (!cancelled) setError(nextError instanceof Error ? nextError.message : 'Impossibile aggiornare lo stato della diagnosi.')
            }
        }
        void poll()
        const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
        return () => { cancelled = true; window.clearInterval(timer) }
    }, [diagnostic?.status?.requestPersistence.status, diagnostic?.transformationRequestId])

    async function selectSource(file: File | undefined) {
        if (!file) return
        const mimeType = sourceMimeType(file)
        if (!mimeType) {
            setError('Seleziona un file PNG o JPEG con MIME valido.')
            return
        }
        try {
            const base64 = encodeBase64(new Uint8Array(await file.arrayBuffer()))
            if (base64.length > 41_943_040) throw new Error('L immagine supera il limite accettato dalla diagnosi Seedream.')
            setSource({ base64, mimeType, name: file.name, size: file.size, previewUrl: URL.createObjectURL(file) })
            setError(null)
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Non e stato possibile leggere l immagine sorgente.')
        }
    }

    async function submit() {
        if (isSubmitting) return
        if (!source) {
            setError('Carica una sorgente PNG o JPEG per la diagnosi.')
            return
        }
        const parsedNumImages = parseOptionalInteger(numImages, 1, 15)
        const parsedMaxImages = parseOptionalInteger(maxImages, 1, 15)
        const parsedSeed = parseOptionalInteger(seed, 0, 2_147_483_647)
        const details = visualDetails.split('\n').map((entry) => entry.trim()).filter(Boolean)
        const avoidList = avoid.split('\n').map((entry) => entry.trim()).filter(Boolean)
        if (parsedNumImages === null || parsedMaxImages === null || parsedSeed === null || (parsedNumImages !== undefined && parsedMaxImages !== undefined && parsedNumImages * parsedMaxImages > 15)) {
            setError('Controlla numero immagini, massimo immagini e seed.')
            return
        }
        if (experimentMode === 'FIXED_FULL_PROMPT' && !fixedFullPrompt.trim()) {
            setError('Il Test A richiede il prompt completo fisso.')
            return
        }
        if (experimentMode === 'FIXED_MICRO_CONCEPT' && (!conceptName.trim() || !mutationIdea.trim() || !details.length || details.length > 5 || avoidList.length > 4)) {
            setError('Il Test B richiede nome, idea e da uno a cinque dettagli visuali; gli elementi da evitare sono al massimo quattro.')
            return
        }
        setIsSubmitting(true)
        setError(null)
        try {
            const request: RunSeedreamDiagnosticRequest = {
                operation: 'RUN_SEEDREAM_DIAGNOSTIC',
                creatureId,
                evolutionTargetId,
                idempotencyKey: createVisualTransformationIdempotencyKey(),
                experimentMode,
                chainMode,
                source: { base64: source.base64, mimeType: source.mimeType },
                seedream: {
                    imageSize,
                    ...(parsedNumImages === undefined ? {} : { numImages: parsedNumImages }),
                    ...(parsedMaxImages === undefined ? {} : { maxImages: parsedMaxImages }),
                    ...(parsedSeed === undefined ? {} : { seed: parsedSeed }),
                    syncMode,
                    enableSafetyChecker,
                },
                ...(experimentMode === 'FIXED_FULL_PROMPT' ? { fixedFullPrompt: fixedFullPrompt.trim() } : {}),
                ...(experimentMode === 'FIXED_MICRO_CONCEPT' ? {
                    fixedMicroConcept: {
                        conceptName: conceptName.trim(),
                        mutationIdea: mutationIdea.trim(),
                        visualDetails: details,
                        ...(avoidList.length ? { avoid: avoidList } : {}),
                    },
                } : {}),
            }
            const response = await runSeedreamDiagnostic(request)
            const transformationRequestId = response.requestPersistence.transformationRequestId
            storeDiagnosticId(creatureId, transformationRequestId)
            setDiagnostic({ transformationRequestId, status: null })
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Impossibile avviare la diagnosi Seedream.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const status = diagnostic?.status ?? null
    const result = status?.result
    const diagnosticDetails = status?.diagnostic
    const hasFinished = status?.requestPersistence.status === 'SUCCEEDED' || status?.requestPersistence.status === 'FAILED'

    return <section className="seedream-diagnostic-panel" aria-labelledby="seedream-diagnostic-title">
        <header>
            <span className="eyebrow">EXPERIMENT / SEEDREAM 4.5</span>
            <h2 id="seedream-diagnostic-title">Diagnosi Seedream</h2>
            <p>Replay isolato: non apre track, non adotta visuali e salva solo un risultato sperimentale.</p>
        </header>

        <div className="seedream-diagnostic-panel__grid">
            <fieldset>
                <legend>Esperimento</legend>
                <label>Test
                    <select value={experimentMode} onChange={(event) => {
                        const nextExperimentMode = event.target.value as ExperimentMode
                        setExperimentMode(nextExperimentMode)
                        if (isLockedFullPromptExperiment(nextExperimentMode)) setEvolutionTargetId('HEAD_AND_CROWN')
                    }} disabled={isSubmitting}>
                        <option value="FIXED_FULL_PROMPT">A · Prompt completo fisso</option>
                        <option value="FIXED_MICRO_CONCEPT">B · Micro-concept fisso + FLUX v7</option>
                        <option value="REAL_MICRO_CONCEPT">C · Micro-concept reale + FLUX v7</option>
                        <option value="fixed-concept-locked-prompt">D · Concept fisso + Prompt completo lockato</option>
                        <option value="dynamic-concept-locked-prompt">E · Concept dinamico + Prompt completo lockato</option>
                    </select>
                </label>
                <label>Catena
                    <select value={chainMode} onChange={(event) => setChainMode(event.target.value as ChainMode)} disabled={isSubmitting}>
                        <option value="NONE">Una generazione</option>
                        <option value="RAW_PROVIDER_CHAIN">Due step · output raw del provider</option>
                        <option value="NORMALIZED_PROJECT_CHAIN">Due step · output salvato dal progetto</option>
                    </select>
                </label>
                <label>Regione da evolvere
                    <select value={evolutionTargetId} onChange={(event) => setEvolutionTargetId(event.target.value as EvolutionTargetId)} disabled={isSubmitting || isLockedFullPromptExperiment(experimentMode)}>
                        {EVOLUTION_TARGETS.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
                    </select>
                </label>
            </fieldset>

            <fieldset>
                <legend>Sorgente</legend>
                <label>PNG o JPEG
                    <input type="file" accept="image/png,image/jpeg" onChange={(event) => { void selectSource(event.target.files?.[0]); event.target.value = '' }} disabled={isSubmitting} />
                </label>
                {source ? <div className="seedream-diagnostic-panel__source">
                    <img src={source.previewUrl} alt="Anteprima dell immagine sorgente" />
                    <p><strong>{source.name}</strong><br />{source.mimeType} · {Math.ceil(source.size / 1024)} KB</p>
                </div> : <p className="seedream-diagnostic-panel__hint">Usa la stessa immagine locale che vuoi confrontare con Seedream.</p>}
            </fieldset>

            <fieldset>
                <legend>Parametri Seedream</legend>
                <label>Formato
                    <select value={imageSize} onChange={(event) => setImageSize(event.target.value as ImageSize)} disabled={isSubmitting}>
                        {IMAGE_SIZES.map((size) => <option key={size.value} value={size.value}>{size.label}</option>)}
                    </select>
                </label>
                <div className="seedream-diagnostic-panel__numeric-fields">
                    <label>Immagini<input type="number" min="1" max="15" value={numImages} onChange={(event) => setNumImages(event.target.value)} disabled={isSubmitting} /></label>
                    <label>Massimo<input type="number" min="1" max="15" value={maxImages} onChange={(event) => setMaxImages(event.target.value)} disabled={isSubmitting} /></label>
                    <label>Seed<input type="number" min="0" max="2147483647" value={seed} onChange={(event) => setSeed(event.target.value)} disabled={isSubmitting} /></label>
                </div>
                <label className="seedream-diagnostic-panel__toggle"><input type="checkbox" checked={syncMode} onChange={(event) => setSyncMode(event.target.checked)} disabled={isSubmitting} />Risposta sincrona</label>
                <label className="seedream-diagnostic-panel__toggle"><input type="checkbox" checked={enableSafetyChecker} onChange={(event) => setEnableSafetyChecker(event.target.checked)} disabled={isSubmitting} />Safety checker</label>
            </fieldset>
        </div>

        {experimentMode === 'FIXED_FULL_PROMPT' ? <fieldset>
            <legend>Prompt fisso · Test A</legend>
            <label>Prompt completo<textarea value={fixedFullPrompt} onChange={(event) => setFixedFullPrompt(event.target.value)} maxLength={20_000} placeholder="Incolla qui il prompt Seedream da riprodurre senza modifiche." disabled={isSubmitting} /></label>
        </fieldset> : null}

        {experimentMode === 'FIXED_MICRO_CONCEPT' ? <fieldset>
            <legend>Micro-concept fisso · Test B</legend>
            <div className="seedream-diagnostic-panel__concept-fields">
                <label>Nome<input value={conceptName} onChange={(event) => setConceptName(event.target.value)} maxLength={120} disabled={isSubmitting} /></label>
                <label>Idea di mutazione<textarea value={mutationIdea} onChange={(event) => setMutationIdea(event.target.value)} maxLength={800} disabled={isSubmitting} /></label>
                <label>Dettagli visuali · uno per riga<textarea value={visualDetails} onChange={(event) => setVisualDetails(event.target.value)} disabled={isSubmitting} /></label>
                <label>Da evitare · uno per riga<textarea value={avoid} onChange={(event) => setAvoid(event.target.value)} disabled={isSubmitting} /></label>
            </div>
        </fieldset> : null}

        {isLockedFullPromptExperiment(experimentMode) ? <fieldset>
            <legend>Prompt completo lockato · Test {experimentMode === 'fixed-concept-locked-prompt' ? 'D' : 'E'}</legend>
            <p className="seedream-diagnostic-panel__hint">Usa lo stesso template server con vista 3/4, direzione invariata e framing completo su HEAD_AND_CROWN. Il Test D usa il concept fisso dei palchi vellutati arancioni; il Test E inserisce invece un concept reale nel medesimo guscio lockato.</p>
        </fieldset> : null}

        <div className="seedream-diagnostic-panel__actions">
            <button type="button" className="primary-button" onClick={() => void submit()} disabled={isSubmitting}>{isSubmitting ? 'Avvio Seedream…' : 'Avvia diagnosi Seedream'}</button>
            {diagnostic ? <p role="status">Richiesta {diagnostic.transformationRequestId} · {statusLabel(status?.requestPersistence.status ?? null)}</p> : null}
        </div>

        {error ? <p className="seedream-diagnostic-panel__error" role="alert">{error}</p> : null}
        {status?.error ? <p className="seedream-diagnostic-panel__error" role="alert">{status.error.code}: {status.error.message}</p> : null}
        {hasFinished && result ? <section className="seedream-diagnostic-panel__result" aria-labelledby="seedream-diagnostic-result-title">
            <h3 id="seedream-diagnostic-result-title">Risultato diagnostico</h3>
            <img src={result.signedUrl} alt="Risultato Seedream diagnostico" />
            <dl>
                <div><dt>Modello</dt><dd>{status.generation?.model ?? '—'}</dd></div>
                <div><dt>Output salvato</dt><dd>{result.mimeType} · {result.width} × {result.height}</dd></div>
                <div><dt>Catena</dt><dd>{chainMode}</dd></div>
                {diagnosticDetails ? <><div><dt>Variante</dt><dd>{diagnosticDetails.variantId}</dd></div>
                    <div><dt>Sorgente concept</dt><dd>{diagnosticDetails.conceptSource ?? 'nessuna'}</dd></div>
                    <div><dt>Strategia prompt</dt><dd>{diagnosticDetails.promptStrategy}</dd></div>
                    <div><dt>Target</dt><dd>{diagnosticDetails.target}</dd></div>
                    <div><dt>Concept usato</dt><dd>{diagnosticDetails.concept?.conceptName ?? 'nessuno'}</dd></div></> : null}
                {diagnosticDetails?.seed !== undefined ? <div><dt>Seed</dt><dd>{diagnosticDetails.seed}</dd></div> : null}
                <div><dt>Tempo</dt><dd>{status.generation?.latencyMs === undefined ? '—' : `${status.generation.latencyMs} ms`}</dd></div>
            </dl>
            {status.prompt ? <details><summary>Prompt usato</summary><pre>{status.prompt.text}</pre></details> : null}
            {result.warnings.length ? <p className="seedream-diagnostic-panel__hint">{result.warnings.join(' · ')}</p> : null}
        </section> : null}
    </section>
}
