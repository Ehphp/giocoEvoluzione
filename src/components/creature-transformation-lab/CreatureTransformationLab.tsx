import { useCallback, useEffect, useState } from 'react'

import type { CreatureVisualProgressResponse } from '../../../shared/creature-transformations/index.ts'
import type { PlayerCreatureRecord } from '../../lib/profile-api'
import {
    createVisualTransformationIdempotencyKey,
    generateUnlockedCreatureTransformation,
    getCreatureTransformationLabUsage,
    getCreatureVisualProgress,
} from '../../lib/creature-transformations-api'
import { GeneratedImageCatalog } from './GeneratedImageCatalog'
import { FluxEvolutionChainSimulator } from './FluxEvolutionChainSimulator'
import { SeedreamDiagnosticPanel } from './SeedreamDiagnosticPanel'
import { BackIcon, CollectionIcon } from '../../ui/icons'

import '../technical-screens.css'
import './CreatureTransformationLab.css'

type LabUsage = Awaited<ReturnType<typeof getCreatureTransformationLabUsage>>['usage']

type CreatureTransformationLabProps = {
    creature: PlayerCreatureRecord
    onBack: () => void
}

/**
 * Internal FLUX laboratory. It reaches the production pipeline only through the same operations
 * the game uses — an unlocked transformation on a ready track, or an isolated chain step that
 * never touches a visual track.
 */
export function CreatureTransformationLab({ creature, onBack }: CreatureTransformationLabProps) {
    const [labUsage, setLabUsage] = useState<LabUsage | null>(null)
    const [progress, setProgress] = useState<CreatureVisualProgressResponse | null>(null)
    const [isCatalogOpen, setIsCatalogOpen] = useState(false)
    const [isLaunching, setIsLaunching] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const refreshProgress = useCallback(async () => {
        try {
            setProgress(await getCreatureVisualProgress({ operation: 'GET_VISUAL_PROGRESS', creatureId: creature.id }))
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Percorso visuale non disponibile.')
        }
    }, [creature.id])

    useEffect(() => {
        void getCreatureTransformationLabUsage().then((response) => setLabUsage(response.usage)).catch(() => { /* usage is informational */ })
        void refreshProgress()
    }, [refreshProgress])

    const track = progress?.track ?? null

    async function launchProductionGeneration() {
        if (!track || track.status !== 'READY' || isLaunching) return
        setIsLaunching(true)
        setError(null)
        try {
            await generateUnlockedCreatureTransformation({
                operation: 'GENERATE_UNLOCKED_TRANSFORMATION',
                creatureId: creature.id,
                progressTrackId: track.id,
                idempotencyKey: createVisualTransformationIdempotencyKey(),
            })
            await refreshProgress()
            window.location.hash = '#creature-evolution'
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'La pipeline FLUX non e stata avviata.')
        } finally {
            setIsLaunching(false)
        }
    }

    return (
        <section className="creature-transformation-lab" aria-labelledby="creature-transformation-lab-title">
            <header className="creature-transformation-lab__header">
                <button type="button" onClick={onBack}><BackIcon aria-hidden="true" />Home</button>
                <div>
                    <span className="eyebrow">Development-only</span>
                    <h1 id="creature-transformation-lab-title">Laboratorio FLUX</h1>
                </div>
                <button type="button" className="creature-transformation-lab__open-generated-catalog" onClick={() => setIsCatalogOpen(true)}><CollectionIcon aria-hidden="true" />Archivio</button>
            </header>

            {isCatalogOpen ? <GeneratedImageCatalog onClose={() => setIsCatalogOpen(false)} /> : null}

            {error ? <p className="creature-transformation-lab__error" role="alert">{error}</p> : null}

            {labUsage ? <section className="creature-transformation-lab__usage" aria-label="Utilizzo giornaliero del laboratorio">
                <header><span className="eyebrow">LIMITI GIORNALIERI</span><h2>Utilizzo del laboratorio</h2></header>
                <dl>
                    <div><dt>Richieste laboratorio</dt><dd>{labUsage.requestCount} / {labUsage.requestLimit}</dd><small>{Math.max(0, labUsage.requestLimit - labUsage.requestCount)} disponibili</small></div>
                    <div><dt>Generazioni a pagamento</dt><dd>{labUsage.realImageCount} / {labUsage.realImageLimit}</dd><small>{Math.max(0, labUsage.realImageLimit - labUsage.realImageCount)} disponibili</small></div>
                    <div><dt>Generazioni globali</dt><dd>{labUsage.globalRealImageCount} / {labUsage.globalRealImageLimit}</dd><small>{Math.max(0, labUsage.globalRealImageLimit - labUsage.globalRealImageCount)} disponibili</small></div>
                    <div><dt>Budget stimato</dt><dd>${labUsage.spentUsd.toFixed(2)} / ${labUsage.budgetUsd.toFixed(2)}</dd><small>${Math.max(0, labUsage.budgetUsd - labUsage.spentUsd).toFixed(2)} residui</small></div>
                </dl>
                <p>Il conteggio include anche le richieste fallite: è lo stesso criterio usato dal limite server-side.</p>
            </section> : null}

            <section className="creature-transformation-lab__production" aria-label="Pipeline FLUX di produzione">
                <header>
                    <span className="eyebrow">PIPELINE DI PRODUZIONE</span>
                    <h2>Genera l’evoluzione sbloccata</h2>
                    <p>Stesso percorso del gioco: progress track, reservation, post-processing e adozione invariati.</p>
                </header>
                <dl>
                    <div><dt>Percorso</dt><dd>{track ? `${track.status} · ${track.progress}/${track.target}` : 'Nessun percorso visuale aperto'}</dd></div>
                    <div><dt>Target</dt><dd>{track?.evolutionTargetId ?? '—'}</dd></div>
                    <div><dt>Body plan canonico</dt><dd>{progress?.bodyPlan ? `${progress.bodyPlan.label} (${progress.bodyPlan.id})` : '—'}</dd></div>
                    <div><dt>Target disponibili</dt><dd>{progress?.bodyPlan?.availableEvolutionTargets.join(', ') ?? '—'}</dd></div>
                </dl>
                <button type="button" className="primary-button" onClick={() => void launchProductionGeneration()} disabled={isLaunching || track?.status !== 'READY'}>
                    {isLaunching ? 'Avvio FLUX…' : 'Avvia generazione e apri evoluzione'}
                </button>
                {progress?.lastFailure ? <p role="alert">{progress.lastFailure.code}: {progress.lastFailure.message}</p> : null}
            </section>

            <SeedreamDiagnosticPanel creatureId={creature.id} />
            <FluxEvolutionChainSimulator creatureId={creature.id} />
        </section>
    )
}
