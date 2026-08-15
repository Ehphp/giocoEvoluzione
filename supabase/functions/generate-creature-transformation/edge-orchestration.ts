import type {
    CreatureTransformationApiResponse,
    CreatureTransformationErrorResponse,
    GenerateImageAcceptedResponse,
    GenerateImageApiResponse,
    SubmitBackgroundRemovalCandidateResponse,
    ListVisualBackgroundCleanupResponse,
    SubmitVisualBackgroundCleanupResponse,
    CreatureVisualProgressResponse,
    CurrentCreatureVisualApiResponse,
    GameCreatureVisualsResponse,
    AdoptCreatureTransformationResponse,
    TransformationRequestStatusResponse,
    CreatureTransformationLabUsageResponse,
    GeneratedImageCatalogResponse,
} from '../../../shared/creature-transformations/api-contracts.ts'
import type { CreatureIdentityResolver, GenerateUnlockedTransformationRequest, ResolvedCreatureSource } from '../../../shared/creature-transformations/contracts.ts'
import { ImageValidator, sha256Hex } from '../../../shared/creature-transformations/image-validator.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from '../../../shared/creature-transformations/render-specifications.ts'
import type { TransformationRequestIdempotencyStatus, TransformationRequestPersistence, TransformationRequestStatusPersistence } from '../../../shared/creature-transformations/request-persistence.ts'
import { buildFluxEvolutionPlan, EvolutionPlanError, type FluxEvolutionPlan } from '../../../shared/creature-transformations/flux-evolution/evolution-plan.ts'
import { isFluxEvolutionSnapshot, readFluxSnapshotCapability } from '../../../shared/creature-transformations/flux-evolution/micro-concept.ts'
import { resolveCanonicalBodyPlan } from '../../../shared/creature-transformations/flux-evolution/body-plan-registry.ts'
import type { VisualTraitId } from '../../../shared/creature-transformations/visual-traits.ts'
import type { PreviousCreatureTransformationSummary } from '../../../shared/creature-transformations/creature-visual-versions.ts'
import type { CreatureTransformationLabPolicy } from './lab-policy.ts'
import { FalFluxImageProvider, FalFluxImageProviderError } from './fal-flux-image-provider.ts'
import { FluxMicroConceptGenerator, FluxMicroConceptGeneratorError } from './flux-micro-concept-generator.ts'
import { FLUX_MINIMAL_PROMPT_TEMPLATE_VERSION, FluxImageGenerationServiceError, generateFluxImageForAuthenticatedProfile } from './flux-image-generation-service.ts'
import { parseAdoptCreatureTransformationRequest, parseGenerateUnlockedTransformationRequest, parseGenerateFluxEvolutionChainStepRequest, parseGetCreatureTransformationLabUsageRequest, parseGetGeneratedImageCatalogRequest, parseGetCreatureVisualProgressRequest, parseGetCurrentCreatureVisualRequest, parseGetGameCreatureVisualsRequest, parseGetTransformationRequestStatusRequest, parseListVisualBackgroundCleanupRequest, parseRollbackCreatureVisualVersionRequest, parseSelectCreatureVisualProgressTrackRequest, parseSubmitBackgroundRemovalCandidateRequest, parseSubmitVisualBackgroundCleanupRequest } from './request-validation.ts'
import {
    CreatureTransformationRequestRepositoryError,
    type CreatureTransformationRequestRecord,
    type CreatureTransformationRequestRepository,
    type RequestReservationResult,
} from './creature-transformation-request-repository.ts'
import { getSafeDatabaseLookupCode } from './database-lookup-diagnostics.ts'
import {
    CreatureTransformationStorageError,
    type SupabaseCreatureTransformationStorageAdapter,
} from './supabase-creature-transformation-storage.ts'
import { CreatureIdentityResolutionError } from './supabase-creature-identity-resolver.ts'
import { CreatureVisualProgressionRepositoryError, type StoredVisualVersion, SupabaseCreatureVisualProgressionRepository } from './creature-visual-progression-repository.ts'

type BackgroundTaskScheduler = (task: Promise<void>) => void

export type CreatureTransformationEdgeOrchestrationInput = Readonly<{
    profileId: string | null
    canGenerateImages?: boolean
    requestId: string
    body: unknown
    policy: CreatureTransformationLabPolicy
    resolver: CreatureIdentityResolver
    storage: SupabaseCreatureTransformationStorageAdapter
    repository: CreatureTransformationRequestRepository
    visualRepository: SupabaseCreatureVisualProgressionRepository
    createFluxMicroConceptGenerator?: () => FluxMicroConceptGenerator
    createFalFluxImageProvider?: () => FalFluxImageProvider
    deferBackgroundTask?: BackgroundTaskScheduler
    validator?: ImageValidator
}>

type FailureDetails = Readonly<{
    code: string
    message: string
    problems?: CreatureTransformationErrorResponse['problems']
}>

function toPersistence(record: CreatureTransformationRequestRecord, idempotencyStatus: TransformationRequestIdempotencyStatus): TransformationRequestPersistence {
    return {
        transformationRequestId: record.id,
        idempotencyStatus,
        status: record.status,
        ...(record.estimatedCostUsd === null ? {} : { estimatedCostUsd: record.estimatedCostUsd }),
        ...(record.actualCostUsd === null ? {} : { actualCostUsd: record.actualCostUsd }),
    }
}

function toStatusPersistence(record: CreatureTransformationRequestRecord): TransformationRequestStatusPersistence {
    return {
        transformationRequestId: record.id,
        status: record.status,
        createdAt: record.createdAt,
        ...(record.startedAt ? { startedAt: record.startedAt } : {}),
        ...(record.completedAt ? { completedAt: record.completedAt } : {}),
        ...(record.estimatedCostUsd === null ? {} : { estimatedCostUsd: record.estimatedCostUsd }),
        ...(record.actualCostUsd === null ? {} : { actualCostUsd: record.actualCostUsd }),
    }
}

function failure(requestId: string, code: string, message: string, problems?: CreatureTransformationErrorResponse['problems'], requestPersistence?: TransformationRequestPersistence): CreatureTransformationErrorResponse {
    return {
        success: false,
        requestId,
        code,
        message,
        ...(problems?.length ? { problems } : {}),
        ...(requestPersistence ? { requestPersistence } : {}),
    }
}

