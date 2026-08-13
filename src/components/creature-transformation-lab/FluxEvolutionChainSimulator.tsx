import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { EVOLUTION_TARGETS, type EvolutionTargetId } from '../../../shared/creature-transformations/index.ts'
import {
    createVisualTransformationIdempotencyKey,
    generateFluxEvolutionChainStep,
    getCreatureTransformationRequestStatus,
    getCreatureVisualProgress,
    submitBackgroundRemovalCandidate,
} from '../../lib/creature-transformations-api'
import { removeCreatureBackground } from '../../lib/remove-creature-background'
import { normalizeCreatureMasterPng } from '../../lib/normalize-creature-master'
import { createCreatureDisplayAsset } from '../../lib/creature-display-asset'

type StepState = 'pending' | 'generating' | 'post-processing' | 'completed' | 'failed' | 'stopped'
type ChainStep = { generation: number, targetId: EvolutionTargetId, state: StepState, requestId?: string, imageUrl?: string, conceptName?: string, evolutionFunction?: string, error?: string }
type Chain = { version: 1, creatureId: string, total: number, sourceVisualVersionId?: string, status: 'setup' | 'generating' | 'completed' | 'failed' | 'stopped', steps: ChainStep[] }
type SourceOption = { id: string | undefined, label: string, signedUrl?: string }

const MAX_STEPS = 20
const POLL_INTERVAL_MS = 2_500

function storageKey(creatureId: string) { return `flux-evolution-chain-simulator:${creatureId}` }
function encodePng(bytes: Uint8Array) {
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
    return btoa(binary)
}
function targetFor(index: number): EvolutionTargetId { return EVOLUTION_TARGETS[index % EVOLUTION_TARGETS.length]!.id }
function readChain(creatureId: string): Chain | null {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(storageKey(creatureId)) ?? 'null') as Chain | null
        return parsed?.version === 1 && parsed.creatureId === creatureId && Array.isArray(parsed.steps) ? parsed : null
    } catch { return null }
}

