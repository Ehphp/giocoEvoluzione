import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { VISUAL_TRAITS, type VisualTraitId } from '../../../shared/creature-transformations/visual-traits.ts'
import { EVOLUTION_TARGETS, type EvolutionTargetId } from '../../../shared/creature-transformations/evolution-targets.ts'
import type { PlayerCreatureRecord } from '../../lib/profile-api'
import { CreatureTransformationApiError, adoptCreatureTransformation, createVisualTransformationIdempotencyKey, generateUnlockedCreatureTransformation, getCreatureTransformationRequestStatus, getCreatureVisualProgress, getCurrentCreatureVisual, submitBackgroundRemovalCandidate } from '../../lib/creature-transformations-api'
import { removeCreatureBackground } from '../../lib/remove-creature-background'
import { createCreatureDisplayAsset } from '../../lib/creature-display-asset'

import { GAME_SELECTION_ASSETS } from '../game-v2/gameSelectionAssets'
import { ASSETS } from '../../ui/assets'
import { fetchEvolutionTargetProgress, openEvolutionTrackFromReadyTarget, type EvolutionTargetProgressRecord } from '../../lib/evolution-progress-api'
import { isEvolutionTargetReady } from '../../../shared/creature-transformations/evolution-draft.ts'
import { AppShell, Button, Chip, IconButton, Notice, Panel, ProgressBar, SectionLabel } from '../../ui/components'
import { ChevronIcon, DnaIcon, EvolutionTargetIcon, SparkIcon } from '../../ui/icons'

import './CreatureVisualProgressionScreen.css'

type Track = { id: string; status: 'ACTIVE' | 'READY' | 'GENERATING' | 'POST_PROCESSING' | 'GENERATED' | 'COMPLETED' | 'CANCELLED'; visualTraitId: VisualTraitId | null; evolutionTargetId: EvolutionTargetId | null; progress: number; target: number; generatedRequestId: string | null }
type ProgressResponse = { track: Track | null; lastExperiment: ExperimentOnlyResult | null; lastFailure: { requestId: string; code: string; message: string } | null; currentVersion: { id: string; versionNumber: number; visualTraitId: VisualTraitId | null; evolutionTargetId?: EvolutionTargetId | null; conceptName: string | null }; history: Array<{ versionNumber: number; visualTraitId: VisualTraitId | null; evolutionTargetId?: EvolutionTargetId | null; conceptName: string | null }> }
type Preview = { requestId: string; sourceUrl: string | null; resultUrl: string | null; sourceVersionId: string; conceptName: string; evolutionaryFunction: string; warnings: string[] }
type ExperimentOnlyResult = { requestId: string; warnings: string[] }
type Props = { creature: PlayerCreatureRecord; onBack: () => void; onVisualChanged: () => Promise<void> | void }