export function getCreatureTransformationFailureStatus(code: string): number {
    if (code === 'METHOD_NOT_ALLOWED') return 405
    if (code === 'UNAUTHENTICATED') return 401
    if (code === 'LAB_DISABLED' || code === 'LAB_NOT_ALLOWED' || code === 'CREATURE_NOT_OWNED' || code === 'IMAGE_GENERATION_NOT_ALLOWED' || code === 'VISUAL_PROGRESSION_DISABLED' || code === 'VISUAL_PRODUCTION_GENERATION_DISABLED' || code === 'VISUAL_ADOPTION_DISABLED' || code === 'BACKGROUND_CLEANUP_DISABLED' || code === 'BODY_PLAN_MUTATION_NOT_AUTHORIZED' || code === 'OPPONENT_VISUAL_NOT_AUTHORIZED') return 403
    if (code === 'CREATURE_NOT_FOUND' || code === 'SOURCE_IMAGE_NOT_FOUND' || code === 'REQUEST_NOT_FOUND' || code === 'VISUAL_TRACK_NOT_FOUND' || code === 'VISUAL_VERSION_NOT_FOUND' || code === 'CURRENT_VISUAL_UNAVAILABLE') return 404
    if (code === 'DAILY_LIMIT_REACHED' || code === 'DAILY_BUDGET_REACHED' || code === 'REAL_IMAGE_USER_LIMIT_REACHED' || code === 'REAL_IMAGE_USER_CONCURRENCY_REACHED' || code === 'REAL_IMAGE_COOLDOWN_ACTIVE' || code === 'REAL_IMAGE_GLOBAL_LIMIT_REACHED' || code === 'REAL_IMAGE_GLOBAL_CONCURRENCY_REACHED' || code === 'FAL_FLUX_RATE_LIMITED') return 429
    if (code === 'FAL_FLUX_NOT_CONFIGURED' || code === 'FLUX_CONCEPT_NOT_CONFIGURED') return 503
    if (code === 'OPERATION_NOT_IMPLEMENTED') return 501
    if (code === 'FAL_FLUX_TIMEOUT' || code === 'FLUX_CONCEPT_TIMEOUT') return 504
    if (code === 'REQUEST_ALREADY_IN_PROGRESS' || code === 'IDEMPOTENT_REQUEST_ALREADY_COMPLETED' || code === 'IDEMPOTENCY_KEY_REUSED' || code === 'REQUEST_PREVIOUSLY_FAILED' || code === 'REQUEST_STALE' || code === 'REQUEST_STATE_CONFLICT' || code === 'VISUAL_TRACK_ALREADY_ACTIVE' || code === 'VISUAL_TRACK_NOT_READY' || code === 'VISUAL_TRACK_STATE_CONFLICT' || code === 'VISUAL_GENERATION_ALREADY_RUNNING' || code === 'CREATURE_VISUAL_VERSION_CONFLICT' || code === 'CREATURE_VISUAL_ALREADY_ADOPTED' || code === 'VISUAL_GENERATION_NOT_ADOPTABLE' || code === 'BACKGROUND_CLEANUP_VERSION_CONFLICT') return 409
    if (code === 'BACKGROUND_REMOVAL_CANDIDATE_INVALID' || code === 'BACKGROUND_CLEANUP_CANDIDATE_INVALID' || code === 'PNG_ALPHA_COVERAGE_INVALID' || code === 'CREATURE_IDENTITY_NOT_SUPPORTED' || code === 'CREATURE_IDENTITY_CONFIGURATION_INVALID' || code === 'EVOLUTION_TARGET_NOT_AVAILABLE' || code === 'EVOLUTION_DIRECTION_UNAVAILABLE' || code === 'EXPERIMENTAL_SOURCE_NOT_AVAILABLE' || code === 'SOURCE_VISUAL_NOT_AVAILABLE' || code === 'FLUX_BODY_PLAN_UNSUPPORTED' || code === 'FLUX_SOURCE_IMAGE_INVALID' || code === 'FLUX_RESULT_IMAGE_INVALID' || code === 'FLUX_RESULT_IMAGE_UNCHANGED' || code === 'FLUX_SUBJECT_CROPPED' || code === 'FAL_FLUX_BAD_REQUEST' || code === 'FLUX_CONCEPT_RESPONSE_INVALID' || code === 'FLUX_REQUEST_COST_LIMIT_EXCEEDED') return 422
    if (code === 'STORAGE_UPLOAD_FAILED' || code === 'SIGNED_URL_FAILED' || code === 'FAL_FLUX_PROVIDER_ERROR' || code === 'FAL_FLUX_RESPONSE_INVALID' || code === 'FLUX_CONCEPT_PROVIDER_ERROR') return 502
    if (code === 'REQUEST_RESERVATION_FAILED' || code === 'REQUEST_PERSISTENCE_FAILED' || code === 'INTERNAL_ERROR' || code === 'CREATURE_LOOKUP_FAILED') return 500
    return 400
}

function mapThrownError(error: unknown): FailureDetails {
    if (error instanceof CreatureIdentityResolutionError) return { code: error.code, message: error.message }
    if (error instanceof CreatureTransformationStorageError) return { code: error.code, message: error.message }
    if (error instanceof CreatureTransformationRequestRepositoryError) return { code: error.code, message: error.message }
    if (error instanceof CreatureVisualProgressionRepositoryError) return { code: error.code, message: error.message }
    if (error instanceof EvolutionPlanError) return { code: error.code, message: error.message }
    if (error instanceof FluxImageGenerationServiceError) return { code: error.code, message: error.message, ...(error.problems ? { problems: error.problems } : {}) }
    if (error instanceof FluxMicroConceptGeneratorError || error instanceof FalFluxImageProviderError) return { code: error.code, message: error.message }
    return { code: 'INTERNAL_ERROR', message: 'Errore interno durante la trasformazione della creatura.' }
}

function generationAccessFailure(input: Pick<CreatureTransformationEdgeOrchestrationInput, 'profileId' | 'canGenerateImages' | 'policy'>): FailureDetails | null {
    if (input.canGenerateImages || (input.profileId !== null && input.policy.paidGenerationProfileIds.has(input.profileId))) return null
    return { code: 'IMAGE_GENERATION_NOT_ALLOWED', message: 'Il profilo autenticato non e autorizzato alla generazione a pagamento.' }
}

function labAccessFailure(input: Pick<CreatureTransformationEdgeOrchestrationInput, 'profileId' | 'policy'>): FailureDetails | null {
    if (!input.policy.enabled) return { code: 'LAB_DISABLED', message: 'Il laboratorio trasformazioni non e abilitato.' }
    if (!input.profileId || !input.policy.labProfileIds.has(input.profileId)) return { code: 'LAB_NOT_ALLOWED', message: 'Il profilo autenticato non e autorizzato al laboratorio FLUX.' }
    return null
}

function fluxConfigurationFailure(policy: CreatureTransformationLabPolicy): FailureDetails | null {
    const flux = policy.flux
    if (!flux.apiKey || !flux.microConceptApiKey || !flux.microConceptModel || flux.estimatedCostUsd === null || flux.maxEstimatedCostUsd === null) {
        return { code: 'FAL_FLUX_NOT_CONFIGURED', message: 'La pipeline FLUX non e configurata.' }
    }
    if (flux.estimatedCostUsd > flux.maxEstimatedCostUsd) return { code: 'FLUX_REQUEST_COST_LIMIT_EXCEEDED', message: 'Il costo stimato FLUX supera il limite consentito.' }
    return null
}

function realImageReservationLimits(policy: CreatureTransformationLabPolicy) {
    return {
        dailyRealImageLimit: policy.dailyRealImageLimit,
        globalDailyRealImageLimit: policy.globalDailyRealImageLimit,
        globalConcurrentRealImageLimit: policy.globalConcurrentRealImageLimit,
        realImageCooldownSeconds: policy.realImageCooldownSeconds,
        staleRequestSeconds: policy.staleRequestSeconds,
    }
}

function canonicalizeForFingerprint(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalizeForFingerprint)
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeForFingerprint((value as Record<string, unknown>)[key])]))
    }
    return value
}

async function requestFingerprint(value: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(canonicalizeForFingerprint(value)))
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function isStale(record: CreatureTransformationRequestRecord, staleRequestSeconds: number, now = Date.now()): boolean {
    if (record.status !== 'RUNNING' && record.status !== 'RESERVED') return false
    const startedAt = Date.parse(record.startedAt ?? record.createdAt)
    return Number.isFinite(startedAt) && now - startedAt > staleRequestSeconds * 1000
}

function reservationFailure(requestId: string, result: Exclude<RequestReservationResult, { outcome: 'CREATED' | 'EXISTING' }>): CreatureTransformationErrorResponse {
    if (result.outcome === 'CREATURE_NOT_OWNED') return failure(requestId, 'CREATURE_NOT_OWNED', 'La creatura non appartiene al profilo autenticato.')
    if (result.outcome === 'DAILY_LIMIT_REACHED') return failure(requestId, 'DAILY_LIMIT_REACHED', 'Hai raggiunto il limite giornaliero di richieste del laboratorio.')
    if (result.outcome === 'REAL_IMAGE_USER_LIMIT_REACHED') return failure(requestId, result.outcome, 'Hai raggiunto il limite giornaliero di immagini reali.')
    if (result.outcome === 'REAL_IMAGE_USER_CONCURRENCY_REACHED') return failure(requestId, result.outcome, 'Hai gia una generazione immagini reale in corso.')
    if (result.outcome === 'REAL_IMAGE_COOLDOWN_ACTIVE') return failure(requestId, result.outcome, 'Attendi il cooldown prima di una nuova immagine reale.')
    if (result.outcome === 'REAL_IMAGE_GLOBAL_LIMIT_REACHED') return failure(requestId, result.outcome, 'Il limite globale giornaliero immagini e stato raggiunto.')
    if (result.outcome === 'REAL_IMAGE_GLOBAL_CONCURRENCY_REACHED') return failure(requestId, result.outcome, 'Ci sono gia troppe immagini reali in elaborazione.')
    if (result.outcome === 'IDEMPOTENCY_KEY_REUSED') return failure(requestId, result.outcome, 'La idempotency key e gia associata a una richiesta diversa.')
    return failure(requestId, 'DAILY_BUDGET_REACHED', 'Il budget giornaliero del laboratorio non consente questa richiesta.')
}

async function markFailed(repository: CreatureTransformationRequestRepository, requestId: string, profileId: string, record: CreatureTransformationRequestRecord, idempotencyStatus: TransformationRequestIdempotencyStatus, details: FailureDetails): Promise<CreatureTransformationErrorResponse> {
    try {
        const failed = await repository.markFailed({ requestId: record.id, profileId, errorCode: details.code, errorMessage: details.message })
        return failure(requestId, details.code, details.message, details.problems, toPersistence(failed, idempotencyStatus))
    } catch (error) {
        const persistenceError = mapThrownError(error)
        return failure(requestId, persistenceError.code, persistenceError.message, persistenceError.problems, toPersistence(record, idempotencyStatus))
    }
}

