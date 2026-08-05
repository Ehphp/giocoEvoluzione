import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { VISUAL_TRAITS, type VisualTraitId } from '../../../shared/creature-transformations/visual-traits.ts'
import type { PlayerCreatureRecord } from '../../lib/profile-api'
import { CreatureTransformationApiError, adoptCreatureTransformation, createVisualTransformationIdempotencyKey, generateUnlockedCreatureTransformation, getCreatureTransformationRequestStatus, getCreatureVisualProgress, getCurrentCreatureVisual, selectCreatureVisualProgressTrack, submitBackgroundRemovalCandidate } from '../../lib/creature-transformations-api'
import { removeCreatureBackground } from '../../lib/remove-creature-background'

import './CreatureVisualProgressionScreen.css'

type Track = { id: string; status: 'ACTIVE' | 'READY' | 'GENERATING' | 'POST_PROCESSING' | 'GENERATED' | 'COMPLETED' | 'CANCELLED'; visualTraitId: VisualTraitId; progress: number; target: number; generatedRequestId: string | null }
type ProgressResponse = { track: Track | null; lastExperiment: ExperimentOnlyResult | null; lastFailure: { requestId: string; code: string; message: string } | null; currentVersion: { id: string; versionNumber: number; visualTraitId: VisualTraitId | null; conceptName: string | null }; history: Array<{ versionNumber: number; visualTraitId: VisualTraitId; conceptName: string }> }
type Preview = { requestId: string; sourceUrl: string | null; resultUrl: string | null; sourceVersionId: string; conceptName: string; evolutionaryFunction: string; visualTraitId: VisualTraitId; warnings: string[] }
type ExperimentOnlyResult = { requestId: string; warnings: string[] }
type Props = { creature: PlayerCreatureRecord; onBack: () => void; onVisualChanged: () => Promise<void> | void }

function traitLabel(id: VisualTraitId) { return VISUAL_TRAITS.find((trait) => trait.id === id)?.displayName ?? id }
function pngBytesToBase64(bytes: Uint8Array): string {
    const chunkSize = 0x8000
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
    }
    return btoa(binary)
}
function validationLabel(code: string) {
    if (code === 'PNG_ALPHA_REQUIRED' || code === 'RAW_RESULT_ALPHA_MISSING') return 'Il PNG non dichiara trasparenza nativa.'
    if (code === 'PNG_ALPHA_COVERAGE_INVALID' || code === 'BACKGROUND_REMOVAL_PENDING_CLIENT') return 'La trasparenza nativa non e stata verificata.'
    if (code === 'LEGACY_ASSET_REVIEW_REQUIRED') return 'Risultato generato con il precedente flusso di immagini.'
    return code
}