export function FluxEvolutionChainSimulator({ creatureId }: { creatureId: string }) {
    const [chain, setChain] = useState<Chain | null>(null)
    const [count, setCount] = useState(10)
    const [sources, setSources] = useState<SourceOption[]>([{ id: undefined, label: 'Visuale attiva corrente' }])
    const [sourceId, setSourceId] = useState<string | undefined>(undefined)
    const [largeImage, setLargeImage] = useState<{ url: string, label: string } | null>(null)
    const stoppedRef = useRef(false)
    const postProcessingRequestIdRef = useRef<string | null>(null)

    useEffect(() => {
        setChain(readChain(creatureId))
        void getCreatureVisualProgress({ operation: 'GET_VISUAL_PROGRESS', creatureId }).then((progress) => {
            // The canonical current form may be a BASE version, which is not a selectable
            // ACTIVE visual-version source. Omitting its ID makes the server resolve it safely.
            const current = { id: undefined, label: `Visuale attiva · v${progress.currentVersion.versionNumber}` }
            const history = progress.history.map((entry) => ({ id: entry.id, label: entry.conceptName ? `v${entry.versionNumber} · ${entry.conceptName}` : `Visuale v${entry.versionNumber}`, signedUrl: entry.signedUrl }))
            setSources([current, ...history])
            setSourceId(current.id)
        }).catch(() => { /* The server still resolves its canonical source if the catalog is unavailable. */ })
    }, [creatureId])

    useEffect(() => {
        if (!chain) return
        try { window.localStorage.setItem(storageKey(creatureId), JSON.stringify(chain)) } catch { /* Recovery is best-effort. */ }
    }, [chain, creatureId])
    useEffect(() => { stoppedRef.current = chain?.status === 'stopped' }, [chain?.status])

    const updateStep = useCallback((generation: number, update: Partial<ChainStep>, status?: Chain['status']) => {
        setChain((current) => current ? { ...current, ...(status ? { status } : {}), steps: current.steps.map((step) => step.generation === generation ? { ...step, ...update } : step) } : current)
    }, [])

    const launch = useCallback(async (current: Chain, index: number) => {
        const step = current.steps[index]
        if (!step || current.status === 'stopped' || stoppedRef.current) return
        const completed = current.steps.slice(0, index)
        const previousStepRequestIds = completed.map((entry) => entry.requestId).filter((id): id is string => Boolean(id))
        if (previousStepRequestIds.length !== index) return
        updateStep(step.generation, { state: 'generating', error: undefined }, 'generating')
        try {
            const response = await generateFluxEvolutionChainStep({
                operation: 'GENERATE_FLUX_EVOLUTION_CHAIN_STEP', creatureId, evolutionTargetId: step.targetId,
                ...(index === 0 ? (current.sourceVisualVersionId ? { sourceVisualVersionId: current.sourceVisualVersionId } : {}) : { experimentalSourceRequestId: previousStepRequestIds.at(-1)! }),
                previousStepRequestIds, idempotencyKey: createVisualTransformationIdempotencyKey(),
            })
            updateStep(step.generation, { requestId: response.requestPersistence.transformationRequestId, state: 'generating' }, 'generating')
        } catch (error) { updateStep(step.generation, { state: 'failed', error: error instanceof Error ? error.message : 'Avvio FLUX non riuscito.' }, 'failed') }
    }, [creatureId, updateStep])

    const finishPostProcessing = useCallback(async (current: Chain, step: ChainStep) => {
        if (!step.requestId) return
        // Updating the chain causes this effect to run again. Without a per-request
        // guard, every render starts another expensive browser background-removal job.
        if (postProcessingRequestIdRef.current === step.requestId) return
        postProcessingRequestIdRef.current = step.requestId
        if (step.state !== 'post-processing') updateStep(step.generation, { state: 'post-processing' })
        try {
            const raw = await getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId: step.requestId })
            if (!raw.rawResult) throw new Error('Il risultato raw FLUX non e disponibile.')
            const response = await fetch(raw.rawResult.signedUrl)
            if (!response.ok) throw new Error('Non e stato possibile scaricare il risultato raw FLUX.')
            const transparent = await removeCreatureBackground(await response.blob())
            const normalized = await normalizeCreatureMasterPng(transparent)
            const display = await createCreatureDisplayAsset(normalized)
            await submitBackgroundRemovalCandidate({ operation: 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE', transformationRequestId: step.requestId, candidatePngBase64: encodePng(new Uint8Array(await normalized.arrayBuffer())), displayAssetWebpBase64: encodePng(new Uint8Array(await display.blob.arrayBuffer())) })
            const final = await getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId: step.requestId })
            if (!final.result || final.result.assetReadiness !== 'FINAL_ASSET') throw new Error('L asset finale della catena non e disponibile.')
            const nextIndex = step.generation
            const next = { ...current, steps: current.steps.map((entry) => entry.generation === step.generation ? { ...entry, state: 'completed' as const, imageUrl: final.result!.signedUrl, conceptName: final.fluxSnapshot?.conceptName, evolutionFunction: final.fluxSnapshot ? `${final.fluxSnapshot.evolutionFunction} · ${final.fluxSnapshot.mutationIdea}` : undefined } : entry) }
            setChain(next)
            if (!stoppedRef.current) {
                if (nextIndex >= next.steps.length) setChain({ ...next, status: 'completed' })
                else void launch(next, nextIndex)
            }
        } catch (error) { updateStep(step.generation, { state: 'failed', error: error instanceof Error ? error.message : 'Post-processing non riuscito.' }, 'failed') }
        finally {
            if (postProcessingRequestIdRef.current === step.requestId) postProcessingRequestIdRef.current = null
        }
    }, [launch, updateStep])

    useEffect(() => {
        const active = chain?.steps.find((step) => (step.state === 'generating' || step.state === 'post-processing') && step.requestId)
        if (!chain || chain.status === 'stopped' || !active?.requestId) return undefined
        let cancelled = false
        if (active.state === 'post-processing') {
            void finishPostProcessing(chain, active)
            return () => { cancelled = true }
        }
        const poll = async () => {
            try {
                const status = await getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId: active.requestId! })
                if (cancelled || chain.status === 'stopped') return
                if (status.requestPersistence.status === 'FAILED') updateStep(active.generation, { state: 'failed', error: status.error?.message ?? 'Generazione FLUX non riuscita.' }, 'failed')
                else if (status.requestPersistence.status === 'SUCCEEDED') void finishPostProcessing(chain, active)
            } catch (error) { if (!cancelled) updateStep(active.generation, { state: 'failed', error: error instanceof Error ? error.message : 'Polling non riuscito.' }, 'failed') }
        }
        void poll()
        const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
        return () => { cancelled = true; window.clearInterval(timer) }
    }, [chain, finishPostProcessing, updateStep])

    const activeStep = chain?.steps.find((step) => step.state === 'generating' || step.state === 'post-processing')
    const canSetup = !chain || ['completed', 'failed', 'stopped'].includes(chain.status)
    const timeline = useMemo(() => chain?.steps ?? [], [chain])
    function start() {
        const total = Math.max(1, Math.min(MAX_STEPS, Math.round(count) || 10))
        stoppedRef.current = false
        const next: Chain = { version: 1, creatureId, total, ...(sourceId ? { sourceVisualVersionId: sourceId } : {}), status: 'generating', steps: Array.from({ length: total }, (_, index) => ({ generation: index + 1, targetId: targetFor(index), state: 'pending' })) }
        setChain(next); void launch(next, 0)
    }
    function retry() {
        if (!chain) return
        const index = chain.steps.findIndex((step) => step.state === 'failed')
        if (index < 0) return
        stoppedRef.current = false
        const next = { ...chain, status: 'generating' as const, steps: chain.steps.map((step, stepIndex) => stepIndex === index ? { ...step, state: 'pending' as const, requestId: undefined, error: undefined } : step) }
        setChain(next); void launch(next, index)
    }

    return <section className="flux-chain-simulator" aria-labelledby="flux-chain-simulator-title">
        <header><span className="eyebrow">EXPERIMENT / FLUX</span><h2 id="flux-chain-simulator-title">Evolution Chain Simulator</h2><p>Ogni step usa l’asset finale processato dello step precedente. Non apre track, non adotta visuali e non modifica la progressione.</p></header>
        {canSetup ? <div className="flux-chain-simulator__setup"><label>Numero evoluzioni<input type="number" min="1" max={MAX_STEPS} value={count} onChange={(event) => setCount(Number(event.target.value))} /></label><label>Immagine iniziale<select value={sourceId ?? ''} onChange={(event) => setSourceId(event.target.value || undefined)}>{sources.map((source) => <option key={source.id ?? 'canonical'} value={source.id ?? ''}>{source.label}</option>)}</select></label><button type="button" className="primary-button" onClick={start}>Simula catena evolutiva</button></div> : null}
        {chain ? <><div className="flux-chain-simulator__actions"><p role="status">Stato: {chain.status}{activeStep ? ` · G${activeStep.generation} ${activeStep.state}` : ''}</p>{chain.status === 'generating' ? <button type="button" onClick={() => { stoppedRef.current = true; setChain({ ...chain, status: 'stopped', steps: chain.steps.map((step) => step.state === 'pending' ? { ...step, state: 'stopped' } : step) }) }}>Stop simulation</button> : null}{chain.status === 'failed' ? <button type="button" onClick={retry}>Riprova step fallito</button> : null}</div><ol className="flux-chain-simulator__timeline"><li><span>BASE</span></li>{timeline.map((step) => <li key={step.generation} data-state={step.state}><button type="button" disabled={!step.imageUrl} onClick={() => step.imageUrl && setLargeImage({ url: step.imageUrl, label: `Generazione ${step.generation}` })}>{step.imageUrl ? <img src={step.imageUrl} alt={`Generazione ${step.generation}`} /> : <span aria-hidden="true">G{step.generation}</span>}<strong>G{step.generation}</strong></button><small>{EVOLUTION_TARGETS.find((target) => target.id === step.targetId)?.label} · {step.state}</small>{step.conceptName ? <em>{step.conceptName}</em> : null}{step.evolutionFunction ? <em>{step.evolutionFunction}</em> : null}{step.error ? <p role="alert">{step.error}</p> : null}</li>)}</ol></> : null}
        {largeImage ? <div className="flux-chain-simulator__modal" role="dialog" aria-modal="true" aria-label={largeImage.label}><button type="button" onClick={() => setLargeImage(null)}>Chiudi</button><img src={largeImage.url} alt={largeImage.label} /></div> : null}
    </section>
}