function existingStateFailure(requestId: string, record: CreatureTransformationRequestRecord, policy: CreatureTransformationLabPolicy): CreatureTransformationErrorResponse | null {
    const persistence = toPersistence(record, 'EXISTING')
    if (record.status === 'SUCCEEDED') return null
    if (record.status === 'FAILED') return failure(requestId, 'REQUEST_PREVIOUSLY_FAILED', 'La richiesta con questa idempotency key era gia fallita; avvia un nuovo tentativo con una nuova key.', undefined, persistence)
    if (isStale(record, policy.staleRequestSeconds)) return failure(requestId, 'REQUEST_STALE', 'La richiesta precedente risulta bloccata; non viene riavviata automaticamente.', undefined, persistence)
    return failure(requestId, 'REQUEST_ALREADY_IN_PROGRESS', 'La richiesta con questa idempotency key e gia in corso.', undefined, persistence)
}

function acceptedGeneration(requestId: string, record: CreatureTransformationRequestRecord, idempotencyStatus: TransformationRequestIdempotencyStatus): GenerateImageAcceptedResponse {
    return { success: true, accepted: true, requestId, requestPersistence: toPersistence(record, idempotencyStatus) }
}

function visualProgressionReadAccessFailure(policy: CreatureTransformationLabPolicy): FailureDetails | null {
    if (!policy.visualProgression.enabled) return { code: 'VISUAL_PROGRESSION_DISABLED', message: 'La progressione visiva non e abilitata.' }
    return null
}

function visualProgressionAccessFailure(policy: CreatureTransformationLabPolicy, capability: 'GENERATE' | 'ADOPT'): FailureDetails | null {
    const readAccess = visualProgressionReadAccessFailure(policy)
    if (readAccess) return readAccess
    if (capability === 'GENERATE' && !policy.visualProgression.productionGenerationEnabled) return { code: 'VISUAL_PRODUCTION_GENERATION_DISABLED', message: 'La generazione visuale di produzione non e abilitata.' }
    if (capability === 'ADOPT' && !policy.visualProgression.adoptionEnabled) return { code: 'VISUAL_ADOPTION_DISABLED', message: 'L adozione visuale non e abilitata.' }
    return null
}

async function toCurrentVisualResponse(input: CreatureTransformationEdgeOrchestrationInput, version: StoredVisualVersion) {
    const displayAvailable = Boolean(version.displayAssetPath && version.displayAssetSha256 && version.displayMimeType === 'image/webp' && version.displayWidth && version.displayHeight)
    const assetPath = displayAvailable ? version.displayAssetPath! : version.assetPath
    const signed = await input.storage.createVisualVersionSignedUrl({ assetPath, isBaseVersion: !displayAvailable && version.visualTraitId === null })
    return {
        creatureId: version.creatureId, versionId: version.id, versionNumber: version.versionNumber,
        signedUrl: signed.signedUrl, expiresAt: signed.expiresAt, width: displayAvailable ? version.displayWidth! : version.width, height: displayAvailable ? version.displayHeight! : version.height,
        mimeType: displayAvailable ? 'image/webp' : version.mimeType, sha256: displayAvailable ? version.displayAssetSha256! : version.assetSha256, isBaseVersion: version.visualTraitId === null,
    } as const
}

async function toVisualHistoryResponse(input: CreatureTransformationEdgeOrchestrationInput, profileId: string, creatureId: string) {
    const versions = await input.visualRepository.listVisualHistory({ profileId, creatureId })
    return Promise.all(versions.map(async (version) => {
        const signed = await input.storage.createVisualVersionSignedUrl({ assetPath: version.assetPath, isBaseVersion: version.visualTraitId === null })
        return { id: version.id, versionNumber: version.versionNumber, visualTraitId: version.visualTraitId, evolutionTargetId: version.evolutionTargetId ?? null, evolutionFunction: version.evolutionFunction ?? null, conceptName: version.conceptName, signedUrl: signed.signedUrl, expiresAt: signed.expiresAt }
    }))
}

function toBodyPlanResponse(source: ResolvedCreatureSource): CreatureVisualProgressResponse['bodyPlan'] {
    return source.bodyPlan
        ? {
            id: source.bodyPlan.id,
            label: source.bodyPlan.label,
            availableEvolutionTargets: source.bodyPlan.evolutionTargets,
            adoptedBodyPlanMutationIds: source.adoptedBodyPlanMutationIds,
        }
        : null
}

async function restoreVisualTrackAfterFailure(input: CreatureTransformationEdgeOrchestrationInput, trackId: string, record: CreatureTransformationRequestRecord) {
    try {
        await input.visualRepository.completeGeneration({ profileId: input.profileId!, trackId, requestId: record.id, finalAsset: false })
    } catch (error) {
        console.error('Creature visual track restore failed', { requestId: input.requestId, transformationRequestId: record.id, code: mapThrownError(error).code })
    }
}

/**
 * The production evolution: progress track → resolver → body plan → anatomy contract → FLUX
 * micro-concept → FLUX prompt → fal.ai → validation → background-removal handover → adoption.
 */
async function runUnlockedTransformationTask(
    input: CreatureTransformationEdgeOrchestrationInput,
    request: GenerateUnlockedTransformationRequest,
    running: CreatureTransformationRequestRecord,
    source: ResolvedCreatureSource,
    plan: FluxEvolutionPlan,
): Promise<void> {
    try {
        const generated = await generateFluxImageForAuthenticatedProfile({
            profileId: input.profileId!, requestId: input.requestId, request,
            identity: source.identity, plan,
            source: { kind: 'CANONICAL', path: source.sourceImagePath, isBaseVersion: source.sourceIsBaseVersion },
            storage: input.storage,
            microConceptGenerator: input.createFluxMicroConceptGenerator!(), provider: input.createFalFluxImageProvider!(),
            promptTemplateVersion: input.policy.flux.promptTemplateVersion,
            ...(input.validator ? { validator: input.validator } : {}),
        })
        const completed = await input.repository.markSucceeded({
            requestId: running.id, profileId: input.profileId!, data: {
                provider: generated.generation.provider, model: generated.generation.model, providerRequestId: generated.generation.providerRequestId,
                sourceSha256: generated.sourceSha256, resultSha256: generated.result.sha256,
                resultPath: await input.storage.createRawResultObjectPath(input.profileId!, request.idempotencyKey), resultMimeType: generated.result.mimeType,
                resultWidth: generated.result.width, resultHeight: generated.result.height, generationLatencyMs: generated.generation.latencyMs,
                assetReadiness: 'EXPERIMENT_ONLY', validationWarnings: generated.validation.warnings,
                estimatedCostUsd: generated.generation.estimatedCostUsd ?? input.policy.flux.estimatedCostUsd ?? 0,
                promptTemplateVersion: generated.promptTemplateVersion, promptSha256: generated.promptSha256, conceptSnapshot: generated.conceptSnapshot,
            },
        })
        await input.visualRepository.markBackgroundRemovalPending({ profileId: input.profileId!, trackId: request.progressTrackId, requestId: completed.id })
    } catch (error) {
        const details = mapThrownError(error)
        try { await input.repository.markFailed({ requestId: running.id, profileId: input.profileId!, errorCode: details.code, errorMessage: details.message }) } catch { /* preserve original outcome */ }
        await restoreVisualTrackAfterFailure(input, request.progressTrackId, running)
    }
}

