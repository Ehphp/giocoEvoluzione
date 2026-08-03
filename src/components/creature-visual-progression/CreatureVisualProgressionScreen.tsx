import { useCallback, useEffect, useMemo, useState } from 'react'

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
} from '../../lib/creature-transformations-api'

import './CreatureVisualProgressionScreen.css'

type Track = {
    id: string
    status: 'ACTIVE' | 'READY' | 'GENERATING' | 'GENERATED' | 'COMPLETED' | 'CANCELLED'
    visualTraitId: VisualTraitId
    progress: number
    target: number
    generatedRequestId: string | null
}

type ProgressResponse = {
    track: Track | null
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

export function CreatureVisualProgressionScreen({ creature, onBack, onVisualChanged }: Props) {
    const [progress, setProgress] = useState<ProgressResponse | null>(null)
    const [preview, setPreview] = useState<Preview | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const refresh = useCallback(async () => {
        const result = asProgressResponse(await getCreatureVisualProgress({ operation: 'GET_VISUAL_PROGRESS', creatureId: creature.id }))
        setProgress(result)
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
                    return refresh()
                })
                .catch((nextError) => active && setError(nextError instanceof Error ? nextError.message : 'Impossibile aggiornare la generazione.'))
        }, 2_000)
        return () => { active = false; window.clearInterval(interval) }
    }, [progress?.track?.generatedRequestId, progress?.track?.status, refresh])

    const currentTrait = useMemo(() => progress?.track ? traitLabel(progress.track.visualTraitId) : null, [progress?.track])

    async function selectTrait(visualTraitId: VisualTraitId) {
        setBusy(true); setError(null)
        try { setProgress(asProgressResponse(await selectCreatureVisualProgressTrack({ operation: 'SELECT_VISUAL_PROGRESS_TRACK', creatureId: creature.id, visualTraitId }))) }
        catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'Non e stato possibile avviare il percorso.') }
        finally { setBusy(false) }
    }

    async function generate() {
        if (!progress?.track) return
        setBusy(true); setError(null)
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
            {progress?.track?.status === 'GENERATING' ? <section className="visual-progression-screen__card"><h2>Generazione in corso</h2><p>Stiamo preparando il concept e l’immagine della tua evoluzione.</p><progress /></section> : null}
            {progress?.track?.status === 'GENERATED' && preview ? <section className="visual-progression-screen__preview"><h2>La tua creatura può evolversi</h2><div className="visual-progression-screen__images"><figure>{preview.sourceUrl ? <img src={preview.sourceUrl} alt="Creatura attuale" /> : null}<figcaption>Versione {progress.currentVersion.versionNumber}</figcaption></figure><figure>{preview.resultUrl ? <img src={preview.resultUrl} alt="Nuova evoluzione proposta" /> : null}<figcaption>Versione {progress.currentVersion.versionNumber + 1}</figcaption></figure></div><h3>{preview.conceptName}</h3><p>{preview.evolutionaryFunction}</p><p>Tratto: <strong>{traitLabel(preview.visualTraitId)}</strong></p>{preview.warnings.length ? <p>Note: {preview.warnings.join(', ')}</p> : null}<div><button type="button" disabled={busy} onClick={() => void adopt()}>Adotta evoluzione</button><button type="button" disabled={busy} onClick={onBack}>Mantieni creatura attuale</button></div><small>Se mantieni la forma attuale, l’anteprima resta disponibile e non viene cancellata automaticamente.</small></section> : null}
            {progress?.track?.status === 'COMPLETED' ? <section className="visual-progression-screen__card"><h2>Nuova versione attiva</h2><p>La tua creatura usa ora la versione {progress.currentVersion.versionNumber}.</p><button type="button" disabled={busy} onClick={() => setProgress({ ...progress, track: null })}>Inizia un nuovo percorso</button></section> : null}
            {progress?.history.length ? <section className="visual-progression-screen__history"><h2>Storico evoluzioni</h2><ol>{progress.history.map((entry) => <li key={entry.versionNumber}>v{entry.versionNumber} · {traitLabel(entry.visualTraitId)} · {entry.conceptName}</li>)}</ol></section> : null}
        </section>
    )
}