function traitLabel(id: VisualTraitId) { return VISUAL_TRAITS.find((trait) => trait.id === id)?.displayName ?? id }
function targetLabel(id: EvolutionTargetId) { return EVOLUTION_TARGETS.find((target) => target.id === id)?.label ?? id }
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
    const [lastFailure, setLastFailure] = useState<ProgressResponse['lastFailure']>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [postProcessingMessage, setPostProcessingMessage] = useState<string | null>(null)
    /** Which of the two forms the hero shows; the proposal is what the player is deciding on. */
    const [heroSide, setHeroSide] = useState<'current' | 'result'>('result')
    /** Wins banked per anatomical target, accumulated by the battle-start draft. */
    const [targetProgress, setTargetProgress] = useState<EvolutionTargetProgressRecord[] | null>(null)
    const postProcessingRequest = useRef<string | null>(null)
    const postProcessingAttempts = useRef(0)

    const refresh = useCallback(async () => {
        const result = await getCreatureVisualProgress({ operation: 'GET_VISUAL_PROGRESS', creatureId: creature.id }) as unknown as ProgressResponse
        setProgress(result); setExperimentOnly(result.lastExperiment); setLastFailure(result.lastFailure)
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
        setPreview({ requestId, sourceUrl: source.visual.signedUrl, resultUrl: status.result.signedUrl, sourceVersionId: status.productPreview.sourceVisualVersionId, conceptName: status.productPreview.conceptName, evolutionaryFunction: status.productPreview.evolutionaryFunction, warnings: status.productPreview.warnings })
    }, [creature.id])

    const refreshTargetProgress = useCallback(async () => {
        setTargetProgress(await fetchEvolutionTargetProgress(creature.id))
    }, [creature.id])

    useEffect(() => { void refresh().catch((nextError) => setError(nextError instanceof Error ? nextError.message : 'Percorso visuale non disponibile.')) }, [refresh])
    useEffect(() => { void refreshTargetProgress().catch(() => setTargetProgress([])) }, [refreshTargetProgress])

    async function spendReadyTarget(evolutionTargetId: EvolutionTargetId) {
        setBusy(true); setError(null)
        try {
            await openEvolutionTrackFromReadyTarget(creature.id, evolutionTargetId)
            await Promise.all([refresh(), refreshTargetProgress()])
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Non e stato possibile aprire la trasformazione.')
        } finally { setBusy(false) }
    }
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
            setPostProcessingMessage('Caricamento del modello di scontorno ad alta qualita: il primo avvio puo richiedere piu tempo...')
            const transparentPng = await removeCreatureBackground(await response.blob())
            const bytes = new Uint8Array(await transparentPng.arrayBuffer())
            const displayAsset = await createCreatureDisplayAsset(transparentPng)
            const displayBytes = new Uint8Array(await displayAsset.blob.arrayBuffer())
            const base64 = pngBytesToBase64(bytes)
            setPostProcessingMessage('Validazione del PNG trasparente...')
            await submitBackgroundRemovalCandidate({ operation: 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE', transformationRequestId, candidatePngBase64: base64, displayAssetWebpBase64: pngBytesToBase64(displayBytes) })
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

    const currentTarget = useMemo(() => progress?.track?.evolutionTargetId ? targetLabel(progress.track.evolutionTargetId) : progress?.track?.visualTraitId ? traitLabel(progress.track.visualTraitId) : null, [progress?.track])
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
            if (nextError instanceof CreatureTransformationApiError && ['REQUEST_PREVIOUSLY_FAILED', 'IDEMPOTENT_REQUEST_ALREADY_COMPLETED'].includes(nextError.code)) {
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

    const track = progress?.track ?? null
    const status = track?.status ?? null

    return (
        <AppShell
            sceneryUrl={ASSETS.scenery.forest}
            sceneryFallbackUrl={GAME_SELECTION_ASSETS.backgroundFallback}
            scroll
        >
            <section className="evolution-screen" aria-labelledby="visual-progression-title">
                <header className="evolution-topbar">
                    <IconButton label="Torna indietro" onClick={onBack}>
                        <ChevronIcon style={{ transform: 'rotate(180deg)' }} />
                    </IconButton>
                    <div className="evolution-topbar__title">
                        <span className="ev-eyebrow ev-eyebrow--light">Progressione visuale</span>
                        <h1 id="visual-progression-title">Evoluzione della creatura</h1>
                    </div>
                    <span className="evolution-topbar__spacer" aria-hidden="true" />
                </header>

                {error ? <Notice tone="error">{error}</Notice> : null}

                {!progress ? (
                    <Panel className="evolution-card evolution-card--centered" role="status" aria-live="polite">
                        <span className="evolution-spinner" aria-hidden="true" />
                        <p className="evolution-card__copy">Caricamento del percorso evolutivo...</p>
                    </Panel>
                ) : null}

                {progress && !track ? (
                    <>
                        <Panel className="evolution-card">
                            <span className="ev-eyebrow">Vittorie accumulate</span>
                            <h2>Percorsi evolutivi</h2>
                            <p className="evolution-card__copy">
                                A inizio partita scegli fra due tratti: vincendo, quel tratto avanza. Quando un
                                percorso e completo puoi trasformarlo.
                            </p>
                        </Panel>

                        {targetProgress === null ? (
                            <Panel className="evolution-card evolution-card--centered" role="status" aria-live="polite">
                                <span className="evolution-spinner" aria-hidden="true" />
                                <p className="evolution-card__copy">Caricamento dei contatori...</p>
                            </Panel>
                        ) : (
                            <ul className="evolution-counters">
                                {targetProgress.map((entry) => {
                                    const ready = isEvolutionTargetReady(entry)

                                    return (
                                        <li key={entry.evolutionTargetId}>
                                            <Panel className={`evolution-counter ${ready ? 'is-ready' : ''}`}>
                                                <span className="evolution-counter__glyph" aria-hidden="true"><EvolutionTargetIcon target={entry.evolutionTargetId} /></span>
                                                <div className="evolution-counter__copy">
                                                    <strong>{targetLabel(entry.evolutionTargetId)}</strong>
                                                    <ProgressBar
                                                        current={Math.min(entry.wins, entry.target)}
                                                        total={entry.target}
                                                        tone={ready ? 'gold' : 'green'}
                                                        label={`${entry.wins} vittorie su ${entry.target} per ${targetLabel(entry.evolutionTargetId)}`}
                                                    />
                                                    <small>{entry.wins} / {entry.target} vittorie</small>
                                                </div>
                                                {ready ? (
                                                    <Button tone="evolve" size="sm" disabled={busy} onClick={() => void spendReadyTarget(entry.evolutionTargetId)}>
                                                        Evolvi
                                                    </Button>
                                                ) : null}
                                            </Panel>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </>
                ) : null}

                {status === 'ACTIVE' && track ? (
                    <Panel className="evolution-card">
                        <span className="ev-eyebrow">Regione in sviluppo</span>
                        <h2>{currentTarget}</h2>
                        <div className="evolution-track">
                            <ProgressBar
                                current={track.progress}
                                total={track.target}
                                tone="gold"
                                label={`${track.progress} vittorie su ${track.target}`}
                            />
                            <small>{track.progress} / {track.target} vittorie</small>
                        </div>
                    </Panel>
                ) : null}

                {status === 'READY' && track ? (
                    <Panel className="evolution-card">
                        <Chip tone="good" icon={<SparkIcon />}>Trasformazione sbloccata</Chip>
                        <h2>{currentTarget} e pronta</h2>
                        <p className="evolution-card__copy">Puoi generare l evoluzione della forma attuale.</p>
                        {lastFailure ? (
                            <Notice tone="warning">
                                Ultimo tentativo non riuscito: {lastFailure.message} (codice {lastFailure.code})
                            </Notice>
                        ) : null}
                        <Button tone="evolve" block disabled={busy} onClick={() => void generate()}>
                            <DnaIcon aria-hidden="true" />
                            {busy ? 'Avvio...' : 'Inizia evoluzione'}
                        </Button>
                        <small className="evolution-card__note">Il PNG viene validato dal server dopo la rimozione dello sfondo nel browser.</small>
                    </Panel>
                ) : null}

                {status === 'READY' && experimentOnly ? (
                    <Notice tone="warning">
                        Immagine non adottabile: il PNG non ha superato la validazione di trasparenza nativa.
                        {experimentOnly.warnings.length ? ` Diagnostica: ${experimentOnly.warnings.join(', ')}` : ''}
                    </Notice>
                ) : null}

                {status === 'GENERATING' ? (
                    <Panel className="evolution-card evolution-card--centered" aria-live="polite">
                        <span className="evolution-spinner" aria-hidden="true" />
                        <h2>Generazione in corso</h2>
                        <p className="evolution-card__copy">Stiamo preparando il concept e l immagine della tua evoluzione.</p>
                    </Panel>
                ) : null}

                {status === 'POST_PROCESSING' && track ? (
                    <Panel className="evolution-card evolution-card--centered" aria-live="polite">
                        <span className="evolution-spinner" aria-hidden="true" />
                        <h2>Rimozione sfondo</h2>
                        <p className="evolution-card__copy">{postProcessingMessage ?? 'L elaborazione viene eseguita localmente nel browser.'}</p>
                        {!busy && track.generatedRequestId ? (
                            <Button tone="cream" block onClick={() => void runBackgroundRemoval(track.generatedRequestId!)}>
                                Riprova rimozione sfondo
                            </Button>
                        ) : null}
                    </Panel>
                ) : null}

                {status === 'GENERATED' && preview && progress ? (
                    <>
                        <SectionLabel>La tua creatura puo evolversi</SectionLabel>
                        <Panel className="evolution-preview">
                            {/* Tapping either thumbnail swaps which form the hero shows. */}
                            <figure className="evolution-hero" data-side={heroSide}>
                                {(heroSide === 'result' ? preview.resultUrl : preview.sourceUrl) ? (
                                    <img
                                        src={(heroSide === 'result' ? preview.resultUrl : preview.sourceUrl) ?? undefined}
                                        alt={heroSide === 'result' ? 'Nuova evoluzione proposta' : 'Creatura attuale'}
                                    />
                                ) : null}
                                <figcaption className="evolution-hero__badge">
                                    v{heroSide === 'result' ? progress.currentVersion.versionNumber + 1 : progress.currentVersion.versionNumber}
                                </figcaption>
                            </figure>

                            <div className="evolution-compare" role="group" aria-label="Scegli la forma da vedere in grande">
                                <button
                                    type="button"
                                    className="evolution-compare__side"
                                    aria-pressed={heroSide === 'current'}
                                    onClick={() => setHeroSide('current')}
                                >
                                    <span>{preview.sourceUrl ? <img src={preview.sourceUrl} alt="" /> : null}</span>
                                    <small>Attuale · v{progress.currentVersion.versionNumber}</small>
                                </button>
                                <span className="evolution-compare__arrow" aria-hidden="true"><ChevronIcon /></span>
                                <button
                                    type="button"
                                    className="evolution-compare__side evolution-compare__side--result"
                                    aria-pressed={heroSide === 'result'}
                                    onClick={() => setHeroSide('result')}
                                >
                                    <span>{preview.resultUrl ? <img src={preview.resultUrl} alt="" /> : null}</span>
                                    <small>Proposta · v{progress.currentVersion.versionNumber + 1}</small>
                                </button>
                            </div>

                            <div className="evolution-preview__copy">
                                <h2>{preview.conceptName}</h2>
                                <p className="evolution-card__copy">{preview.evolutionaryFunction}</p>
                                {preview.warnings.length ? (
                                    <Notice tone="warning">Verifica: {preview.warnings.map(validationLabel).join(' ')}</Notice>
                                ) : null}
                            </div>
                            <div className="evolution-preview__actions">
                                <Button tone="evolve" block disabled={busy} onClick={() => void adopt()}>Adotta evoluzione</Button>
                                <Button tone="cream" block disabled={busy} onClick={onBack}>Mantieni creatura attuale</Button>
                            </div>
                        </Panel>
                    </>
                ) : null}

                {status === 'GENERATED' && !preview ? (
                    <Panel className="evolution-card">
                        <h2>Anteprima in verifica</h2>
                        <Button tone="cream" block disabled={busy} onClick={() => void refresh()}>Ricarica proposta</Button>
                    </Panel>
                ) : null}

                {status === 'COMPLETED' && progress ? (
                    <Panel className="evolution-card">
                        <Chip tone="good" icon={<SparkIcon />}>Nuova versione attiva</Chip>
                        <h2>Evoluzione adottata</h2>
                        <p className="evolution-card__copy">La tua creatura usa ora la versione {progress.currentVersion.versionNumber}.</p>
                        <Button tone="use" block disabled={busy} onClick={() => setProgress({ ...progress, track: null })}>Inizia un nuovo percorso</Button>
                    </Panel>
                ) : null}

                {progress && track && !['ACTIVE', 'READY', 'GENERATING', 'POST_PROCESSING', 'GENERATED', 'COMPLETED'].includes(track.status) ? (
                    <Panel className="evolution-card">
                        <h2>Percorso visivo da riavviare</h2>
                        <Button tone="cream" block disabled={busy} onClick={() => setProgress({ ...progress, track: null })}>Scegli un nuovo tratto</Button>
                    </Panel>
                ) : null}

                {progress?.history.length ? (
                    <>
                        <SectionLabel>Storico evoluzioni</SectionLabel>
                        <ol className="evolution-history">
                            {progress.history.map((entry) => (
                                <li key={entry.versionNumber}>
                                    <Panel className="evolution-history__row" flat>
                                        <span className="evolution-history__version">v{entry.versionNumber}</span>
                                        <span className="evolution-history__copy">
                                            <strong>{entry.evolutionTargetId ? targetLabel(entry.evolutionTargetId) : entry.visualTraitId ? traitLabel(entry.visualTraitId) : 'Evoluzione precedente'}</strong>
                                            <small>{entry.conceptName}</small>
                                        </span>
                                    </Panel>
                                </li>
                            ))}
                        </ol>
                    </>
                ) : null}
            </section>
        </AppShell>
    )
}