export async function orchestrateSelectCreatureVisualProgressTrack(input: CreatureTransformationEdgeOrchestrationInput): Promise<CreatureVisualProgressResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseSelectCreatureVisualProgressTrackRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const access = visualProgressionReadAccessFailure(input.policy)
    if (access) return failure(input.requestId, access.code, access.message)
    try {
        const source = await input.resolver.resolve({ profileId: input.profileId, creatureId: parsed.request.creatureId })
        if (!source.bodyPlan) return failure(input.requestId, 'FLUX_BODY_PLAN_UNSUPPORTED', 'La topologia anatomica della creatura non e configurata.')
        if (!source.bodyPlan.evolutionTargets.includes(parsed.request.evolutionTargetId)) {
            return failure(input.requestId, 'EVOLUTION_TARGET_NOT_AVAILABLE', 'Il target evolutivo non e disponibile per il body-plan corrente.')
        }
        const track = await input.visualRepository.selectTrack({ profileId: input.profileId, creatureId: parsed.request.creatureId, evolutionTargetId: parsed.request.evolutionTargetId, target: input.policy.visualProgression.winsRequired })
        const current = await input.visualRepository.getCurrentVersion({ profileId: input.profileId, creatureId: parsed.request.creatureId })
        if (!current) return failure(input.requestId, 'CURRENT_VISUAL_UNAVAILABLE', 'La visuale corrente non e disponibile.')
        return {
            success: true, requestId: input.requestId, track, lastExperiment: null, lastFailure: null,
            currentVersion: { id: current.id, versionNumber: current.versionNumber, visualTraitId: current.visualTraitId, conceptName: current.conceptName },
            history: await toVisualHistoryResponse(input, input.profileId, parsed.request.creatureId),
            bodyPlan: toBodyPlanResponse(source),
        }
    } catch (error) {
        const details = mapThrownError(error); return failure(input.requestId, details.code, details.message)
    }
}

export async function orchestrateGetCreatureVisualProgress(input: CreatureTransformationEdgeOrchestrationInput): Promise<CreatureVisualProgressResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseGetCreatureVisualProgressRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const access = visualProgressionReadAccessFailure(input.policy)
    if (access) return failure(input.requestId, access.code, access.message)
    try {
        const [initialTrack, current, source] = await Promise.all([
            input.visualRepository.getTrack({ profileId: input.profileId, creatureId: parsed.request.creatureId }),
            input.visualRepository.getCurrentVersion({ profileId: input.profileId, creatureId: parsed.request.creatureId }),
            input.resolver.resolve({ profileId: input.profileId, creatureId: parsed.request.creatureId }),
        ])
        if (!current) return failure(input.requestId, 'CURRENT_VISUAL_UNAVAILABLE', 'La visuale corrente non e disponibile.')
        const track = initialTrack?.status === 'GENERATED' && initialTrack.generatedRequestId
            ? await (async () => {
                const generated = await input.repository.getById({ profileId: input.profileId!, requestId: initialTrack.generatedRequestId! })
                return generated?.assetReadiness !== 'FINAL_ASSET'
                    ? input.visualRepository.restoreNonFinalGeneration({ profileId: input.profileId!, trackId: initialTrack.id, requestId: initialTrack.generatedRequestId! })
                    : initialTrack
            })()
            : initialTrack
        const [lastExperiment, lastFailure] = track ? await Promise.all([
            input.visualRepository.getLatestExperiment({ profileId: input.profileId, trackId: track.id }),
            input.visualRepository.getLatestFailure({ profileId: input.profileId, trackId: track.id }),
        ]) : [null, null]
        return {
            success: true, requestId: input.requestId, track, lastExperiment, lastFailure: track?.status === 'READY' ? lastFailure : null,
            currentVersion: { id: current.id, versionNumber: current.versionNumber, visualTraitId: current.visualTraitId, conceptName: current.conceptName },
            history: await toVisualHistoryResponse(input, input.profileId, parsed.request.creatureId),
            bodyPlan: toBodyPlanResponse(source),
        }
    } catch (error) { const details = mapThrownError(error); return failure(input.requestId, details.code, details.message) }
}

export async function orchestrateGetCurrentCreatureVisual(input: CreatureTransformationEdgeOrchestrationInput): Promise<CurrentCreatureVisualApiResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseGetCurrentCreatureVisualRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const access = visualProgressionReadAccessFailure(input.policy)
    if (access) return failure(input.requestId, access.code, access.message)
    try {
        const version = await input.visualRepository.getCurrentVersion({ profileId: input.profileId, creatureId: parsed.request.creatureId })
        if (!version) return failure(input.requestId, 'CURRENT_VISUAL_UNAVAILABLE', 'La visuale corrente non e disponibile.')
        return { success: true, requestId: input.requestId, visual: await toCurrentVisualResponse(input, version) }
    } catch (error) { const details = mapThrownError(error); return failure(input.requestId, details.code, details.message) }
}

export async function orchestrateGetGameCreatureVisuals(input: CreatureTransformationEdgeOrchestrationInput): Promise<GameCreatureVisualsResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseGetGameCreatureVisualsRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const access = visualProgressionReadAccessFailure(input.policy)
    if (access) return failure(input.requestId, access.code, access.message)
    try {
        const participants = await input.visualRepository.listGameHumanParticipants(parsed.request.gameId)
        const me = participants.find((participant) => participant.profileId === input.profileId)
        if (!me) return failure(input.requestId, 'OPPONENT_VISUAL_NOT_AUTHORIZED', 'Non sei un partecipante autorizzato alla partita.')
        const opponent = participants.find((participant) => participant.profileId !== input.profileId) ?? null
        const ownVersion = await input.visualRepository.getCurrentVersion({ profileId: me.profileId, creatureId: me.creatureId })
        if (!ownVersion) return failure(input.requestId, 'CURRENT_VISUAL_UNAVAILABLE', 'La visuale corrente non e disponibile.')
        const opponentVersion = opponent ? await input.visualRepository.getCurrentVersion({ profileId: opponent.profileId, creatureId: opponent.creatureId }) : null
        return { success: true, requestId: input.requestId, player: await toCurrentVisualResponse(input, ownVersion), opponent: opponentVersion ? await toCurrentVisualResponse(input, opponentVersion) : null }
    } catch (error) { const details = mapThrownError(error); return failure(input.requestId, details.code, details.message) }
}

