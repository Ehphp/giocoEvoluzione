import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { VISUAL_TRAITS, type VisualTraitId } from '../../../shared/creature-transformations/visual-traits.ts'
import type { PlayerCreatureRecord } from '../../lib/profile-api'
import {
    adoptCreatureTransformation,
    createVisualTransformationIdempotencyKey,
    generateUnlockedCreatureTransformation,
    getCreatureTransformationRequestStatus,
    getCreatureVisualProgress,
    getCurrentCreatureVisual,
    selectCreatureVisualProgressTrack,
    submitBackgroundRemovalCandidate,
} from '../../lib/creature-transformations-api'

import './CreatureVisualProgressionScreen.css'

type Track = {
    id: string
    status: 'ACTIVE' | 'READY' | 'GENERATING' | 'POST_PROCESSING' | 'GENERATED' | 'COMPLETED' | 'CANCELLED'
    visualTraitId: VisualTraitId
    progress: number
    target: number
    generatedRequestId: string | null
}

type ProgressResponse = {
    track: Track | null
    lastExperiment: ExperimentOnlyResult | null
    currentVersion: { id: string; versionNumber: number; visualTraitId: VisualTraitId | null; conceptName: string | null }
    history: Array<{ versionNumber: number; visualTraitId: VisualTraitId; conceptName: string }>
}

type Preview = {
    requestId: string
    sourceUrl: string | null
    resultUrl: string | null
    sourceVersionId: string
    conceptName: string
    evolutionaryFunction: string
    visualTraitId: VisualTraitId
    warnings: string[]
}

type ExperimentOnlyResult = {
    requestId: string
    warnings: string[]
}

type Props = {
    creature: PlayerCreatureRecord
    onBack: () => void
    onVisualChanged: () => Promise<void> | void
}

function traitLabel(id: VisualTraitId) {
    return VISUAL_TRAITS.find((trait) => trait.id === id)?.displayName ?? id
}

function asProgressResponse(value: unknown): ProgressResponse {
    return value as ProgressResponse
}

async function blobToBase64(blob: Blob): Promise<string> {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
    return btoa(binary)
}