export function CreatureVisualProgressionScreen({ creature, onBack, onVisualChanged }: Props) {
    const [progress, setProgress] = useState<ProgressResponse | null>(null)
    const [preview, setPreview] = useState<Preview | null>(null)
    const [experimentOnly, setExperimentOnly] = useState<ExperimentOnlyResult | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [postProcessingMessage, setPostProcessingMessage] = useState<string | null>(null)
    const postProcessingRequest = useRef<string | null>(null)
    const postProcessingAttempts = useRef(0)

    const refresh = useCallback(async () => {
        const result = await getCreatureVisualProgress({ operation: 'GET_VISUAL_PROGRESS', creatureId: creature.id }) as unknown as ProgressResponse
        setProgress(result); setExperimentOnly(result.lastExperiment)
        if (result.track?.status === 'READY' && result.lastFailure) {
            setError(`Generazione non riuscita (${result.lastFailure.code}): ${result.lastFailure.message}`)
        }
        const requestId = result.track?.generatedRequestId
        if (result.track?.status !== 'GENERATED' || !requestId) { setPreview(null); return }
        const [status, source] = await Promise.all([
            getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId: requestId }),
            getCurrentCreatureVisual({ operation: 'GET_CURRENT_VISUAL', creatureId: creature.id }),
        ])
        if (!status.result || !status.productPreview) {
            setPreview(null); setError(status.error?.message ?? 'La proposta generata non e recuperabile.')
            return
        }
        setPreview({ requestId, sourceUrl: source.visual.signedUrl, resultUrl: status.result.signedUrl, sourceVersionId: status.productPreview.sourceVisualVersionId, conceptName: status.productPreview.conceptName, evolutionaryFunction: status.productPreview.evolutionaryFunction, visualTraitId: status.productPreview.visualTraitId as VisualTraitId, warnings: status.productPreview.warnings })
    }, [creature.id])

    useEffect(() => { void refresh().catch((nextError) => setError(nextError instanceof Error ? nextError.message : 'Percorso visuale non disponibile.')) }, [refresh])
    useEffect(() => {
        if (progress?.track?.status !== 'GENERATING' || !progress.track.generatedRequestId) return
        const interval = window.setInterval(() => void refresh().catch((nextError) => setError(nextError instanceof Error ? nextError.message : 'Impossibile aggiornare la generazione.')), 2_000)
        return () => window.clearInterval(interval)
    }, [progress?.track?.generatedRequestId, progress?.track?.status, refresh])

    const runBackgroundRemoval = useCallback(async (transformationRequestId: string) => {
        if (postProcessingRequest.current === transformationRequestId) return
        if (postProcessingAttempts.current >= 3) {
            setError('La rimozione dello sfondo non e riuscita dopo tre tentativi. Riprova piu tardi senza rigenerare la creatura.')
            return
        }
        postProcessingRequest.current = transformationRequestId
        postProcessingAttempts.current += 1
        setBusy(true); setError(null); setPostProcessingMessage('Preparazione dell immagine per la rimozione dello sfondo...')
        try {
            const status = await getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId })
            if (!status.rawResult) throw new Error('Il PNG raw temporaneo non e disponibile.')
            const response = await fetch(status.rawResult.signedUrl)
            if (!response.ok) throw new Error('Non e stato possibile scaricare il PNG raw.')
            setPostProcessingMessage('Rimozione dello sfondo nel browser...')
            const transparentPng = await removeCreatureBackground(await response.blob())
            const bytes = new Uint8Array(await transparentPng.arrayBuffer())
            const base64 = pngBytesToBase64(bytes)
            setPostProcessingMessage('Validazione del PNG trasparente...')
            await submitBackgroundRemovalCandidate({ operation: 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE', transformationRequestId, candidatePngBase64: base64 })
            postProcessingAttempts.current = 0
            setPostProcessingMessage(null)
            await refresh()
        } catch (nextError) {
            setPostProcessingMessage(null)
            setError(nextError instanceof Error ? nextError.message : 'La rimozione dello sfondo non e riuscita.')
        } finally {
            postProcessingRequest.current = null
            setBusy(false)
        }
    }, [refresh])

    useEffect(() => {
        const requestId = progress?.track?.generatedRequestId
        if (progress?.track?.status === 'POST_PROCESSING' && requestId) void runBackgroundRemoval(requestId)
    }, [progress?.track?.generatedRequestId, progress?.track?.status, runBackgroundRemoval])

    const currentTrait = useMemo(() => progress?.track ? traitLabel(progress.track.visualTraitId) : null, [progress?.track])
    async function selectTrait(visualTraitId: VisualTraitId) { setBusy(true); setError(null); try { setProgress(await selectCreatureVisualProgressTrack({ operation: 'SELECT_VISUAL_PROGRESS_TRACK', creatureId: creature.id, visualTraitId }) as unknown as ProgressResponse) } catch (nextError) { if (nextError instanceof CreatureTransformationApiError && nextError.code === 'VISUAL_TRACK_ALREADY_ACTIVE') { try { await refresh() } catch { } setError('Esiste gia un percorso visuale aperto. Il suo stato e stato ricaricato.') } else setError(nextError instanceof Error ? nextError.message : 'Non e stato possibile avviare il percorso.') } finally { setBusy(false) } }
    async function generate() {
        if (!progress?.track) return
        setBusy(true); setError(null); setExperimentOnly(null)
        const start = (idempotencyKey: string) => generateUnlockedCreatureTransformation({
            operation: 'GENERATE_UNLOCKED_TRANSFORMATION', creatureId: creature.id,
            progressTrackId: progress.track!.id, idempotencyKey,
        })
        try {
            await start(createVisualTransformationIdempotencyKey())
            await refresh()
        } catch (nextError) {
            if (nextError instanceof CreatureTransformationApiError && nextError.code === 'REQUEST_PREVIOUSLY_FAILED') {
                try {
                    await start(createVisualTransformationIdempotencyKey())
                    await refresh()
                    return
                } catch (retryError) {
                    setError(retryError instanceof Error ? retryError.message : 'La nuova generazione non e stata avviata.')
                    return
                }
            }
            setError(nextError instanceof Error ? nextError.message : 'La generazione non e stata avviata.')
        } finally { setBusy(false) }
    }
    async function adopt() { if (!progress?.track || !preview) return; setBusy(true); setError(null); try { await adoptCreatureTransformation({ operation: 'ADOPT_CREATURE_TRANSFORMATION', creatureId: creature.id, progressTrackId: progress.track.id, transformationRequestId: preview.requestId, expectedCurrentVisualVersionId: preview.sourceVersionId }); await onVisualChanged(); await refresh() } catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'L adozione non e riuscita.') } finally { setBusy(false) } }

    return <section className="visual-progression-screen" aria-labelledby="visual-progression-title">
        <header><button type="button" onClick={onBack}>← Home</button><div><span className="eyebrow">Progressione visuale</span><h1 id="visual-progression-title">Evoluzione della creatura</h1></div></header>
        {error ? <p className="visual-progression-screen__error" role="alert">{error}</p> : null}
        {!progress ? <p>Caricamento percorso…</p> : null}
        {progress && !progress.track ? <section className="visual-progression-screen__traits"><h2>Scegli un tratto visivo</h2><p>Il progresso si ottiene solo con le vittorie.</p><div>{VISUAL_TRAITS.map((trait) => <button key={trait.id} type="button" disabled={busy} onClick={() => void selectTrait(trait.id)}><strong>{trait.displayName}</strong><span>{trait.description}</span></button>)}</div></section> : null}
        {progress?.track?.status === 'ACTIVE' ? <section className="visual-progression-screen__card"><h2>{currentTrait}</h2><p>Vittorie ottenute: <strong>{progress.track.progress} / {progress.track.target}</strong></p><progress value={progress.track.progress} max={progress.track.target} /></section> : null}
        {progress?.track?.status === 'READY' ? <section className="visual-progression-screen__card"><h2>Trasformazione sbloccata</h2><p>{currentTrait} è pronta: puoi generare l’evoluzione della forma attuale.</p><button type="button" disabled={busy} onClick={() => void generate()}>{busy ? 'Avvio…' : 'Inizia evoluzione'}</button><small>Il PNG viene validato dal server dopo la rimozione dello sfondo nel browser.</small></section> : null}
        {progress?.track?.status === 'READY' && experimentOnly ? <aside className="visual-progression-screen__experiment" role="status"><strong>Immagine non adottabile.</strong><span>Il PNG non ha superato la validazione di trasparenza nativa.</span>{experimentOnly.warnings.length ? <small>Diagnostica: {experimentOnly.warnings.join(', ')}</small> : null}</aside> : null}
        {progress?.track?.status === 'GENERATING' ? <section className="visual-progression-screen__card"><h2>Generazione in corso</h2><p>Stiamo preparando il concept e l immagine della tua evoluzione.</p><progress /></section> : null}
        {progress?.track?.status === 'POST_PROCESSING' ? <section className="visual-progression-screen__card"><h2>Rimozione sfondo</h2><p>{postProcessingMessage ?? 'L elaborazione viene eseguita localmente nel browser.'}</p><progress />{!busy && progress.track.generatedRequestId ? <button type="button" onClick={() => void runBackgroundRemoval(progress.track!.generatedRequestId!)}>Riprova rimozione sfondo</button> : null}</section> : null}
        {progress?.track?.status === 'GENERATED' && preview ? <section className="visual-progression-screen__preview"><h2>La tua creatura può evolversi</h2><div className="visual-progression-screen__images"><figure>{preview.sourceUrl ? <img src={preview.sourceUrl} alt="Creatura attuale" /> : null}<figcaption>Versione {progress.currentVersion.versionNumber}</figcaption></figure><figure>{preview.resultUrl ? <img src={preview.resultUrl} alt="Nuova evoluzione proposta" /> : null}<figcaption>Versione {progress.currentVersion.versionNumber + 1}</figcaption></figure></div><h3>{preview.conceptName}</h3><p>{preview.evolutionaryFunction}</p><p>Tratto: <strong>{traitLabel(preview.visualTraitId)}</strong></p>{preview.warnings.length ? <p>Verifica: {preview.warnings.map(validationLabel).join(' ')}</p> : null}<div><button type="button" disabled={busy} onClick={() => void adopt()}>Adotta evoluzione</button><button type="button" disabled={busy} onClick={onBack}>Mantieni creatura attuale</button></div></section> : null}
        {progress?.track?.status === 'GENERATED' && !preview ? <section className="visual-progression-screen__card"><h2>Anteprima in verifica</h2><button type="button" disabled={busy} onClick={() => void refresh()}>Ricarica proposta</button></section> : null}
        {progress?.track?.status === 'COMPLETED' ? <section className="visual-progression-screen__card"><h2>Nuova versione attiva</h2><p>La tua creatura usa ora la versione {progress.currentVersion.versionNumber}.</p><button type="button" disabled={busy} onClick={() => setProgress({ ...progress, track: null })}>Inizia un nuovo percorso</button></section> : null}
        {progress?.track && !['ACTIVE', 'READY', 'GENERATING', 'POST_PROCESSING', 'GENERATED', 'COMPLETED'].includes(progress.track.status) ? <section className="visual-progression-screen__card"><h2>Percorso visivo da riavviare</h2><button type="button" disabled={busy} onClick={() => setProgress({ ...progress, track: null })}>Scegli un nuovo tratto</button></section> : null}
        {progress?.history.length ? <section className="visual-progression-screen__history"><h2>Storico evoluzioni</h2><ol>{progress.history.map((entry) => <li key={entry.versionNumber}>v{entry.versionNumber} · {traitLabel(entry.visualTraitId)} · {entry.conceptName}</li>)}</ol></section> : null}
    </section>
}