export async function orchestrateGenerateUnlockedTransformation(input: CreatureTransformationEdgeOrchestrationInput): Promise<GenerateImageAcceptedResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseGenerateUnlockedTransformationRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const access = visualProgressionAccessFailure(input.policy, 'GENERATE')
    if (access) return failure(input.requestId, access.code, access.message)
    const generationAccess = generationAccessFailure(input)
    if (generationAccess) return failure(input.requestId, generationAccess.code, generationAccess.message)
    const configuration = fluxConfigurationFailure(input.policy)
    if (configuration) return failure(input.requestId, configuration.code, configuration.message)
    try {
        const [track, source] = await Promise.all([
            input.visualRepository.getTrack({ profileId: input.profileId, creatureId: parsed.request.creatureId }),
            input.resolver.resolve({ profileId: input.profileId, creatureId: parsed.request.creatureId }),
        ])
        if (!track || track.id !== parsed.request.progressTrackId) return failure(input.requestId, 'VISUAL_TRACK_NOT_FOUND', 'Il percorso visuale non e disponibile.')
        if (track.status === 'GENERATING') return failure(input.requestId, 'VISUAL_GENERATION_ALREADY_RUNNING', 'La generazione visuale e gia in corso.')
        if (track.status !== 'READY') return failure(input.requestId, 'VISUAL_TRACK_NOT_READY', 'Il percorso deve essere sbloccato prima della generazione.')
        if (!track.evolutionTargetId) return failure(input.requestId, 'VISUAL_TRACK_STATE_CONFLICT', 'Il percorso visuale non ha un target evolutivo.')
        if (!source.bodyPlan) return failure(input.requestId, 'FLUX_BODY_PLAN_UNSUPPORTED', 'La topologia anatomica della creatura non e configurata.')
        // Normal gameplay never carries a structural mutation request: the capability is only
        // reachable when the server policy enables it.
        const plan = buildFluxEvolutionPlan({
            bodyPlan: source.bodyPlan,
            evolutionTargetId: track.evolutionTargetId,
            previousTransformations: source.previousTransformations,
            seed: parsed.request.idempotencyKey,
            bodyPlanMutationEnabled: input.policy.bodyPlanMutation.enabled,
            adoptedBodyPlanMutationIds: source.adoptedBodyPlanMutationIds,
        })
        const resolvedTrack = await input.visualRepository.resolveTrackTrait({ profileId: input.profileId, creatureId: parsed.request.creatureId, trackId: track.id, visualTraitId: plan.visualTraitId })
        if (!resolvedTrack.visualTraitId) return failure(input.requestId, 'VISUAL_TRACK_STATE_CONFLICT', 'Il percorso non ha una direzione funzionale risolvibile.')
        const fingerprint = await requestFingerprint({ operation: parsed.request.operation, creatureId: parsed.request.creatureId, progressTrackId: parsed.request.progressTrackId, visualTraitId: plan.visualTraitId, evolutionTargetId: plan.evolutionTargetId, capability: plan.capability, sourceVisualVersionId: source.currentVisualVersionId, idempotencyKey: parsed.request.idempotencyKey })
        const reservation = await input.repository.reserve({
            profileId: input.profileId, creatureId: parsed.request.creatureId, idempotencyKey: parsed.request.idempotencyKey,
            operation: 'GENERATE_UNLOCKED_TRANSFORMATION', visualTraitId: plan.visualTraitId, intensity: 2, imageProviderMode: 'REAL',
            estimatedCostUsd: input.policy.flux.estimatedCostUsd ?? 0,
            dailyRequestLimit: input.policy.dailyRequestLimit, dailyBudgetUsd: input.policy.dailyBudgetUsd,
            requestFingerprint: fingerprint, ...realImageReservationLimits(input.policy),
            visualProgressTrackId: resolvedTrack.id, sourceVisualVersionId: source.currentVisualVersionId,
            evolutionTargetId: plan.evolutionTargetId, evolutionFunction: plan.evolutionFunction,
        })
        if (reservation.outcome !== 'CREATED' && reservation.outcome !== 'EXISTING') return reservationFailure(input.requestId, reservation)
        if (reservation.record.operation !== 'GENERATE_UNLOCKED_TRANSFORMATION') return failure(input.requestId, 'REQUEST_STATE_CONFLICT', 'La idempotency key appartiene a un operazione diversa.')
        if (reservation.outcome === 'EXISTING') {
            const existing = existingStateFailure(input.requestId, reservation.record, input.policy)
            return existing ?? failure(input.requestId, 'IDEMPOTENT_REQUEST_ALREADY_COMPLETED', 'Questa generazione visuale e gia stata completata; avvia un nuovo tentativo.', undefined, toPersistence(reservation.record, 'EXISTING'))
        }
        let startedTrack
        try {
            startedTrack = await input.visualRepository.startGeneration({ profileId: input.profileId, creatureId: parsed.request.creatureId, trackId: resolvedTrack.id, requestId: reservation.record.id })
        } catch (error) {
            try { await input.repository.markFailed({ requestId: reservation.record.id, profileId: input.profileId, errorCode: 'VISUAL_TRACK_STATE_CONFLICT', errorMessage: 'Il percorso visuale non puo iniziare la generazione.' }) } catch { /* the track remains authoritative */ }
            throw error
        }
        if (startedTrack.status !== 'GENERATING') return failure(input.requestId, 'VISUAL_TRACK_STATE_CONFLICT', 'Il percorso visuale non puo iniziare la generazione.')
        let running: CreatureTransformationRequestRecord
        try {
            running = await input.repository.markRunning({ requestId: reservation.record.id, profileId: input.profileId })
        } catch (error) {
            await restoreVisualTrackAfterFailure(input, resolvedTrack.id, reservation.record)
            const details = mapThrownError(error)
            return failure(input.requestId, details.code, details.message)
        }
        if (!input.deferBackgroundTask || !input.createFluxMicroConceptGenerator || !input.createFalFluxImageProvider) {
            try { await input.repository.markFailed({ requestId: running.id, profileId: input.profileId, errorCode: 'FAL_FLUX_NOT_CONFIGURED', errorMessage: 'La generazione visuale non e disponibile.' }) } catch { /* preserve the safe track restore */ }
            await restoreVisualTrackAfterFailure(input, resolvedTrack.id, running)
            return failure(input.requestId, 'FAL_FLUX_NOT_CONFIGURED', 'La generazione visuale non e disponibile.')
        }
        input.deferBackgroundTask(runUnlockedTransformationTask(input, parsed.request, running, source, plan))
        return acceptedGeneration(input.requestId, running, 'CREATED')
    } catch (error) { const details = mapThrownError(error); return failure(input.requestId, details.code, details.message) }
}

/**
 * A single, observable FLUX job for the Lab chain simulator. It runs the production pipeline and
 * deliberately reserves an experimental request only: no visual track is opened or mutated. This
 * is where the structural `BODY_PLAN_MUTATION` capability can be exercised end to end.
 */