export function CreatureVisualProgressionScreen({ creature, onBack, onVisualChanged }: Props) {
    const [progress, setProgress] = useState<ProgressResponse | null>(null)
    const [preview, setPreview] = useState<Preview | null>(null)
    const [experimentOnly, setExperimentOnly] = useState<ExperimentOnlyResult | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [postProcessingMessage, setPostProcessingMessage] = useState<string | null>(null)
    const postProcessingRequest = useRef<string | null>(null)

    const refresh = useCallback(async () => {
        const result = asProgressResponse(await getCreatureVisualProgress({ operation: 'GET_VISUAL_PROGRESS', creatureId: creature.id }))
        setProgress(result)
        setExperimentOnly(result.lastExperiment)
        const requestId = result.track?.generatedRequestId
        if (result.track?.status === 'GENERATED' && requestId) {
            const [status, source] = await Promise.all([
                getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId: requestId }),
                getCurrentCreatureVisual({ operation: 'GET_CURRENT_VISUAL', creatureId: creature.id }),
            ])
            if (status.result && status.productPreview) {
                setPreview({
                    requestId,
                    sourceUrl: source.visual.signedUrl,
                    resultUrl: status.result.signedUrl,
                    sourceVersionId: status.productPreview.sourceVisualVersionId,
                    conceptName: status.productPreview.conceptName,
                    evolutionaryFunction: status.productPreview.evolutionaryFunction,
                    visualTraitId: status.productPreview.visualTraitId as VisualTraitId,
                    warnings: status.productPreview.warnings,
                })
            }
        } else {
            setPreview(null)
        }
    }, [creature.id])

    useEffect(() => {
        void refresh().catch((nextError) => setError(nextError instanceof Error ? nextError.message : 'Percorso visuale non disponibile.'))
    }, [refresh])

    useEffect(() => {
        if (progress?.track?.status !== 'GENERATING' || !progress.track.generatedRequestId) return
        let active = true
        const interval = window.setInterval(() => {
            void getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId: progress.track!.generatedRequestId! })
                .then((status) => {
                    if (status.error) setError(status.error.message)
                    if (status.result?.assetReadiness === 'EXPERIMENT_ONLY') {
                        setExperimentOnly({ requestId: progress.track!.generatedRequestId!, warnings: status.result.warnings })
                    }
                    return refresh()
                })
                .catch((nextError) => active && setError(nextError instanceof Error ? nextError.message : 'Impossibile aggiornare la generazione.'))
        }, 2_000)
        return () => { active = false; window.clearInterval(interval) }
    }, [progress?.track?.generatedRequestId, progress?.track?.status, refresh])

    const runBackgroundRemoval = useCallback(async (transformationRequestId: string) => {
        if (postProcessingRequest.current === transformationRequestId) return
        postProcessingRequest.current = transformationRequestId
        setBusy(true); setError(null); setPostProcessingMessage('Preparazione del PNG raw privato…')
        try {
            const status = await getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId })
            if (!status.rawResult) throw new Error('Il PNG raw temporaneo non e più disponibile. Riprova la generazione.')
            const source = await fetch(status.rawResult.signedUrl)
            if (!source.ok) throw new Error('Non è stato possibile scaricare il PNG raw temporaneo.')
            setPostProcessingMessage('Caricamento del modello sperimentale nel browser: il primo avvio può richiedere tempo…')
            const { removeBackground } = await import('@imgly/background-removal')
            const transparentPng = await removeBackground(await source.blob(), {
                device: 'cpu', model: 'isnet_quint8', output: { format: 'image/png' },
                progress: (key: string, current: number, total: number) => setPostProcessingMessage(total > 0 ? `Post-processing sperimentale: ${key} ${Math.round((current / total) * 100)}%` : 'Post-processing sperimentale in corso…'),
            })
            if (transparentPng.size > 10 * 1024 * 1024) throw new Error('Il PNG elaborato supera il limite tecnico di 10 MB.')
            setPostProcessingMessage('Invio del candidato per la validazione server-side…')
            await submitBackgroundRemovalCandidate({ operation: 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE', transformationRequestId, candidatePngBase64: await blobToBase64(transparentPng) })
            setPostProcessingMessage(null)
            await refresh()
        } catch (nextError) {
            setPostProcessingMessage(null)
            setError(nextError instanceof Error ? nextError.message : 'Il post-processing sperimentale non è riuscito.')
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

    async function selectTrait(visualTraitId: VisualTraitId) {
        setBusy(true); setError(null)
        try { setProgress(asProgressResponse(await selectCreatureVisualProgressTrack({ operation: 'SELECT_VISUAL_PROGRESS_TRACK', creatureId: creature.id, visualTraitId }))) }
        catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'Non e stato possibile avviare il percorso.') }
        finally { setBusy(false) }
    }

    async function generate() {
        if (!progress?.track) return
        setBusy(true); setError(null); setExperimentOnly(null)
        try {
            await generateUnlockedCreatureTransformation({ operation: 'GENERATE_UNLOCKED_TRANSFORMATION', creatureId: creature.id, progressTrackId: progress.track.id, idempotencyKey: createVisualTransformationIdempotencyKey() })
            await refresh()
        } catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'La generazione non e stata avviata.') }
        finally { setBusy(false) }
    }

    async function adopt() {
        if (!progress?.track || !preview) return
        setBusy(true); setError(null)
        try {
            await adoptCreatureTransformation({
                operation: 'ADOPT_CREATURE_TRANSFORMATION', creatureId: creature.id, progressTrackId: progress.track.id,
                transformationRequestId: preview.requestId, expectedCurrentVisualVersionId: preview.sourceVersionId,
            })
            await onVisualChanged()
            await refresh()
        } catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'L adozione non e riuscita.') }
        finally { setBusy(false) }
    }

    return (
        <section className="visual-progression-screen" aria-labelledby="visual-progression-title">
            <header><button type="button" onClick={onBack}>← Home</button><div><span className="eyebrow">Progressione visuale</span><h1 id="visual-progression-title">Evoluzione della creatura</h1></div></header>
            {error ? <p className="visual-progression-screen__error" role="alert">{error}</p> : null}
            {!progress ? <p>Caricamento percorso…</p> : null}
            {progress && !progress.track ? <section className="visual-progression-screen__traits"><h2>Scegli un tratto visivo</h2><p>Il progresso si ottiene solo con le vittorie, indipendentemente dalle scelte effettuate in partita.</p><div>{VISUAL_TRAITS.map((trait) => <button key={trait.id} type="button" disabled={busy} onClick={() => void selectTrait(trait.id)}><strong>{trait.displayName}</strong><span>{trait.description}</span></button>)}</div></section> : null}
            {progress?.track?.status === 'ACTIVE' ? <section className="visual-progression-screen__card"><h2>{currentTrait}</h2><p>Vittorie ottenute: <strong>{progress.track.progress} / {progress.track.target}</strong></p><progress value={progress.track.progress} max={progress.track.target} /><p>Ogni vittoria assegna un punto. Pareggi e sconfitte non modificano il percorso.</p></section> : null}
            {progress?.track?.status === 'READY' ? <section className="visual-progression-screen__card"><h2>Trasformazione sbloccata</h2><p>{currentTrait} è pronta: puoi generare l’evoluzione della forma attuale.</p><button type="button" disabled={busy} onClick={() => void generate()}>{busy ? 'Avvio…' : 'Inizia evoluzione'}</button><small>La generazione può richiedere qualche istante.</small></section> : null}
            {progress?.track?.status === 'READY' && experimentOnly ? <aside className="visual-progression-screen__experiment" role="status"><strong>Immagine generata solo come esperimento.</strong><span>Non è stata adottata: il PNG non soddisfa il requisito di trasparenza richiesto per una versione ufficiale.</span>{experimentOnly.warnings.length ? <small>Diagnostica: {experimentOnly.warnings.join(', ')}</small> : null}</aside> : null}
            {progress?.track?.status === 'GENERATING' ? <section className="visual-progression-screen__card"><h2>Generazione in corso</h2><p>Stiamo preparando il concept e l’immagine della tua evoluzione.</p><progress /></section> : null}
            {progress?.track?.status === 'POST_PROCESSING' ? <section className="visual-progression-screen__post-processing"><h2>Rimozione sfondo sperimentale</h2><p>{postProcessingMessage ?? 'L elaborazione viene eseguita localmente nel tuo browser.'}</p><progress /><p>Può essere lenta o non riuscire sui dispositivi meno potenti. Il risultato non è adottabile finché il server non convalida PNG, alpha, hash e copertura del soggetto.</p>{!busy && progress.track.generatedRequestId ? <button type="button" onClick={() => void runBackgroundRemoval(progress.track!.generatedRequestId!)}>Riprova post-processing</button> : null}</section> : null}
            {progress?.track?.status === 'GENERATED' && preview ? <section className="visual-progression-screen__preview"><h2>La tua creatura può evolversi</h2><div className="visual-progression-screen__images"><figure>{preview.sourceUrl ? <img src={preview.sourceUrl} alt="Creatura attuale" /> : null}<figcaption>Versione {progress.currentVersion.versionNumber}</figcaption></figure><figure>{preview.resultUrl ? <img src={preview.resultUrl} alt="Nuova evoluzione proposta" /> : null}<figcaption>Versione {progress.currentVersion.versionNumber + 1}</figcaption></figure></div><h3>{preview.conceptName}</h3><p>{preview.evolutionaryFunction}</p><p>Tratto: <strong>{traitLabel(preview.visualTraitId)}</strong></p>{preview.warnings.length ? <p>Note: {preview.warnings.join(', ')}</p> : null}<div><button type="button" disabled={busy} onClick={() => void adopt()}>Adotta evoluzione</button><button type="button" disabled={busy} onClick={onBack}>Mantieni creatura attuale</button></div><small>Se mantieni la forma attuale, l’anteprima resta disponibile e non viene cancellata automaticamente.</small></section> : null}
            {progress?.track?.status === 'COMPLETED' ? <section className="visual-progression-screen__card"><h2>Nuova versione attiva</h2><p>La tua creatura usa ora la versione {progress.currentVersion.versionNumber}.</p><button type="button" disabled={busy} onClick={() => setProgress({ ...progress, track: null })}>Inizia un nuovo percorso</button></section> : null}
            {progress?.history.length ? <section className="visual-progression-screen__history"><h2>Storico evoluzioni</h2><ol>{progress.history.map((entry) => <li key={entry.versionNumber}>v{entry.versionNumber} · {traitLabel(entry.visualTraitId)} · {entry.conceptName}</li>)}</ol></section> : null}
        </section>
    )
}
