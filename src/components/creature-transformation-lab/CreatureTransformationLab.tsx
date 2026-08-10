import { useCallback, useEffect, useState } from 'react'

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
    type ConceptCreativeProfileId,
} from '../../../shared/creature-transformations/index.ts'
import type { PlayerCreatureRecord } from '../../lib/profile-api'
import {
    createConceptIdempotencyKey,
    createImageIdempotencyKey,
    CreatureTransformationApiError,
    getCreatureTransformationRequestStatus,
    getLineageComparisonReviews,
    getCreatureTransformationLabUsage,
    generateCreatureTransformationConcept,
    generateCreatureTransformationImage,
    generateCurrentPipelineExperiment,
    generateLineageFirstExperiment,
    getCurrentCreatureVisual,
    getCreatureVisualProgress,
    submitLineageComparisonReview,
} from '../../lib/creature-transformations-api'
import { canGenerateMockImage } from './lab-image-state'
import { CreatureTransformationBenchmark } from './CreatureTransformationBenchmark'
import { GeneratedImageCatalog } from './GeneratedImageCatalog'
import { isCreatureTransformationBenchmarkVisible } from './lab-benchmark-flag'
import { isRealImageExperimentVisible } from './lab-real-image-flag'
import { ArrowRightIcon, BackIcon, CollectionIcon } from '../../ui/icons'
import { isExpressiveConceptExperimentVisible } from './lab-expressive-concept-flag'

import '../technical-screens.css'
import './CreatureTransformationLab.css'

type ConceptMode = 'MOCK' | 'AI'
type ComparisonLaunchMode = 'PARALLEL' | 'SEQUENTIAL'
type LineageReviewKey = 'creativeSurprise' | 'targetTransformationStrength' | 'creatureContinuity' | 'lineagePreservation' | 'nonTargetStability'
type SavedLineageReview = { profileId: string; creatureId: string; lineageRequestId: string; currentRequestId: string | null; scores: Record<LineageReviewKey, 1 | 2 | 3 | 4 | 5>; preferredResult: 'CURRENT' | 'LINEAGE_FIRST' | 'NONE'; createdAt: string; updatedAt: string }
type LineageComparisonDraft = Readonly<{
    lineageRequest: TransformationRequestPersistence | null
    realRequestPersistence: TransformationRequestPersistence | null
    lineage: ExperimentalLineage
    lineageTargetId: EvolutionTargetId
    scores: Record<LineageReviewKey, number>
    preferredResult: 'CURRENT' | 'LINEAGE_FIRST' | 'NONE'
}>
type CurrentPipelineLaunchOptions = Readonly<{
    creativeProfile?: ConceptCreativeProfileId
    comparisonKey?: string
    onAccepted?: (request: TransformationRequestPersistence) => void
}>
const LINEAGE_REVIEW_KEYS: readonly LineageReviewKey[] = ['creativeSurprise', 'targetTransformationStrength', 'creatureContinuity', 'lineagePreservation', 'nonTargetStability']
const REAL_IMAGE_FRONTEND_ENABLED = isRealImageExperimentVisible(import.meta.env.VITE_CREATURE_TRANSFORMATION_REAL_IMAGE_ENABLED)
const BENCHMARK_FRONTEND_ENABLED = isCreatureTransformationBenchmarkVisible(import.meta.env.VITE_CREATURE_TRANSFORMATION_BENCHMARK_ENABLED)
const EXPRESSIVE_CONCEPT_FRONTEND_ENABLED = isExpressiveConceptExperimentVisible(import.meta.env.VITE_CREATURE_TRANSFORMATION_EXPRESSIVE_CONCEPT_EXPERIMENT_ENABLED)
const REAL_POLL_INTERVAL_MS = 2500
const REAL_POLL_TIMEOUT_MS = 60000
const COMPARISON_SEQUENCE_TIMEOUT_MS = 10 * 60 * 1000
const FALLBACK_SOURCE_PREVIEW = '/assets/battle/creatures/verdant-hatchling.png'

function lineageDraftStorageKey(creatureId: string): string {
    return `creature-transformation-lineage-draft:${creatureId}`
}