export async function orchestrateGenerateFluxEvolutionChainStep(input: CreatureTransformationEdgeOrchestrationInput): Promise<GenerateImageApiResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseGenerateFluxEvolutionChainStepRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const labAccess = labAccessFailure(input)
    if (labAccess) return failure(input.requestId, labAccess.code, labAccess.message)
    const generationAccess = generationAccessFailure(input)
    if (generationAccess) return failure(input.requestId, generationAccess.code, generationAccess.message)
    const configuration = fluxConfigurationFailure(input.policy)
    if (configuration) return failure(input.requestId, configuration.code, configuration.message)
    if (!input.deferBackgroundTask || !input.createFluxMicroConceptGenerator || !input.createFalFluxImageProvider) return failure(input.requestId, 'FAL_FLUX_NOT_CONFIGURED', 'La pipeline FLUX non e disponibile.')

    try {
        const source = await input.resolver.resolve({ profileId: input.profileId, creatureId: parsed.request.creatureId })
        const selectedSourceVersion = parsed.request.sourceVisualVersionId
            ? await input.visualRepository.getVersion({ profileId: input.profileId, creatureId: parsed.request.creatureId, versionId: parsed.request.sourceVisualVersionId })
            : null
        if (parsed.request.sourceVisualVersionId && (!selectedSourceVersion || selectedSourceVersion.status === 'REVOKED')) {
            return failure(input.requestId, 'SOURCE_VISUAL_NOT_AVAILABLE', 'La visuale produttiva selezionata non e disponibile.')
        }
        // A Lab chain must describe the selected source's history, never transformations that
        // happened after it. This also makes structural topology match the selected visual.
        const sourceVersionNumber = selectedSourceVersion?.versionNumber ?? source.currentVersionNumber
        const sourceHistory = selectedSourceVersion
            ? source.previousTransformations.filter((entry) => entry.versionNumber <= sourceVersionNumber)
            : source.previousTransformations
        const historyRecords = await Promise.all(parsed.request.previousStepRequestIds.map((requestId) => input.repository.getById({ profileId: input.profileId!, requestId })))
        const finalizedSteps = historyRecords.flatMap((record) => (
            record && record.creatureId === parsed.request.creatureId && record.status === 'SUCCEEDED' && record.assetReadiness === 'FINAL_ASSET' && isFluxEvolutionSnapshot(record.conceptSnapshot)
                ? [{ record, snapshot: record.conceptSnapshot }]
                : []
        ))
        if (finalizedSteps.length !== historyRecords.length) {
            return failure(input.requestId, 'EXPERIMENTAL_SOURCE_NOT_AVAILABLE', 'Lo storico FLUX temporaneo non e disponibile o non e finalizzato.')
        }
        // A chain step reads its own steps as adopted lineage, so the Lab reproduces exactly what
        // production would see after those generations had been adopted.
        const chainHistory: PreviousCreatureTransformationSummary[] = finalizedSteps.map(({ record, snapshot }, index) => ({
            versionNumber: sourceVersionNumber + index + 1,
            visualTraitId: record.visualTraitId as VisualTraitId,
            conceptName: snapshot.conceptName,
            evolutionTargetId: snapshot.evolutionTargetId,
            evolutionFunction: snapshot.evolutionFunction,
            mutationIdea: snapshot.mutationIdea,
            ...(readFluxSnapshotCapability(snapshot) === 'BODY_PLAN_MUTATION' && snapshot.bodyPlanMutationId ? { bodyPlanMutationId: snapshot.bodyPlanMutationId } : {}),
        }))
        const previousTransformations = [...sourceHistory, ...chainHistory]
        const adoptedBodyPlanMutationIds = previousTransformations.flatMap((entry) => entry.bodyPlanMutationId ? [entry.bodyPlanMutationId] : [])
        const bodyPlan = resolveCanonicalBodyPlan({ baseCreatureKey: source.identity.baseCreatureKey, adoptedBodyPlanMutationIds })
        if (!bodyPlan) return failure(input.requestId, 'FLUX_BODY_PLAN_UNSUPPORTED', 'La topologia anatomica della creatura non e configurata.')

        const lastHistoryRequestId = parsed.request.previousStepRequestIds.at(-1)
        if (parsed.request.experimentalSourceRequestId && parsed.request.experimentalSourceRequestId !== lastHistoryRequestId) return failure(input.requestId, 'EXPERIMENTAL_SOURCE_NOT_AVAILABLE', 'La sorgente deve essere l ultimo asset finale della catena.')
        if (!parsed.request.experimentalSourceRequestId && parsed.request.previousStepRequestIds.length) return failure(input.requestId, 'EXPERIMENTAL_SOURCE_NOT_AVAILABLE', 'Una catena con storico deve usare il suo ultimo asset finale come sorgente.')

        let stepSource: { kind: 'CANONICAL' | 'EXPERIMENTAL' | 'VISUAL', path: string, isBaseVersion?: boolean } = {
            kind: 'CANONICAL', path: source.sourceImagePath, isBaseVersion: source.sourceIsBaseVersion,
        }
        if (parsed.request.experimentalSourceRequestId) {
            const experimental = finalizedSteps.at(-1)!.record
            if (!experimental.resultPath) return failure(input.requestId, 'EXPERIMENTAL_SOURCE_NOT_AVAILABLE', 'L asset finale precedente non e recuperabile.')
            stepSource = { kind: 'EXPERIMENTAL', path: experimental.resultPath }
        } else if (selectedSourceVersion) {
            stepSource = { kind: 'VISUAL', path: selectedSourceVersion.assetPath, isBaseVersion: selectedSourceVersion.visualTraitId === null }
        }

        const plan = buildFluxEvolutionPlan({
            bodyPlan,
            evolutionTargetId: parsed.request.evolutionTargetId,
            previousTransformations,
            seed: parsed.request.idempotencyKey,
            bodyPlanMutationEnabled: input.policy.bodyPlanMutation.enabled,
            ...(parsed.request.bodyPlanMutationId ? { requestedBodyPlanMutationId: parsed.request.bodyPlanMutationId } : {}),
            adoptedBodyPlanMutationIds,
        })

        let reservation: RequestReservationResult
        try {
            reservation = await input.repository.reserve({
                profileId: input.profileId, creatureId: parsed.request.creatureId, idempotencyKey: parsed.request.idempotencyKey,
                operation: 'GENERATE_UNLOCKED_TRANSFORMATION', imageProviderMode: 'REAL', visualTraitId: plan.visualTraitId,
                intensity: 2, evolutionTargetId: plan.evolutionTargetId, evolutionFunction: plan.evolutionFunction,
                estimatedCostUsd: input.policy.flux.estimatedCostUsd ?? undefined,
                dailyRequestLimit: input.policy.dailyRequestLimit, dailyBudgetUsd: input.policy.dailyBudgetUsd,
                requestFingerprint: await requestFingerprint(parsed.request), ...realImageReservationLimits(input.policy),
            })
        } catch (error) { const details = mapThrownError(error); return failure(input.requestId, details.code, details.message) }
        if (reservation.outcome !== 'CREATED' && reservation.outcome !== 'EXISTING') return reservationFailure(input.requestId, reservation)
        if (reservation.outcome === 'EXISTING') {
            if (reservation.record.status === 'SUCCEEDED') return failure(input.requestId, 'IDEMPOTENT_REQUEST_ALREADY_COMPLETED', 'Questo step FLUX e gia stato completato; leggi lo stato della richiesta.', undefined, toPersistence(reservation.record, 'EXISTING'))
            if (!isStale(reservation.record, input.policy.staleRequestSeconds)) return acceptedGeneration(input.requestId, reservation.record, 'EXISTING')
            return existingStateFailure(input.requestId, reservation.record, input.policy)!
        }
        let running: CreatureTransformationRequestRecord
        try { running = await input.repository.markRunning({ requestId: reservation.record.id, profileId: input.profileId }) } catch (error) { return markFailed(input.repository, input.requestId, input.profileId, reservation.record, 'CREATED', mapThrownError(error)) }
        input.deferBackgroundTask((async () => {
            try {
                const generated = await generateFluxImageForAuthenticatedProfile({
                    profileId: input.profileId!, requestId: input.requestId, request: parsed.request,
                    identity: source.identity, plan, source: stepSource, storage: input.storage,
                    microConceptGenerator: input.createFluxMicroConceptGenerator!(), provider: input.createFalFluxImageProvider!(),
                    promptTemplateVersion: parsed.request.promptTemplateVersion ?? FLUX_MINIMAL_PROMPT_TEMPLATE_VERSION,
                    ...(input.validator ? { validator: input.validator } : {}),
                })
                await input.repository.markSucceeded({
                    requestId: running.id, profileId: input.profileId!, data: {
                        provider: generated.generation.provider, model: generated.generation.model, providerRequestId: generated.generation.providerRequestId,
                        sourceSha256: generated.sourceSha256, resultSha256: generated.result.sha256,
                        resultPath: await input.storage.createRawResultObjectPath(input.profileId!, parsed.request.idempotencyKey), resultMimeType: generated.result.mimeType,
                        resultWidth: generated.result.width, resultHeight: generated.result.height, generationLatencyMs: generated.generation.latencyMs, assetReadiness: 'EXPERIMENT_ONLY',
                        validationWarnings: generated.validation.warnings, estimatedCostUsd: generated.generation.estimatedCostUsd ?? input.policy.flux.estimatedCostUsd ?? 0,
                        promptTemplateVersion: generated.promptTemplateVersion, promptSha256: generated.promptSha256, promptText: generated.prompt, conceptSnapshot: generated.conceptSnapshot,
                    }
                })
            } catch (error) {
                const details = mapThrownError(error)
                try { await input.repository.markFailed({ requestId: running.id, profileId: input.profileId!, errorCode: details.code, errorMessage: details.message }) } catch { /* preserve original failure */ }
            }
        })())
        return acceptedGeneration(input.requestId, running, 'CREATED')
    } catch (error) { const details = mapThrownError(error); return failure(input.requestId, details.code, details.message) }
}

function decodeBackgroundRemovalCandidate(base64: string): Uint8Array | null {
    if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null
    try {
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
        return bytes
    } catch {
        return null
    }
}

function isWebp(bytes: Uint8Array): boolean {
    return bytes.length >= 12
        && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
        && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
}

export async function orchestrateSubmitBackgroundRemovalCandidate(input: CreatureTransformationEdgeOrchestrationInput): Promise<SubmitBackgroundRemovalCandidateResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseSubmitBackgroundRemovalCandidateRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const bytes = decodeBackgroundRemovalCandidate(parsed.request.candidatePngBase64)
    if (!bytes) return failure(input.requestId, 'BACKGROUND_REMOVAL_CANDIDATE_INVALID', 'Il PNG elaborato non puo essere decodificato.')
    const displayBytes = parsed.request.displayAssetWebpBase64 ? decodeBackgroundRemovalCandidate(parsed.request.displayAssetWebpBase64) : null
    if (parsed.request.displayAssetWebpBase64 && (!displayBytes || !isWebp(displayBytes))) return failure(input.requestId, 'BACKGROUND_REMOVAL_CANDIDATE_INVALID', 'Il display asset WebP non e valido.')
    let record: CreatureTransformationRequestRecord | null
    try {
        record = await input.repository.getById({ profileId: input.profileId, requestId: parsed.request.transformationRequestId })
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message, details.problems)
    }
    if (!record) return failure(input.requestId, 'REQUEST_NOT_FOUND', 'La richiesta di trasformazione non e disponibile.')
    if (record.operation !== 'GENERATE_UNLOCKED_TRANSFORMATION' || record.status !== 'SUCCEEDED') {
        return failure(input.requestId, 'REQUEST_STATE_CONFLICT', 'La richiesta non e pronta per il PNG elaborato.')
    }
    // The candidate submission can be retried when its first HTTP response was
    // lost. Returning the already-final record also absorbs any duplicate from
    // a browser render that began before the in-flight guard was introduced.
    if (record.assetReadiness === 'FINAL_ASSET'
        && record.resultSha256
        && record.resultMimeType
        && record.resultWidth
        && record.resultHeight) {
        return {
            success: true, requestId: input.requestId, requestPersistence: toPersistence(record, 'EXISTING'),
            candidate: { assetReadiness: 'FINAL_ASSET', sha256: record.resultSha256, mimeType: record.resultMimeType, width: record.resultWidth, height: record.resultHeight, warnings: record.validationWarnings },
        }
    }
    if (record.assetReadiness !== 'EXPERIMENT_ONLY') {
        return failure(input.requestId, 'REQUEST_STATE_CONFLICT', 'La richiesta non e pronta per il PNG elaborato.')
    }
    const validation = await (input.validator ?? new ImageValidator()).validate({
        bytes, mimeType: 'image/png', sourceSha256: record.resultSha256 ?? undefined,
        renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION, requireAlphaCoverage: true, requireTransparentEdges: true,
    })
    if (!validation.valid) return failure(input.requestId, 'BACKGROUND_REMOVAL_CANDIDATE_INVALID', 'Il PNG elaborato non ha superato la validazione alpha.', validation.problems)
    try {
        const candidatePath = await input.storage.createCandidateObjectPath(input.profileId, record.id)
        await input.storage.saveBackgroundRemovalCandidate({ profileId: input.profileId, transformationRequestId: record.id, image: bytes })
        const displayAsset = displayBytes
            ? { path: await input.storage.createDisplayObjectPath(record.id), sha256: await sha256Hex(displayBytes), width: 512, height: 768 }
            : undefined
        if (displayBytes) await input.storage.saveDisplayAsset({ key: record.id, image: displayBytes })
        const finalized = await input.repository.finalizeBackgroundRemovalCandidate({
            requestId: record.id, profileId: input.profileId, candidatePath, candidateSha256: validation.metadata.sha256,
            candidateMimeType: validation.metadata.mimeType, candidateWidth: validation.metadata.width,
            candidateHeight: validation.metadata.height, validationWarnings: validation.warnings,
            ...(displayAsset ? { displayAsset } : {}),
        })
        return {
            success: true, requestId: input.requestId, requestPersistence: toPersistence(finalized, 'CREATED'),
            candidate: { assetReadiness: 'FINAL_ASSET', sha256: validation.metadata.sha256, mimeType: validation.metadata.mimeType, width: validation.metadata.width, height: validation.metadata.height, warnings: validation.warnings },
        }
    } catch (error) {
        const details = mapThrownError(error)
        const databaseCode = error instanceof CreatureTransformationRequestRepositoryError
            ? getSafeDatabaseLookupCode(error.cause)
            : 'UNKNOWN'
        console.error('Creature background-removal candidate finalization failed', {
            requestId: input.requestId,
            transformationRequestId: record.id,
            code: details.code,
            databaseCode,
        })
        const message = details.code === 'REQUEST_PERSISTENCE_FAILED'
            ? `${details.message} Diagnostica database: ${databaseCode}.`
            : details.message
        return failure(input.requestId, details.code, message, details.problems)
    }
}

function backgroundCleanupAccessFailure(policy: CreatureTransformationLabPolicy): FailureDetails | null {
    return policy.visualProgression.backgroundCleanupEnabled ? null : { code: 'BACKGROUND_CLEANUP_DISABLED', message: 'La pulizia batch delle visuali non e abilitata.' }
}

export async function orchestrateListVisualBackgroundCleanup(input: CreatureTransformationEdgeOrchestrationInput): Promise<ListVisualBackgroundCleanupResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseListVisualBackgroundCleanupRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const access = backgroundCleanupAccessFailure(input.policy)
    if (access) return failure(input.requestId, access.code, access.message)
    try {
        const versions = await input.visualRepository.listActiveVisualsForCleanup()
        const entries = await Promise.all(versions.map(async (version) => {
            const signed = await input.storage.createVisualVersionSignedUrl({ assetPath: version.assetPath, isBaseVersion: version.visualTraitId === null })
            return { visualVersionId: version.id, creatureId: version.creatureId, profileId: version.profileId, versionNumber: version.versionNumber, signedUrl: signed.signedUrl, expiresAt: signed.expiresAt }
        }))
        return { success: true, requestId: input.requestId, entries }
    } catch (error) { const details = mapThrownError(error); return failure(input.requestId, details.code, details.message) }
}

export async function orchestrateSubmitVisualBackgroundCleanup(input: CreatureTransformationEdgeOrchestrationInput): Promise<SubmitVisualBackgroundCleanupResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseSubmitVisualBackgroundCleanupRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const access = backgroundCleanupAccessFailure(input.policy)
    if (access) return failure(input.requestId, access.code, access.message)
    const bytes = decodeBackgroundRemovalCandidate(parsed.request.candidatePngBase64)
    if (!bytes) return failure(input.requestId, 'BACKGROUND_CLEANUP_CANDIDATE_INVALID', 'Il PNG ripulito non puo essere decodificato.')
    const displayBytes = parsed.request.displayAssetWebpBase64 ? decodeBackgroundRemovalCandidate(parsed.request.displayAssetWebpBase64) : null
    if (parsed.request.displayAssetWebpBase64 && (!displayBytes || !isWebp(displayBytes))) return failure(input.requestId, 'BACKGROUND_CLEANUP_CANDIDATE_INVALID', 'Il display asset WebP non e valido.')
    const validation = await (input.validator ?? new ImageValidator()).validate({
        bytes, mimeType: 'image/png', renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
        requireAlphaCoverage: true, requireTransparentEdges: true,
    })
    if (!validation.valid) return failure(input.requestId, 'BACKGROUND_CLEANUP_CANDIDATE_INVALID', 'Il PNG ripulito non ha superato la validazione alpha.', validation.problems)
    try {
        const assetPath = await input.storage.createCleanupObjectPath(parsed.request.visualVersionId)
        await input.storage.saveCleanedVisual({ visualVersionId: parsed.request.visualVersionId, image: bytes })
        const displayAsset = displayBytes
            ? { path: await input.storage.createDisplayObjectPath(parsed.request.visualVersionId), sha256: await sha256Hex(displayBytes), width: 512, height: 768 }
            : undefined
        if (displayBytes) await input.storage.saveDisplayAsset({ key: parsed.request.visualVersionId, image: displayBytes })
        const version = await input.visualRepository.promoteCleanedVisual({
            visualVersionId: parsed.request.visualVersionId, assetPath, assetSha256: validation.metadata.sha256,
            width: validation.metadata.width, height: validation.metadata.height,
            ...(displayAsset ? { displayAsset } : {}),
        })
        return { success: true, requestId: input.requestId, visualVersionId: version.id, creatureId: version.creatureId, versionNumber: version.versionNumber }
    } catch (error) { const details = mapThrownError(error); return failure(input.requestId, details.code, details.message, details.problems) }
}

/**
 * Adoption promotes the generated asset to the creature's active visual. When the adopted
 * generation carried a structural mutation, the canonical body plan of the creature changes with
 * it, so every later generation is contracted against the new topology.
 */
export async function orchestrateAdoptCreatureTransformation(input: CreatureTransformationEdgeOrchestrationInput): Promise<AdoptCreatureTransformationResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseAdoptCreatureTransformationRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const access = visualProgressionAccessFailure(input.policy, 'ADOPT')
    if (access) return failure(input.requestId, access.code, access.message)
    try {
        const version = await input.visualRepository.adopt({ profileId: input.profileId, creatureId: parsed.request.creatureId, trackId: parsed.request.progressTrackId, requestId: parsed.request.transformationRequestId, expectedCurrentVisualVersionId: parsed.request.expectedCurrentVisualVersionId })
        const source = await input.resolver.resolve({ profileId: input.profileId, creatureId: parsed.request.creatureId })
        return {
            success: true, requestId: input.requestId,
            version: { id: version.id, versionNumber: version.versionNumber, visualTraitId: version.visualTraitId, conceptName: version.conceptName },
            bodyPlanId: source.bodyPlan?.id ?? null,
        }
    } catch (error) { const details = mapThrownError(error); return failure(input.requestId, details.code, details.message) }
}

export async function orchestrateRollbackCreatureVisualVersion(input: CreatureTransformationEdgeOrchestrationInput): Promise<AdoptCreatureTransformationResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseRollbackCreatureVisualVersionRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const access = visualProgressionAccessFailure(input.policy, 'ADOPT')
    if (access) return failure(input.requestId, access.code, access.message)
    try {
        const version = await input.visualRepository.rollback({ profileId: input.profileId, creatureId: parsed.request.creatureId, targetVersionId: parsed.request.targetVersionId, expectedCurrentVisualVersionId: parsed.request.expectedCurrentVisualVersionId })
        const source = await input.resolver.resolve({ profileId: input.profileId, creatureId: parsed.request.creatureId })
        return {
            success: true, requestId: input.requestId,
            version: { id: version.id, versionNumber: version.versionNumber, visualTraitId: version.visualTraitId, conceptName: version.conceptName },
            bodyPlanId: source.bodyPlan?.id ?? null,
        }
    } catch (error) { const details = mapThrownError(error); return failure(input.requestId, details.code, details.message) }
}