function readLineageComparisonDraft(creatureId: string): LineageComparisonDraft | null {
    try {
        const value = window.localStorage.getItem(lineageDraftStorageKey(creatureId))
        if (!value) return null
        const draft = JSON.parse(value) as Partial<LineageComparisonDraft>
        if (!draft || !draft.lineage || !Array.isArray(draft.lineage.identityTraits) || !Array.isArray(draft.lineage.acquiredTraits) || !draft.lineageTargetId || !draft.scores || !['CURRENT', 'LINEAGE_FIRST', 'NONE'].includes(String(draft.preferredResult))) return null
        return draft as LineageComparisonDraft
    } catch {
        return null
    }
}

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
    const [lineageSourceChain, setLineageSourceChain] = useState<Array<{ requestId: string; signedUrl: string }>>([])
    const [productionSourceCatalog, setProductionSourceCatalog] = useState<Array<{ id: string; versionNumber: number; conceptName: string | null; signedUrl: string }>>([])
    const [selectedProductionSource, setSelectedProductionSource] = useState<{ versionId: string; signedUrl: string; label: string } | null>(null)
    const [isProductionCatalogOpen, setIsProductionCatalogOpen] = useState(false)
    const [isGeneratedImageCatalogOpen, setIsGeneratedImageCatalogOpen] = useState(false)
    const [labUsage, setLabUsage] = useState<{ requestCount: number; requestLimit: number; realImageCount: number; realImageLimit: number; globalRealImageCount: number; globalRealImageLimit: number; spentUsd: number; budgetUsd: number } | null>(null)
    const [lineageReview, setLineageReview] = useState<Record<LineageReviewKey, number>>({ creativeSurprise: 3, targetTransformationStrength: 3, creatureContinuity: 3, lineagePreservation: 3, nonTargetStability: 3 })
    const [preferredResult, setPreferredResult] = useState<'CURRENT' | 'LINEAGE_FIRST' | 'NONE'>('NONE')
    const [lineageReviewSaved, setLineageReviewSaved] = useState(false)
    const [savedLineageReviews, setSavedLineageReviews] = useState<SavedLineageReview[]>([])
    const [savedLineageReviewsError, setSavedLineageReviewsError] = useState<string | null>(null)
    const [selectedSavedLineageReviewId, setSelectedSavedLineageReviewId] = useState('')
    const [isLoadingSavedLineageReview, setIsLoadingSavedLineageReview] = useState(false)
    const [comparisonLaunchMode, setComparisonLaunchMode] = useState<ComparisonLaunchMode>('PARALLEL')
    const [isLaunchingComparison, setIsLaunchingComparison] = useState(false)
    const [comparisonLaunchMessage, setComparisonLaunchMessage] = useState<string | null>(null)
    const [isLineageDraftReady, setIsLineageDraftReady] = useState(false)
    const [calibrationControlRequest, setCalibrationControlRequest] = useState<TransformationRequestPersistence | null>(null)
    const [calibrationControlStatus, setCalibrationControlStatus] = useState<TransformationRequestStatusResponse | null>(null)
    const [calibrationExpressiveRequest, setCalibrationExpressiveRequest] = useState<TransformationRequestPersistence | null>(null)
    const [calibrationExpressiveStatus, setCalibrationExpressiveStatus] = useState<TransformationRequestStatusResponse | null>(null)
    const [isLaunchingCalibration, setIsLaunchingCalibration] = useState(false)
    const realRequestIsRunning = Boolean(realRequestPersistence && !isTerminalRequestStatus(realStatus?.requestPersistence.status ?? realRequestPersistence.status) && !realPollingTimedOut)
    const lineageRequestIsRunning = Boolean(lineageRequest && !isTerminalRequestStatus(lineageStatus?.requestPersistence.status ?? lineageRequest.status))
    const calibrationControlRunning = Boolean(calibrationControlRequest && !isTerminalRequestStatus(calibrationControlStatus?.requestPersistence.status ?? calibrationControlRequest.status))
    const calibrationExpressiveRunning = Boolean(calibrationExpressiveRequest && !isTerminalRequestStatus(calibrationExpressiveStatus?.requestPersistence.status ?? calibrationExpressiveRequest.status))
    const isBusy = isGeneratingConcept || isGeneratingImage || isLaunchingComparison || isLaunchingCalibration || realRequestIsRunning || lineageRequestIsRunning || calibrationControlRunning || calibrationExpressiveRunning
    const imageGenerationAvailable = canGenerateMockImage(conceptResult, isGeneratingConcept, isGeneratingImage) && !realRequestIsRunning
    const comparisonSource = lineageSourceRequestId && lineageSourcePreview?.requestId === lineageSourceRequestId
        ? { signedUrl: lineageSourcePreview.signedUrl, label: 'Risultato sperimentale condiviso A/B' }
        : selectedProductionSource
            ? { signedUrl: selectedProductionSource.signedUrl, label: selectedProductionSource.label }
            : canonicalSourcePreview
                ? { signedUrl: canonicalSourcePreview.signedUrl, label: canonicalSourcePreview.isBaseVersion ? 'Visuale base canonica del profilo' : 'Ultima evoluzione attiva del profilo' }
                : { signedUrl: FALLBACK_SOURCE_PREVIEW, label: 'Anteprima della visuale canonica del profilo' }
    const evolutionChain = [
        { id: selectedProductionSource?.versionId ?? 'productive-current', signedUrl: selectedProductionSource?.signedUrl ?? canonicalSourcePreview?.signedUrl ?? FALLBACK_SOURCE_PREVIEW, label: selectedProductionSource?.label ?? (canonicalSourcePreview?.isBaseVersion ? 'Forma produttiva base' : 'Forma produttiva attiva'), active: !lineageSourceRequestId },
        ...lineageSourceChain.map((step, index) => ({ id: step.requestId, signedUrl: step.signedUrl, label: `Esperimento B · stadio ${index + 1}`, active: step.requestId === lineageSourceRequestId })),
    ]

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

    async function refreshLabUsage() {
        try {
            const response = await getCreatureTransformationLabUsage()
            setLabUsage(response.usage)
        } catch {
            // Usage visibility is informational and must not block the lab.
        }
    }

    const refreshSavedLineageReviews = useCallback(async () => {
        try {
            const response = await getLineageComparisonReviews({ operation: 'GET_LINEAGE_COMPARISON_REVIEWS' })
            setSavedLineageReviews([...response.reviews] as SavedLineageReview[])
            setSavedLineageReviewsError(null)
        } catch (nextError) {
            setSavedLineageReviews([])
            setSavedLineageReviewsError(nextError instanceof Error ? nextError.message : 'Impossibile caricare l archivio delle review.')
            throw nextError
        }
    }, [])

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
        let cancelled = false
        void (async () => {
            try {
                const response = await getCreatureVisualProgress({ operation: 'GET_VISUAL_PROGRESS', creatureId: creature.id })
                if (!cancelled) setProductionSourceCatalog(response.history.map((version) => ({ id: version.id, versionNumber: version.versionNumber, conceptName: version.conceptName, signedUrl: version.signedUrl })))
            } catch {
                // The lab continues with the active visual when the catalog is unavailable.
            }
        })()
        return () => { cancelled = true }
    }, [creature.id])

    useEffect(() => { void refreshLabUsage() }, [])
    useEffect(() => { void refreshSavedLineageReviews().catch(() => { /* The visible archive state already contains the error. */ }) }, [refreshSavedLineageReviews])

    useEffect(() => {
        const draft = readLineageComparisonDraft(creature.id)
        if (draft) {
            setLineageRequest(draft.lineageRequest)
            setRealRequestPersistence(draft.realRequestPersistence)
            setLineageStatus(null)
            setRealStatus(null)
            setRealPollingTimedOut(false)
            setLineage(draft.lineage)
            setLineageTargetId(draft.lineageTargetId)
            setLineageReview(draft.scores)
            setPreferredResult(draft.preferredResult)
        }
        setIsLineageDraftReady(true)
    }, [creature.id])

    useEffect(() => {
        if (!isLineageDraftReady) return
        const draft: LineageComparisonDraft = { lineageRequest, realRequestPersistence, lineage, lineageTargetId, scores: lineageReview, preferredResult }
        try { window.localStorage.setItem(lineageDraftStorageKey(creature.id), JSON.stringify(draft)) } catch { /* Draft recovery is best-effort. */ }
    }, [creature.id, isLineageDraftReady, lineage, lineageRequest, lineageReview, lineageTargetId, preferredResult, realRequestPersistence])

    useEffect(() => {
        if (!realRequestPersistence || isTerminalRequestStatus(realStatus?.requestPersistence.status) || realPollingTimedOut) return undefined
        let cancelled = false
        const poll = async () => {
            if (document.visibilityState !== 'visible') return
            try {
                const next = await getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId: realRequestPersistence.transformationRequestId })
                if (!cancelled) { setRealStatus(next); if (isTerminalRequestStatus(next.requestPersistence.status)) void refreshLabUsage() }
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
                if (!cancelled) { setLineageStatus(next); if (isTerminalRequestStatus(next.requestPersistence.status)) void refreshLabUsage() }
            } catch (nextError) { if (!cancelled) setLineageError(nextError instanceof Error ? nextError : new Error('Impossibile aggiornare il test lineage-first.')) }
        }
        const interval = window.setInterval(() => void poll(), REAL_POLL_INTERVAL_MS)
        void poll()
        return () => { cancelled = true; window.clearInterval(interval) }
    }, [lineageRequest, lineageStatus?.requestPersistence.status])

    useEffect(() => {
        if (!calibrationControlRequest || isTerminalRequestStatus(calibrationControlStatus?.requestPersistence.status)) return undefined
        let cancelled = false
        const poll = async () => {
            try {
                const next = await getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId: calibrationControlRequest.transformationRequestId })
                if (!cancelled) { setCalibrationControlStatus(next); if (isTerminalRequestStatus(next.requestPersistence.status)) void refreshLabUsage() }
            } catch (nextError) { if (!cancelled) setError(nextError instanceof Error ? nextError : new Error('Impossibile aggiornare il controllo della calibrazione A.')) }
        }
        const interval = window.setInterval(() => void poll(), REAL_POLL_INTERVAL_MS)
        void poll()
        return () => { cancelled = true; window.clearInterval(interval) }
    }, [calibrationControlRequest, calibrationControlStatus?.requestPersistence.status])

    useEffect(() => {
        if (!calibrationExpressiveRequest || isTerminalRequestStatus(calibrationExpressiveStatus?.requestPersistence.status)) return undefined
        let cancelled = false
        const poll = async () => {
            try {
                const next = await getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId: calibrationExpressiveRequest.transformationRequestId })
                if (!cancelled) { setCalibrationExpressiveStatus(next); if (isTerminalRequestStatus(next.requestPersistence.status)) void refreshLabUsage() }
            } catch (nextError) { if (!cancelled) setError(nextError instanceof Error ? nextError : new Error('Impossibile aggiornare la candidata espressiva della calibrazione A.')) }
        }
        const interval = window.setInterval(() => void poll(), REAL_POLL_INTERVAL_MS)
        void poll()
        return () => { cancelled = true; window.clearInterval(interval) }
    }, [calibrationExpressiveRequest, calibrationExpressiveStatus?.requestPersistence.status])

    useEffect(() => {
        if (!isLineageDraftReady || !lineageRequest || !lineageStatus?.result) return undefined
        let cancelled = false
        const timer = window.setTimeout(() => {
            void submitLineageComparisonReview({
                operation: 'SUBMIT_LINEAGE_COMPARISON_REVIEW', creatureId: creature.id,
                lineageRequestId: lineageRequest.transformationRequestId,
                ...(realRequestPersistence ? { currentRequestId: realRequestPersistence.transformationRequestId } : {}),
                scores: lineageReview as { creativeSurprise: 1 | 2 | 3 | 4 | 5, targetTransformationStrength: 1 | 2 | 3 | 4 | 5, creatureContinuity: 1 | 2 | 3 | 4 | 5, lineagePreservation: 1 | 2 | 3 | 4 | 5, nonTargetStability: 1 | 2 | 3 | 4 | 5 },
                preferredResult,
            }).then(() => {
                if (cancelled) return
                setLineageReviewSaved(true)
                setSelectedSavedLineageReviewId(lineageRequest.transformationRequestId)
                void refreshSavedLineageReviews()
            }).catch((nextError) => {
                if (!cancelled) setLineageError(nextError instanceof Error ? nextError : new Error('Impossibile salvare automaticamente la review A/B.'))
            })
        }, 700)
        return () => { cancelled = true; window.clearTimeout(timer) }
    }, [creature.id, isLineageDraftReady, lineageRequest, lineageReview, lineageStatus?.result, preferredResult, realRequestPersistence, refreshSavedLineageReviews])

    async function launchLineageFirst(): Promise<TransformationRequestPersistence | null> {
        setLineageError(null)
        try {
            const response = await generateLineageFirstExperiment({ operation: 'GENERATE_LINEAGE_FIRST_EXPERIMENT', creatureId: creature.id, evolutionTargetId: lineageTargetId, lineage, ...(lineageInstruction.trim() ? { instruction: lineageInstruction.trim() } : {}), ...(lineageSourceRequestId ? { experimentalSourceRequestId: lineageSourceRequestId } : selectedProductionSource ? { sourceVisualVersionId: selectedProductionSource.versionId } : {}), idempotencyKey: createImageIdempotencyKey() })
            if (!response.success || !('requestPersistence' in response) || !response.requestPersistence) throw new Error('Risposta lineage-first non valida.')
            setLineageRequest(response.requestPersistence)
            setLineageStatus(null)
            void refreshLabUsage()
            return response.requestPersistence
        } catch (nextError) {
            setLineageError(nextError instanceof Error ? nextError : new Error('Generazione lineage-first non riuscita.'))
            return null
        }
    }

    async function launchCurrentPipeline(options: CurrentPipelineLaunchOptions = {}): Promise<TransformationRequestPersistence | null> {
        setIsGeneratingImage(true)
        setError(null)
        setRealPollingTimedOut(false)
        try {
            const response = await generateCurrentPipelineExperiment({ operation: 'GENERATE_CURRENT_PIPELINE_EXPERIMENT', creatureId: creature.id, evolutionTargetId: lineageTargetId, ...(lineageSourceRequestId ? { experimentalSourceRequestId: lineageSourceRequestId } : selectedProductionSource ? { sourceVisualVersionId: selectedProductionSource.versionId } : {}), ...(options.creativeProfile ? { creativeProfile: options.creativeProfile } : {}), ...(options.comparisonKey ? { comparisonKey: options.comparisonKey } : {}), idempotencyKey: createImageIdempotencyKey() })
            if (!response.success || !('requestPersistence' in response) || !response.requestPersistence) throw new Error('Risposta Current pipeline non valida.')
            if (options.onAccepted) options.onAccepted(response.requestPersistence)
            else { setRealRequestPersistence(response.requestPersistence); setRealStatus(null) }
            void refreshLabUsage()
            return response.requestPersistence
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError : new Error('Generazione Current pipeline non riuscita.'))
            return null
        } finally { setIsGeneratingImage(false) }
    }

    async function handleGenerateLineageFirst() {
        if (!realCostConfirmed || isBusy) return
        await launchLineageFirst()
    }

    async function handleGenerateCurrentPipeline() {
        if (!realCostConfirmed || isBusy) return
        await launchCurrentPipeline()
    }

    async function handleGenerateConceptCalibration() {
        if (!realCostConfirmed || isBusy) return
        setIsLaunchingCalibration(true)
        setCalibrationControlRequest(null)
        setCalibrationControlStatus(null)
        setCalibrationExpressiveRequest(null)
        setCalibrationExpressiveStatus(null)
        const comparisonKey = crypto.randomUUID()
        try {
            const control = await launchCurrentPipeline({ creativeProfile: 'CONSERVATIVE', comparisonKey, onAccepted: (request) => { setCalibrationControlRequest(request); setCalibrationControlStatus(null) } })
            if (!control) return
            const completed = await waitForCurrentPipeline(control, setCalibrationControlStatus, 'Impossibile attendere il controllo della calibrazione A.', 'Il controllo della calibrazione A non ha concluso entro dieci minuti: la candidata espressiva non è stata avviata.')
            if (completed?.requestPersistence.status !== 'SUCCEEDED') {
                if (completed) setError(new Error('Il controllo della calibrazione A non è riuscito: la candidata espressiva non è stata avviata.'))
                return
            }
            await launchCurrentPipeline({ creativeProfile: 'EXPRESSIVE', comparisonKey, onAccepted: (request) => { setCalibrationExpressiveRequest(request); setCalibrationExpressiveStatus(null) } })
        } finally {
            setIsLaunchingCalibration(false)
        }
    }

    async function waitForCurrentPipeline(request: TransformationRequestPersistence, onStatus: (status: TransformationRequestStatusResponse) => void = setRealStatus, waitErrorMessage = 'Impossibile attendere il risultato A.', timeoutMessage = 'A non ha concluso entro dieci minuti: B non e stata avviata.'): Promise<TransformationRequestStatusResponse | null> {
        const deadline = Date.now() + COMPARISON_SEQUENCE_TIMEOUT_MS
        while (Date.now() < deadline) {
            try {
                const status = await getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId: request.transformationRequestId })
                onStatus(status)
                if (isTerminalRequestStatus(status.requestPersistence.status)) return status
            } catch (nextError) {
                setError(nextError instanceof Error ? nextError : new Error(waitErrorMessage))
                return null
            }
            await new Promise<void>((resolve) => window.setTimeout(resolve, REAL_POLL_INTERVAL_MS))
        }
        setError(new Error(timeoutMessage))
        return null
    }

    async function handleGenerateComparison() {
        if (!realCostConfirmed || isBusy) return
        setIsLaunchingComparison(true)
        setComparisonLaunchMessage(null)
        setLineageReviewSaved(false)
        if (comparisonLaunchMode === 'PARALLEL') {
            setComparisonLaunchMessage('Avvio contemporaneo di A e B…')
            const [current, lineageFirst] = await Promise.all([launchCurrentPipeline(), launchLineageFirst()])
            setComparisonLaunchMessage(current && lineageFirst ? 'A e B sono state avviate con la stessa sorgente e lo stesso target.' : 'Una delle due pipeline non e stata avviata: controlla gli errori nei rispettivi pannelli.')
        } else {
            setComparisonLaunchMessage('Avvio A. B partirà soltanto dopo il completamento positivo di A…')
            const current = await launchCurrentPipeline()
            if (!current) setComparisonLaunchMessage('A non è stata avviata: B non partirà.')
            else {
                const completed = await waitForCurrentPipeline(current)
                if (completed?.requestPersistence.status === 'SUCCEEDED') {
                    const lineageFirst = await launchLineageFirst()
                    setComparisonLaunchMessage(lineageFirst ? 'A completata: B è stata avviata sulla stessa sorgente condivisa.' : 'A completata, ma B non è stata avviata: controlla l’errore.')
                } else if (completed) {
                    setLineageError(new Error('A è terminata con errore: B non è stata avviata.'))
                    setComparisonLaunchMessage('A non è riuscita: B non è stata avviata.')
                } else {
                    setComparisonLaunchMessage('Attesa di A interrotta: B non è stata avviata.')
                }
            }
        }
        setIsLaunchingComparison(false)
    }

    async function handleSaveLineageReview() {
        if (!lineageRequest) return
        setLineageError(null)
        try {
            await submitLineageComparisonReview({ operation: 'SUBMIT_LINEAGE_COMPARISON_REVIEW', creatureId: creature.id, lineageRequestId: lineageRequest.transformationRequestId, ...(realRequestPersistence ? { currentRequestId: realRequestPersistence.transformationRequestId } : {}), scores: lineageReview as { creativeSurprise: 1 | 2 | 3 | 4 | 5, targetTransformationStrength: 1 | 2 | 3 | 4 | 5, creatureContinuity: 1 | 2 | 3 | 4 | 5, lineagePreservation: 1 | 2 | 3 | 4 | 5, nonTargetStability: 1 | 2 | 3 | 4 | 5 }, preferredResult })
            setLineageReviewSaved(true)
            setSelectedSavedLineageReviewId(lineageRequest.transformationRequestId)
            await refreshSavedLineageReviews()
        } catch (nextError) { setLineageError(nextError instanceof Error ? nextError : new Error('Impossibile salvare la review A/B.')) }
    }

    async function handleLoadSavedLineageReview() {
        const saved = savedLineageReviews.find((review) => review.lineageRequestId === selectedSavedLineageReviewId)
        if (!saved) return
        setIsLoadingSavedLineageReview(true); setLineageError(null)
        try {
            const [nextLineageStatus, nextCurrentStatus] = await Promise.all([
                getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId: saved.lineageRequestId, reviewOwnerProfileId: saved.profileId }),
                saved.currentRequestId ? getCreatureTransformationRequestStatus({ operation: 'GET_REQUEST_STATUS', transformationRequestId: saved.currentRequestId, reviewOwnerProfileId: saved.profileId }) : Promise.resolve(null),
            ])
            if (!nextLineageStatus.result) throw new Error('Il risultato B della review salvata non e piu disponibile.')
            setLineageRequest({ transformationRequestId: saved.lineageRequestId, idempotencyStatus: 'EXISTING', status: nextLineageStatus.requestPersistence.status })
            setLineageStatus(nextLineageStatus)
            setRealRequestPersistence(nextCurrentStatus ? { transformationRequestId: saved.currentRequestId!, idempotencyStatus: 'EXISTING', status: nextCurrentStatus.requestPersistence.status } : null)
            setRealStatus(nextCurrentStatus)
            setRealPollingTimedOut(false)
            setLineageReview(saved.scores)
            setPreferredResult(saved.preferredResult)
            setLineageReviewSaved(true)
        } catch (nextError) {
            setLineageError(nextError instanceof Error ? nextError : new Error('Impossibile aprire la review salvata.'))
        } finally { setIsLoadingSavedLineageReview(false) }
    }

    const lineageReviewPanel = lineageStatus?.result ? <fieldset className="creature-transformation-lab__review creature-transformation-lab__comparison-review"><legend>Review A/B (1-5)</legend>{LINEAGE_REVIEW_KEYS.map((key) => <label key={key}>{key}<select value={lineageReview[key]} onChange={(event) => { setLineageReviewSaved(false); setLineageReview((current) => ({ ...current, [key]: Number(event.target.value) })) }}>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}</select></label>)}<label>Preferred result<select value={preferredResult} onChange={(event) => { setLineageReviewSaved(false); setPreferredResult(event.target.value as typeof preferredResult) }}><option value="CURRENT">CURRENT</option><option value="LINEAGE_FIRST">LINEAGE_FIRST</option><option value="NONE">NONE</option></select></label><button type="button" onClick={() => void handleSaveLineageReview()}>Salva review A/B</button>{lineageReviewSaved ? <p>Review A/B salvata.</p> : null}</fieldset> : null

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
                <button type="button" onClick={onBack}><BackIcon aria-hidden="true" />Home</button>
                <div>
                    <span className="eyebrow">Development-only</span>
                    <h1 id="creature-transformation-lab-title">Laboratorio trasformazioni</h1>
                </div>
                <button type="button" className="creature-transformation-lab__open-generated-catalog" onClick={() => setIsGeneratedImageCatalogOpen(true)}><CollectionIcon aria-hidden="true" />Archivio</button>
            </header>

            {isGeneratedImageCatalogOpen ? <GeneratedImageCatalog onClose={() => setIsGeneratedImageCatalogOpen(false)} /> : null}

            <section className="creature-transformation-lab__evolution-chain" aria-label="Catena delle sorgenti evolutive A B">
                <header><span className="eyebrow">CATENA EVOLUTIVA</span><h2>Stadi della sorgente condivisa</h2><p>A e B partono sempre dallo stadio evidenziato.</p></header>
                <ol>
                    {evolutionChain.map((stage, index) => <li key={stage.id} className={stage.active ? 'is-active' : ''}>
                        {index === 0 ? <button type="button" className="creature-transformation-lab__chain-stage-button" onClick={() => setIsProductionCatalogOpen(true)} disabled={isBusy}><figure><img src={stage.signedUrl} alt={stage.label} /><figcaption>{stage.label}<small>Scegli dal catalogo</small></figcaption></figure></button> : <figure><img src={stage.signedUrl} alt={stage.label} /><figcaption>{stage.label}</figcaption></figure>}
                        {index < evolutionChain.length - 1 ? <span className="creature-transformation-lab__chain-arrow" aria-hidden="true"><ArrowRightIcon /></span> : null}
                    </li>)}
                </ol>
            </section>

            {isProductionCatalogOpen ? <section className="creature-transformation-lab__production-catalog" aria-label="Catalogo forme produttive">
                <header><div><span className="eyebrow">CATALOGO FORME PRODUTTIVE</span><h2>Scegli la base del prossimo confronto</h2><p>La scelta sarà inviata e verificata dal server per entrambe le pipeline.</p></div><button type="button" onClick={() => setIsProductionCatalogOpen(false)}>Chiudi</button></header>
                <div>{productionSourceCatalog.length ? productionSourceCatalog.map((version) => <button key={version.id} type="button" className={selectedProductionSource?.versionId === version.id ? 'is-selected' : ''} onClick={() => { setSelectedProductionSource({ versionId: version.id, signedUrl: version.signedUrl, label: version.conceptName ? `v${version.versionNumber} · ${version.conceptName}` : `Forma produttiva v${version.versionNumber}` }); setLineageSourceRequestId(null); setLineageSourcePreview(null); setLineageSourceChain([]); setIsProductionCatalogOpen(false) }} disabled={isBusy}><img src={version.signedUrl} alt={version.conceptName ?? `Forma produttiva ${version.versionNumber}`} /><span>v{version.versionNumber}</span><small>{version.conceptName ?? 'Forma base'}</small></button>) : <p>Nessuna evoluzione produttiva disponibile: usa la visuale attiva corrente.</p>}</div>
                <button type="button" className="creature-transformation-lab__catalog-reset" onClick={() => { setSelectedProductionSource(null); setLineageSourceRequestId(null); setLineageSourcePreview(null); setLineageSourceChain([]); setIsProductionCatalogOpen(false) }} disabled={isBusy}>Usa l’ultima visuale attiva del profilo</button>
            </section> : null}

            {labUsage ? <section className="creature-transformation-lab__usage" aria-label="Utilizzo giornaliero del laboratorio">
                <header><span className="eyebrow">LIMITI GIORNALIERI</span><h2>Utilizzo del laboratorio</h2></header>
                <dl><div><dt>Richieste laboratorio</dt><dd>{labUsage.requestCount} / {labUsage.requestLimit}</dd><small>{Math.max(0, labUsage.requestLimit - labUsage.requestCount)} disponibili</small></div><div><dt>Immagini REAL</dt><dd>{labUsage.realImageCount} / {labUsage.realImageLimit}</dd><small>{Math.max(0, labUsage.realImageLimit - labUsage.realImageCount)} disponibili</small></div><div><dt>REAL globali</dt><dd>{labUsage.globalRealImageCount} / {labUsage.globalRealImageLimit}</dd><small>{Math.max(0, labUsage.globalRealImageLimit - labUsage.globalRealImageCount)} disponibili</small></div><div><dt>Budget stimato</dt><dd>${labUsage.spentUsd.toFixed(2)} / ${labUsage.budgetUsd.toFixed(2)}</dd><small>${Math.max(0, labUsage.budgetUsd - labUsage.spentUsd).toFixed(2)} residui</small></div></dl>
                <p>Il conteggio include anche le richieste fallite: è lo stesso criterio usato dal limite server-side.</p>
            </section> : null}

            <section className="creature-transformation-lab__shared-input" aria-label="Input condiviso A/B">
                <header><span className="eyebrow">INPUT CONDIVISO</span><h2>Esperimento A/B</h2><p>Entrambe le pipeline partono dalla stessa visuale produttiva e dallo stesso target anatomico.</p></header>
                <section className="creature-transformation-lab__saved-lineage-reviews" aria-label="Review lineage-first salvate"><div><span className="eyebrow">REVIEW SALVATE</span><h3>Riapri un confronto A/B</h3><p>{savedLineageReviewsError ? `Archivio non disponibile: ${savedLineageReviewsError}` : savedLineageReviews.length ? 'Archivio condiviso: puoi caricare ogni review disponibile nel laboratorio.' : 'Non ci sono ancora review salvate nel laboratorio.'}</p></div>{savedLineageReviews.length ? <><label>Review<select value={selectedSavedLineageReviewId} onChange={(event) => setSelectedSavedLineageReviewId(event.target.value)}><option value="">Seleziona una review</option>{savedLineageReviews.map((review) => <option key={`${review.profileId}-${review.lineageRequestId}`} value={review.lineageRequestId}>Profilo {review.profileId.slice(0, 8)} · B {review.lineageRequestId.slice(0, 8)} · {new Date(review.updatedAt).toLocaleString('it-IT')}</option>)}</select></label><button type="button" onClick={() => void handleLoadSavedLineageReview()} disabled={!selectedSavedLineageReviewId || isLoadingSavedLineageReview}>{isLoadingSavedLineageReview ? 'Apertura...' : 'Apri review salvata'}</button></> : null}</section>
                <label>Source<select value={lineageSourceRequestId ? 'EXPERIMENTAL_SHARED_SOURCE' : selectedProductionSource ? 'SELECTED_PRODUCTIVE_SOURCE' : 'CURRENT_PROFILE_VISUAL'} disabled><option value="CURRENT_PROFILE_VISUAL">Ultima evoluzione attiva del profilo</option>{selectedProductionSource ? <option value="SELECTED_PRODUCTIVE_SOURCE">{selectedProductionSource.label}</option> : null}{lineageSourceRequestId ? <option value="EXPERIMENTAL_SHARED_SOURCE">Risultato sperimentale condiviso A/B</option> : null}</select></label>
                <label>Target anatomico<select value={lineageTargetId} onChange={(event) => setLineageTargetId(event.target.value as EvolutionTargetId)} disabled={isBusy}>{EVOLUTION_TARGETS.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select></label>
                <label className="creature-transformation-lab__cost-confirmation"><input type="checkbox" checked={realCostConfirmed} onChange={(event) => setRealCostConfirmed(event.target.checked)} disabled={isBusy} /> Confermo che entrambe le generazioni REAL possono avere un costo.</label>
                <section className="creature-transformation-lab__comparison-launch" aria-label="Avvio confronto A B">
                    <div><span className="eyebrow">AZIONE CONFRONTO</span><h3>Genera A/B</h3><p>Entrambe le richieste usano esattamente la sorgente e il target condivisi sopra.</p></div>
                    <label>Modalità di esecuzione<select value={comparisonLaunchMode} onChange={(event) => setComparisonLaunchMode(event.target.value as ComparisonLaunchMode)} disabled={isBusy}><option value="PARALLEL">Contemporanea — avvia A e B insieme</option><option value="SEQUENTIAL">In sequenza — avvia B solo dopo A</option></select></label>
                    <button type="button" className="primary-button" onClick={() => void handleGenerateComparison()} disabled={!realCostConfirmed || isBusy}>{isLaunchingComparison ? 'Avvio confronto…' : 'Genera confronto A/B'}</button>
                    {comparisonLaunchMessage ? <p aria-live="polite">{comparisonLaunchMessage}</p> : null}
                </section>
                {EXPRESSIVE_CONCEPT_FRONTEND_ENABLED ? <section className="creature-transformation-lab__comparison-launch" aria-label="Calibrazione creativa della pipeline A">
                    <div><span className="eyebrow">CALIBRAZIONE A</span><h3>Controllo / espressiva</h3><p>Due pipeline A con stessa sorgente, target, trait e funzione. Cambia solo la policy creativa server-side.</p></div>
                    <p>Entrambe producono asset sperimentali non adottabili e consumano due generazioni REAL.</p>
                    <button type="button" className="primary-button" onClick={() => void handleGenerateConceptCalibration()} disabled={!realCostConfirmed || isBusy}>{isLaunchingCalibration ? 'Avvio calibrazione…' : 'Genera calibrazione A'}</button>
                </section> : null}
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
                {lineageSourceRequestId ? <p>Source sperimentale condivisa A/B: {lineageSourceRequestId} <button type="button" onClick={() => { setLineageSourceRequestId(null); setLineageSourcePreview(null); setLineageSourceChain([]); setSelectedProductionSource(null) }} disabled={isBusy}>Ripristina visuale canonica del profilo</button></p> : selectedProductionSource ? <p>Source produttiva selezionata: {selectedProductionSource.label}. <button type="button" onClick={() => setIsProductionCatalogOpen(true)} disabled={isBusy}>Cambia sorgente</button></p> : <p>Source: visuale canonica corrente, identica alla pipeline A.</p>}
                <label className="creature-transformation-lab__cost-confirmation"><input type="checkbox" checked={realCostConfirmed} onChange={(event) => setRealCostConfirmed(event.target.checked)} disabled={isBusy} /> Confermo che questa generazione REAL può avere un costo.</label>
                <div className="creature-transformation-lab__lineage-actions"><button type="button" className="primary-button" onClick={() => void handleGenerateLineageFirst()} disabled={!realCostConfirmed || isBusy}>Generate Lineage-first</button><small>Richiede allowlist server-side e protezioni REAL attive.</small></div>
            </section>

            {lineageError ? <section className="creature-transformation-lab__error" role="alert"><strong>Lineage-first experimental</strong><p>{lineageError.message}</p></section> : null}
            {savedLineageReviews.length ? <section className="creature-transformation-lab__saved-lineage-reviews" aria-label="Review lineage-first salvate"><div><span className="eyebrow">REVIEW SALVATE</span><h2>Riapri un confronto A/B</h2><p>Carica punteggi e risultati associati a una review precedentemente salvata.</p></div><label>Review<select value={selectedSavedLineageReviewId} onChange={(event) => setSelectedSavedLineageReviewId(event.target.value)}><option value="">Seleziona una review</option>{savedLineageReviews.map((review) => <option key={review.lineageRequestId} value={review.lineageRequestId}>B {review.lineageRequestId.slice(0, 8)} · {new Date(review.updatedAt).toLocaleString('it-IT')}</option>)}</select></label><button type="button" onClick={() => void handleLoadSavedLineageReview()} disabled={!selectedSavedLineageReviewId || isLoadingSavedLineageReview}>{isLoadingSavedLineageReview ? 'Apertura...' : 'Apri review salvata'}</button></section> : null}
            {calibrationControlRequest || calibrationExpressiveRequest ? <section className="creature-transformation-lab__comparison-workspace" aria-label="Calibrazione creativa della pipeline A" aria-live="polite">
                <article className="creature-transformation-lab__comparison-card creature-transformation-lab__comparison-card--source">
                    <header><span className="eyebrow">INPUT BLOCCATO</span><h2>Sorgente condivisa</h2></header>
                    <div className="creature-transformation-lab__comparison-source-context"><strong>Confronto controllato</strong><span>Il server risolve la stessa direzione per controllo ed espressiva.</span></div>
                    <figure className="creature-transformation-lab__experimental-image"><img src={comparisonSource.signedUrl} alt="Immagine di partenza condivisa dalla calibrazione A" /><figcaption>{comparisonSource.label}</figcaption></figure>
                </article>
                <article className="creature-transformation-lab__comparison-card creature-transformation-lab__comparison-card--current">
                    <header><span className="eyebrow">A · CONTROLLO</span><h2>Conservativa</h2></header>
                    {calibrationControlRequest ? <><p><strong>Request:</strong> {calibrationControlRequest.transformationRequestId} · {calibrationControlStatus?.requestPersistence.status ?? calibrationControlRequest.status}</p>{calibrationControlStatus?.result ? <figure className="creature-transformation-lab__experimental-image"><img src={calibrationControlStatus.result.signedUrl} alt="Risultato controllo conservativo" /><figcaption>{calibrationControlStatus.result.assetReadiness} — non adottabile</figcaption></figure> : null}{calibrationControlStatus?.error ? <div className="creature-transformation-lab__error" role="alert"><strong>{calibrationControlStatus.error.code}</strong><p>{calibrationControlStatus.error.message}</p></div> : null}<details className="creature-transformation-lab__prompt" open><summary>Prompt controllo</summary>{calibrationControlStatus?.prompt ? <><pre>{calibrationControlStatus.prompt.text}</pre><small>SHA-256: {shortHash(calibrationControlStatus.prompt.sha256)}</small></> : <p>Il prompt sarà disponibile al termine.</p>}</details></> : <p className="creature-transformation-lab__comparison-empty">Il controllo non è stato avviato.</p>}
                </article>
                <article className="creature-transformation-lab__comparison-card creature-transformation-lab__comparison-card--lineage">
                    <header><span className="eyebrow">A · CANDIDATA</span><h2>Espressiva</h2></header>
                    {calibrationExpressiveRequest ? <><p><strong>Request:</strong> {calibrationExpressiveRequest.transformationRequestId} · {calibrationExpressiveStatus?.requestPersistence.status ?? calibrationExpressiveRequest.status}</p>{calibrationExpressiveStatus?.result ? <figure className="creature-transformation-lab__experimental-image"><img src={calibrationExpressiveStatus.result.signedUrl} alt="Risultato candidata espressiva" /><figcaption>{calibrationExpressiveStatus.result.assetReadiness} — non adottabile</figcaption></figure> : null}{calibrationExpressiveStatus?.error ? <div className="creature-transformation-lab__error" role="alert"><strong>{calibrationExpressiveStatus.error.code}</strong><p>{calibrationExpressiveStatus.error.message}</p></div> : null}<details className="creature-transformation-lab__prompt" open><summary>Prompt candidata espressiva</summary>{calibrationExpressiveStatus?.prompt ? <><pre>{calibrationExpressiveStatus.prompt.text}</pre><small>SHA-256: {shortHash(calibrationExpressiveStatus.prompt.sha256)}</small></> : <p>Il prompt sarà disponibile al termine.</p>}</details></> : <p className="creature-transformation-lab__comparison-empty">La candidata non è stata avviata.</p>}
                </article>
            </section> : null}
            {realRequestPersistence || lineageRequest ? (
                <section className="creature-transformation-lab__comparison-workspace" aria-label="Confronto risultati e prompt A B" aria-live="polite">
                    <article className="creature-transformation-lab__comparison-card creature-transformation-lab__comparison-card--source">
                        <header><span className="eyebrow">SOURCE CONDIVISA</span><h2>Immagine di partenza</h2></header>
                        <div className="creature-transformation-lab__comparison-source-context"><strong>Input identico per A e B</strong><span>Stessa sorgente, stesso target anatomico e stessa sessione di confronto.</span></div>
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
                            {lineageStatus?.result ? <><figure className="creature-transformation-lab__experimental-image"><img src={lineageStatus.result.signedUrl} alt="Risultato B lineage-first" /><figcaption>EXPERIMENT_ONLY — non adottabile</figcaption></figure><button type="button" onClick={() => { const selectedResult = lineageStatus?.result; if (!selectedResult) return; const nextSource = { requestId: lineageRequest.transformationRequestId, signedUrl: selectedResult.signedUrl }; setSelectedProductionSource(null); setLineageSourceRequestId(nextSource.requestId); setLineageSourcePreview(nextSource); setLineageSourceChain((current) => { const existingIndex = current.findIndex((step) => step.requestId === nextSource.requestId); return existingIndex >= 0 ? current.slice(0, existingIndex + 1) : [...current, nextSource] }) }}>Use as next shared A/B source</button></> : null}
                            {lineageStatus?.error ? <div className="creature-transformation-lab__error" role="alert"><strong>{lineageStatus.error.code}</strong><p>{lineageStatus.error.message}</p><p>La generazione B è terminata con errore; non è in corso.</p></div> : null}
                            {!lineageStatus?.result && !lineageStatus?.error ? <p>Generazione B in corso…</p> : null}
                            <details className="creature-transformation-lab__prompt" open><summary>Prompt inviato a B</summary>{lineageStatus?.prompt ? <><pre>{lineageStatus.prompt.text}</pre><small>SHA-256: {shortHash(lineageStatus.prompt.sha256)}</small></> : <p>Il prompt sarà disponibile al termine della richiesta B. Le richieste precedenti a questo aggiornamento non lo contengono.</p>}</details>
                            <details><summary>Lineage inviato</summary><pre>{formatJson(lineage)}</pre></details>
                            {lineageStatus?.result ? <fieldset className="creature-transformation-lab__review"><legend>Review A/B (1–5)</legend>{LINEAGE_REVIEW_KEYS.map((key) => <label key={key}>{key}<select value={lineageReview[key]} onChange={(event) => { setLineageReviewSaved(false); setLineageReview((current) => ({ ...current, [key]: Number(event.target.value) })) }}>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}</select></label>)}<label>Preferred result<select value={preferredResult} onChange={(event) => { setLineageReviewSaved(false); setPreferredResult(event.target.value as typeof preferredResult) }}><option value="CURRENT">CURRENT</option><option value="LINEAGE_FIRST">LINEAGE_FIRST</option><option value="NONE">NONE</option></select></label><button type="button" onClick={() => void handleSaveLineageReview()}>Salva review A/B</button>{lineageReviewSaved ? <p>Review A/B salvata.</p> : null}</fieldset> : null}
                        </> : <p className="creature-transformation-lab__comparison-empty">Avvia “Generate Lineage-first” per popolare questo lato del confronto.</p>}
                    </article>
                    {lineageReviewPanel}
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