export async function orchestrateGetTransformationRequestStatus(input: CreatureTransformationEdgeOrchestrationInput): Promise<TransformationRequestStatusResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseGetTransformationRequestStatusRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    let record: CreatureTransformationRequestRecord | null
    try {
        record = await input.repository.getById({ profileId: input.profileId, requestId: parsed.request.transformationRequestId })
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message, details.problems)
    }
    if (!record) return failure(input.requestId, 'REQUEST_NOT_FOUND', 'La richiesta di trasformazione non e disponibile.')

    const snapshot = isFluxEvolutionSnapshot(record.conceptSnapshot) ? record.conceptSnapshot : null
    const response: TransformationRequestStatusResponse = {
        success: true,
        requestId: input.requestId,
        requestPersistence: toStatusPersistence(record),
        ...(record.provider && record.model ? {
            generation: {
                provider: record.provider, model: record.model, ...(record.providerRequestId ? { providerRequestId: record.providerRequestId } : {}),
                ...(record.generationLatencyMs === null ? {} : { latencyMs: record.generationLatencyMs }),
                ...(record.estimatedCostUsd === null ? {} : { estimatedCostUsd: record.estimatedCostUsd }),
                ...(record.actualCostUsd === null ? {} : { actualCostUsd: record.actualCostUsd }),
            },
        } : {}),
        ...(record.assetReadiness === 'EXPERIMENT_ONLY' && record.promptText && record.promptSha256 ? { prompt: { text: record.promptText, sha256: record.promptSha256 } } : {}),
        ...(record.status === 'FAILED' && record.errorCode && record.errorMessage ? { error: { code: record.errorCode, message: record.errorMessage } } : {}),
        ...(record.visualProgressTrackId && record.sourceVisualVersionId && record.visualTraitId ? {
            productPreview: {
                progressTrackId: record.visualProgressTrackId, sourceVisualVersionId: record.sourceVisualVersionId,
                visualTraitId: record.visualTraitId,
                conceptName: snapshot?.conceptName ?? 'Evoluzione visuale',
                evolutionaryFunction: snapshot?.mutationIdea ?? 'Proposta visuale generata e validata dal server.',
                warnings: record.validationWarnings,
            },
        } : {}),
        ...(snapshot ? {
            fluxSnapshot: {
                conceptName: snapshot.conceptName, mutationIdea: snapshot.mutationIdea,
                evolutionTargetId: snapshot.evolutionTargetId, evolutionFunction: snapshot.evolutionFunction,
                capability: readFluxSnapshotCapability(snapshot),
                ...(snapshot.bodyPlanMutationId ? { bodyPlanMutationId: snapshot.bodyPlanMutationId } : {}),
                ...(snapshot.resultBodyPlanId ? { resultBodyPlanId: snapshot.resultBodyPlanId } : {}),
            },
        } : {}),
    }
    if (record.status !== 'SUCCEEDED') return response
    if (!record.resultPath || !record.resultSha256 || !record.resultMimeType || !record.resultWidth || !record.resultHeight) {
        return { ...response, error: { code: 'REQUEST_PERSISTENCE_FAILED', message: 'Il risultato persistito non e recuperabile.' } }
    }
    try {
        const signed = await input.storage.createResultSignedUrl(record.resultPath)
        const result = {
            signedUrl: signed.signedUrl, expiresAt: signed.expiresAt, width: record.resultWidth, height: record.resultHeight,
            mimeType: record.resultMimeType, sha256: record.resultSha256, assetReadiness: record.assetReadiness ?? 'FINAL_ASSET', warnings: record.validationWarnings,
        } as const
        return { ...response, result, ...(record.assetReadiness === 'EXPERIMENT_ONLY' ? { rawResult: { signedUrl: result.signedUrl, expiresAt: result.expiresAt, width: result.width, height: result.height, mimeType: result.mimeType, sha256: result.sha256 } } : {}) }
    } catch (error) {
        const details = mapThrownError(error)
        return { ...response, error: { code: details.code, message: details.message } }
    }
}

export async function orchestrateGetCreatureTransformationLabUsage(input: CreatureTransformationEdgeOrchestrationInput): Promise<CreatureTransformationLabUsageResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    if (!input.policy.enabled) return failure(input.requestId, 'LAB_DISABLED', 'Il laboratorio trasformazioni non e abilitato.')
    const parsed = parseGetCreatureTransformationLabUsageRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    try {
        const usage = await input.repository.getDailyUsage({ profileId: input.profileId })
        return {
            success: true,
            requestId: input.requestId,
            usage: {
                requestCount: usage.requestCount,
                requestLimit: input.policy.dailyRequestLimit,
                realImageCount: usage.realImageCount,
                realImageLimit: input.policy.dailyRealImageLimit,
                globalRealImageCount: usage.globalRealImageCount,
                globalRealImageLimit: input.policy.globalDailyRealImageLimit,
                spentUsd: usage.spentUsd,
                budgetUsd: input.policy.dailyBudgetUsd,
            },
        }
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message, details.problems)
    }
}

const GENERATED_IMAGE_CATALOG_PAGE_SIZE = 24

export async function orchestrateGetGeneratedImageCatalog(input: CreatureTransformationEdgeOrchestrationInput): Promise<GeneratedImageCatalogResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    if (!input.policy.enabled) return failure(input.requestId, 'LAB_DISABLED', 'Il laboratorio trasformazioni non e abilitato.')
    const parsed = parseGetGeneratedImageCatalogRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    try {
        const page = parsed.request.page ?? 0
        const records = await input.repository.listCompletedImageRecords({ profileId: input.profileId, offset: page * GENERATED_IMAGE_CATALOG_PAGE_SIZE, limit: GENERATED_IMAGE_CATALOG_PAGE_SIZE + 1 })
        const visibleRecords = records.slice(0, GENERATED_IMAGE_CATALOG_PAGE_SIZE)
        const entries = await Promise.all(visibleRecords.map(async (record) => {
            const signed = await input.storage.createResultSignedUrl(record.resultPath!)
            return {
                transformationRequestId: record.id,
                creatureId: record.creatureId,
                createdAt: record.createdAt,
                completedAt: record.completedAt,
                provider: record.provider,
                model: record.model,
                promptTemplateVersion: record.promptTemplateVersion,
                assetReadiness: record.assetReadiness,
                prompt: record.promptText ? { text: record.promptText, sha256: record.promptSha256 } : null,
                result: { signedUrl: signed.signedUrl, expiresAt: signed.expiresAt, mimeType: record.resultMimeType!, width: record.resultWidth!, height: record.resultHeight!, sha256: record.resultSha256! },
            }
        }))
        return { success: true, requestId: input.requestId, page, hasMore: records.length > GENERATED_IMAGE_CATALOG_PAGE_SIZE, entries }
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message, details.problems)
    }
}

export async function orchestrateCreatureTransformation(input: CreatureTransformationEdgeOrchestrationInput): Promise<CreatureTransformationApiResponse> {
    const operation = input.body && typeof input.body === 'object' && !Array.isArray(input.body) ? (input.body as { operation?: unknown }).operation : undefined
    if (operation === 'GENERATE_UNLOCKED_TRANSFORMATION') return orchestrateGenerateUnlockedTransformation(input)
    if (operation === 'GENERATE_FLUX_EVOLUTION_CHAIN_STEP') return orchestrateGenerateFluxEvolutionChainStep(input)
    if (operation === 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE') return orchestrateSubmitBackgroundRemovalCandidate(input)
    if (operation === 'LIST_VISUAL_BACKGROUND_CLEANUP') return orchestrateListVisualBackgroundCleanup(input)
    if (operation === 'SUBMIT_VISUAL_BACKGROUND_CLEANUP') return orchestrateSubmitVisualBackgroundCleanup(input)
    if (operation === 'GET_REQUEST_STATUS') return orchestrateGetTransformationRequestStatus(input)
    if (operation === 'GET_LAB_USAGE') return orchestrateGetCreatureTransformationLabUsage(input)
    if (operation === 'GET_GENERATED_IMAGE_CATALOG') return orchestrateGetGeneratedImageCatalog(input)
    if (operation === 'SELECT_VISUAL_PROGRESS_TRACK') return orchestrateSelectCreatureVisualProgressTrack(input)
    if (operation === 'GET_VISUAL_PROGRESS') return orchestrateGetCreatureVisualProgress(input)
    if (operation === 'GET_CURRENT_VISUAL') return orchestrateGetCurrentCreatureVisual(input)
    if (operation === 'GET_GAME_VISUALS') return orchestrateGetGameCreatureVisuals(input)
    if (operation === 'ADOPT_CREATURE_TRANSFORMATION') return orchestrateAdoptCreatureTransformation(input)
    if (operation === 'ROLLBACK_CREATURE_VISUAL_VERSION') return orchestrateRollbackCreatureVisualVersion(input)
    return failure(input.requestId, 'OPERATION_NOT_IMPLEMENTED', 'operation non e supportata.')
}
