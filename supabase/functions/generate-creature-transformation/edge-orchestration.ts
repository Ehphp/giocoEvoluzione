import type {
    CreatureTransformationApiResponse,
    CreatureTransformationErrorResponse,
    GenerateConceptApiResponse,
    GenerateImageAcceptedResponse,
    GenerateImageApiResponse,
    GenerateImageResponse,
    SubmitBackgroundRemovalCandidateResponse,
    ListVisualBackgroundCleanupResponse,
    SubmitVisualBackgroundCleanupResponse,
    GetBenchmarkResultsResponse,
    CreatureVisualProgressResponse,
    CurrentCreatureVisualApiResponse,
    GameCreatureVisualsResponse,
    AdoptCreatureTransformationResponse,
    SubmitExperimentReviewResponse,
    TransformationRequestStatusResponse,
} from '../../../shared/creature-transformations/api-contracts.ts'
import { CREATURE_TRANSFORMATION_BENCHMARK_PLAN, getCreatureTransformationBenchmarkCase, type CreatureTransformationBenchmarkCase } from '../../../shared/creature-transformations/benchmark-plan.ts'
import type { CreatureConceptGenerator } from '../../../shared/creature-transformations/concept-generator.ts'
import { CreatureConceptGenerationError } from '../../../shared/creature-transformations/concept-generator.ts'
import type { CreatureIdentityResolver, GenerateConceptRequest, GenerateImageRequest, GenerateUnlockedTransformationRequest } from '../../../shared/creature-transformations/contracts.ts'
import type { CreatureImageProvider } from '../../../shared/creature-transformations/image-generation.ts'
import { getEnabledCreatureImageGenerationProfile, type CreatureImageGenerationProfile } from '../../../shared/creature-transformations/image-generation-profiles.ts'
import { ImageValidator } from '../../../shared/creature-transformations/image-validator.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from '../../../shared/creature-transformations/render-specifications.ts'
import { MockCreatureConceptGenerator } from '../../../shared/creature-transformations/mock-concept-generator.ts'
import { classifyExperimentReview, summarizeCreatureTransformationBenchmark, type CreatureTransformationBenchmarkMetricRecord, type CreatureTransformationExperimentReview } from '../../../shared/creature-transformations/experiment-reviews.ts'
import { CREATURE_PROMPT_TEMPLATE_VERSION, CREATURE_PROMPT_TEMPLATE_VERSION_EXPERIMENTAL } from '../../../shared/creature-transformations/prompt-composer.ts'
import type { TransformationCost, TransformationRequestIdempotencyStatus, TransformationRequestPersistence, TransformationRequestStatusPersistence } from '../../../shared/creature-transformations/request-persistence.ts'
import { VISUAL_TRAIT_BY_ID } from '../../../shared/creature-transformations/visual-traits.ts'
import { generateConceptForAuthenticatedProfile, type GeneratedConceptResponse } from './generation-service.ts'
import { ImageGenerationServiceError, generateImageForAuthenticatedProfile, type GeneratedImageResponse } from './image-generation-service.ts'
import type { CreatureTransformationLabPolicy } from './lab-policy.ts'
import { OpenAiStructuredConceptModelError } from './openai-structured-concept-model.ts'
import { parseAdoptCreatureTransformationRequest, parseGenerateConceptRequest, parseGenerateImageRequest, parseGenerateUnlockedTransformationRequest, parseGetBenchmarkResultsRequest, parseGetCreatureVisualProgressRequest, parseGetCurrentCreatureVisualRequest, parseGetGameCreatureVisualsRequest, parseGetTransformationRequestStatusRequest, parseListVisualBackgroundCleanupRequest, parseRollbackCreatureVisualVersionRequest, parseSelectCreatureVisualProgressTrackRequest, parseSubmitBackgroundRemovalCandidateRequest, parseSubmitExperimentReviewRequest, parseSubmitVisualBackgroundCleanupRequest } from './request-validation.ts'
import {
    CreatureTransformationRequestRepositoryError,
    type CreatureTransformationRequestRecord,
    type CreatureTransformationRequestRepository,
    type RequestReservationResult,
} from './creature-transformation-request-repository.ts'
import {
    CreatureTransformationStorageError,
    type SupabaseCreatureTransformationStorageAdapter,
} from './supabase-creature-transformation-storage.ts'
import { CreatureIdentityResolutionError } from './supabase-creature-identity-resolver.ts'
import { ExperimentReviewRepositoryError, type BenchmarkRequestRecord, type SupabaseExperimentReviewRepository } from './experiment-review-repository.ts'
import { CreatureVisualProgressionRepositoryError, type StoredVisualVersion, SupabaseCreatureVisualProgressionRepository } from './creature-visual-progression-repository.ts'

type PersistenceInput = Readonly<{ repository: CreatureTransformationRequestRepository }>
type BackgroundTaskScheduler = (task: Promise<void>) => void

export type GenerateConceptEdgeOrchestrationInput = Readonly<{
    profileId: string | null
    canGenerateImages?: boolean
    requestId: string
    body: unknown
    policy: CreatureTransformationLabPolicy
    resolver: CreatureIdentityResolver
    createGenerator: (mode: 'MOCK' | 'AI') => CreatureConceptGenerator
    now?: () => number
}> & PersistenceInput

export type GenerateImageEdgeOrchestrationInput = Readonly<{
    profileId: string | null
    canGenerateImages?: boolean
    requestId: string
    body: unknown
    policy: CreatureTransformationLabPolicy
    resolver: CreatureIdentityResolver
    storage: SupabaseCreatureTransformationStorageAdapter
    createImageProvider: () => CreatureImageProvider
    createRealImageProvider?: (configuration?: Pick<CreatureImageGenerationProfile, 'model' | 'quality' | 'estimatedCostUsd'>) => CreatureImageProvider
    deferBackgroundTask?: BackgroundTaskScheduler
    validator?: ImageValidator
    reviewRepository: SupabaseExperimentReviewRepository
    visualRepository: SupabaseCreatureVisualProgressionRepository
}> & PersistenceInput

export type CreatureTransformationEdgeOrchestrationInput = GenerateConceptEdgeOrchestrationInput & GenerateImageEdgeOrchestrationInput

type FailureDetails = Readonly<{
    code: string
    message: string
    problems?: CreatureTransformationErrorResponse['problems']
}>

type BenchmarkImageExecution = Readonly<{
    benchmarkCase: CreatureTransformationBenchmarkCase
    profile: CreatureImageGenerationProfile
    controlledConcept: GenerateImageRequest['concept']
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
        ...(record.benchmarkCaseId && record.generationProfileId && record.conceptSeed && record.promptTemplateVersion && record.promptSha256 ? {
            benchmark: {
                benchmarkCaseId: record.benchmarkCaseId,
                generationProfileId: record.generationProfileId,
                conceptSeed: record.conceptSeed,
                promptTemplateVersion: record.promptTemplateVersion,
                promptSha256: record.promptSha256,
            },
        } : {}),
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

function withConceptPersistence(response: GeneratedConceptResponse, record: CreatureTransformationRequestRecord, idempotencyStatus: TransformationRequestIdempotencyStatus) {
    return { ...response, requestPersistence: toPersistence(record, idempotencyStatus) }
}

function withImagePersistence(response: GeneratedImageResponse, record: CreatureTransformationRequestRecord, idempotencyStatus: TransformationRequestIdempotencyStatus): GenerateImageResponse {
    const { sourceSha256: _sourceSha256, ...publicResponse } = response
    return { ...publicResponse, requestPersistence: toPersistence(record, idempotencyStatus) }
}

export function getGenerateConceptFailureStatus(code: string): number {
    if (code === 'METHOD_NOT_ALLOWED') return 405
    if (code === 'UNAUTHENTICATED') return 401
    if (code === 'LAB_DISABLED' || code === 'CONCEPT_MODE_NOT_ALLOWED' || code === 'IMAGE_PROVIDER_MODE_NOT_ALLOWED' || code === 'CREATURE_NOT_OWNED' || code === 'REAL_IMAGE_PROVIDER_DISABLED' || code === 'REAL_IMAGE_PROVIDER_NOT_ALLOWED' || code === 'IMAGE_GENERATION_NOT_ALLOWED' || code === 'BENCHMARK_NOT_ALLOWED' || code === 'BENCHMARK_REVIEWER_NOT_ALLOWED' || code === 'VISUAL_PROGRESSION_DISABLED' || code === 'VISUAL_PRODUCTION_GENERATION_DISABLED' || code === 'VISUAL_ADOPTION_DISABLED' || code === 'BACKGROUND_CLEANUP_DISABLED' || code === 'VISUAL_PROFILE_NOT_ALLOWED' || code === 'OPPONENT_VISUAL_NOT_AUTHORIZED') return 403
    if (code === 'CREATURE_NOT_FOUND' || code === 'SOURCE_IMAGE_NOT_FOUND' || code === 'REQUEST_NOT_FOUND' || code === 'VISUAL_TRACK_NOT_FOUND' || code === 'VISUAL_VERSION_NOT_FOUND' || code === 'CURRENT_VISUAL_UNAVAILABLE') return 404
    if (code === 'AI_RATE_LIMITED' || code === 'DAILY_LIMIT_REACHED' || code === 'DAILY_BUDGET_REACHED' || code === 'REAL_IMAGE_USER_LIMIT_REACHED' || code === 'REAL_IMAGE_USER_CONCURRENCY_REACHED' || code === 'REAL_IMAGE_COOLDOWN_ACTIVE' || code === 'REAL_IMAGE_GLOBAL_LIMIT_REACHED' || code === 'REAL_IMAGE_GLOBAL_CONCURRENCY_REACHED' || code === 'OPENAI_IMAGE_RATE_LIMITED') return 429
    if (code === 'AI_NOT_CONFIGURED' || code === 'REAL_IMAGE_PROVIDER_NOT_CONFIGURED' || code === 'GENERATION_PROFILE_CONFIGURATION_INVALID') return 503
    if (code === 'OPERATION_NOT_IMPLEMENTED') return 501
    if (code === 'PNG_ALPHA_COVERAGE_INVALID' || code === 'BACKGROUND_REMOVAL_CANDIDATE_INVALID' || code === 'BACKGROUND_CLEANUP_CANDIDATE_INVALID') return 422
    if (code === 'AI_TIMEOUT' || code === 'IMAGE_PROVIDER_TIMEOUT' || code === 'OPENAI_IMAGE_TIMEOUT') return 504
    if (code === 'REQUEST_ALREADY_IN_PROGRESS' || code === 'IDEMPOTENT_REQUEST_ALREADY_COMPLETED' || code === 'IDEMPOTENCY_KEY_REUSED' || code === 'REQUEST_PREVIOUSLY_FAILED' || code === 'REQUEST_STALE' || code === 'REQUEST_STATE_CONFLICT' || code === 'VISUAL_TRACK_ALREADY_ACTIVE' || code === 'VISUAL_TRACK_NOT_READY' || code === 'VISUAL_TRACK_STATE_CONFLICT' || code === 'VISUAL_GENERATION_ALREADY_RUNNING' || code === 'CREATURE_VISUAL_VERSION_CONFLICT' || code === 'CREATURE_VISUAL_ALREADY_ADOPTED' || code === 'VISUAL_GENERATION_NOT_ADOPTABLE' || code === 'BACKGROUND_CLEANUP_VERSION_CONFLICT') return 409
    if (code === 'CONCEPT_REJECTED' || code === 'CREATURE_IDENTITY_NOT_SUPPORTED' || code === 'CREATURE_IDENTITY_CONFIGURATION_INVALID' || code === 'SOURCE_IMAGE_INVALID' || code === 'RESULT_IMAGE_EMPTY' || code === 'RESULT_IMAGE_INVALID' || code === 'RESULT_IMAGE_UNCHANGED' || code === 'AI_BAD_REQUEST' || code === 'OPENAI_IMAGE_BAD_REQUEST' || code === 'OPENAI_IMAGE_MODERATION_BLOCKED' || code === 'REAL_IMAGE_REQUEST_COST_LIMIT_EXCEEDED' || code === 'BENCHMARK_CONCEPT_MISMATCH') return 422
    if (code === 'AI_AUTHENTICATION_FAILED' || code === 'AI_PERMISSION_DENIED' || code === 'AI_NETWORK_ERROR' || code === 'AI_PROVIDER_ERROR' || code === 'MOCK_PROVIDER_FAILED' || code === 'STORAGE_UPLOAD_FAILED' || code === 'SIGNED_URL_FAILED' || code === 'OPENAI_IMAGE_PROVIDER_ERROR' || code === 'OPENAI_IMAGE_RESPONSE_INVALID' || code === 'OPENAI_IMAGE_BASE64_INVALID') return 502
    if (code === 'REQUEST_RESERVATION_FAILED' || code === 'REQUEST_PERSISTENCE_FAILED' || code === 'INTERNAL_ERROR' || code === 'CREATURE_LOOKUP_FAILED') return 500
    return 400
}

function mapThrownError(error: unknown): FailureDetails {
    if (error instanceof CreatureIdentityResolutionError) return { code: error.code, message: error.message }
    if (error instanceof CreatureTransformationStorageError) return { code: error.code, message: error.message }
    if (error instanceof CreatureTransformationRequestRepositoryError) return { code: error.code, message: error.message }
    if (error instanceof ExperimentReviewRepositoryError) return { code: error.code, message: error.message }
    if (error instanceof CreatureVisualProgressionRepositoryError) return { code: error.code, message: error.message }
    if (error instanceof ImageGenerationServiceError) return { code: error.code, message: error.message, ...(error.problems ? { problems: error.problems } : {}) }
    if (error instanceof OpenAiStructuredConceptModelError) {
        const providerDiagnostic = error.providerErrorCode ? ` (codice provider: ${error.providerErrorCode})` : ''
        if (error.code === 'AI_NOT_CONFIGURED') return { code: error.code, message: 'La modalita AI non e configurata.' }
        if (error.code === 'AI_BAD_REQUEST') return { code: error.code, message: `La richiesta AI non e accettata dal provider.${providerDiagnostic}` }
        if (error.code === 'AI_AUTHENTICATION_FAILED') return { code: error.code, message: `La credenziale AI non e accettata dal provider.${providerDiagnostic}` }
        if (error.code === 'AI_PERMISSION_DENIED') return { code: error.code, message: `La credenziale AI non e autorizzata per questa richiesta.${providerDiagnostic}` }
        if (error.code === 'AI_NETWORK_ERROR') return { code: error.code, message: 'Il runtime non ha raggiunto il provider AI.' }
        return { code: error.code, message: `La generazione AI non e disponibile.${providerDiagnostic}` }
    }
    if (error instanceof CreatureConceptGenerationError && error.cause instanceof OpenAiStructuredConceptModelError) return mapThrownError(error.cause)
    if (error instanceof CreatureConceptGenerationError) return { code: 'AI_PROVIDER_ERROR', message: 'La generazione AI non ha prodotto un concept utilizzabile.' }
    return { code: 'INTERNAL_ERROR', message: 'Errore interno durante la trasformazione della creatura.' }
}

function estimateConceptCost(request: GenerateConceptRequest): TransformationCost {
    return request.conceptMode === 'MOCK' ? { estimatedCostUsd: 0 } : {}
}

function estimateImageCost(request: GenerateImageRequest, policy: CreatureTransformationLabPolicy, benchmark?: BenchmarkImageExecution): TransformationCost {
    if (request.imageProviderMode === 'MOCK') return { estimatedCostUsd: 0 }
    if (benchmark) return { estimatedCostUsd: benchmark.profile.estimatedCostUsd }
    return policy.realImage.estimatedCostUsd === null ? {} : { estimatedCostUsd: policy.realImage.estimatedCostUsd }
}

function generationAccessFailure(input: Pick<GenerateConceptEdgeOrchestrationInput, 'profileId' | 'canGenerateImages' | 'policy'>): FailureDetails | null {
    if (input.canGenerateImages || (input.profileId !== null && input.policy.realImage.allowedProfileIds.has(input.profileId))) return null
    return { code: 'IMAGE_GENERATION_NOT_ALLOWED', message: 'Il profilo autenticato non e autorizzato alla generazione a pagamento.' }
}

function realImageReservationLimits(policy: CreatureTransformationLabPolicy) {
    return {
        dailyRealImageLimit: policy.dailyRealImageLimit,
        globalDailyRealImageLimit: policy.globalDailyRealImageLimit,
        globalConcurrentRealImageLimit: policy.globalConcurrentRealImageLimit,
        realImageCooldownSeconds: policy.realImageCooldownSeconds,
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

function realImagePolicyFailure(policy: CreatureTransformationLabPolicy, profileId: string, canGenerateImages = false): FailureDetails | null {
    const realImage = policy.realImage
    if (!realImage) return { code: 'REAL_IMAGE_PROVIDER_NOT_CONFIGURED', message: 'Il provider immagini reale non e configurato in modo completo.' }
    if (!realImage.enabled) return { code: 'REAL_IMAGE_PROVIDER_DISABLED', message: 'Il pilot immagini reale non e abilitato.' }
    if (!canGenerateImages && !realImage.allowedProfileIds.has(profileId)) return { code: 'REAL_IMAGE_PROVIDER_NOT_ALLOWED', message: 'Il profilo autenticato non e autorizzato al pilot immagini reale.' }
    if (!realImage.provider || !realImage.apiKey || !realImage.model || realImage.estimatedCostUsd === null || realImage.maxEstimatedCostUsd === null) {
        return { code: 'REAL_IMAGE_PROVIDER_NOT_CONFIGURED', message: 'Il provider immagini reale non e configurato in modo completo.' }
    }
    if (realImage.estimatedCostUsd > realImage.maxEstimatedCostUsd) return { code: 'REAL_IMAGE_REQUEST_COST_LIMIT_EXCEEDED', message: 'Il costo stimato della richiesta reale supera il limite consentito.' }
    return null
}

function benchmarkGenerationAllowed(policy: CreatureTransformationLabPolicy, profileId: string): FailureDetails | null {
    return policy.benchmark.allowedProfileIds.has(profileId)
        ? null
        : { code: 'BENCHMARK_NOT_ALLOWED', message: 'Il profilo autenticato non e autorizzato al benchmark immagini.' }
}

function benchmarkReviewerAllowed(policy: CreatureTransformationLabPolicy, profileId: string): FailureDetails | null {
    return policy.benchmark.reviewerProfileIds.has(profileId)
        ? null
        : { code: 'BENCHMARK_REVIEWER_NOT_ALLOWED', message: 'Il profilo autenticato non e autorizzato alle review benchmark.' }
}

async function resolveBenchmarkImageExecution(input: GenerateImageEdgeOrchestrationInput, request: GenerateImageRequest): Promise<BenchmarkImageExecution | FailureDetails | null> {
    if (!request.benchmarkCaseId && !request.generationProfileId) return null
    const accessFailure = benchmarkGenerationAllowed(input.policy, input.profileId!)
    if (accessFailure) return accessFailure
    if (request.imageProviderMode !== 'REAL') return { code: 'BENCHMARK_REAL_MODE_REQUIRED', message: 'Il benchmark controllato richiede la modalita immagini REAL.' }
    const benchmarkCase = request.benchmarkCaseId ? getCreatureTransformationBenchmarkCase(request.benchmarkCaseId) : null
    if (!benchmarkCase) return { code: 'BENCHMARK_CASE_NOT_FOUND', message: 'Il benchmark case richiesto non esiste.' }
    if (request.concept.visualTrait !== benchmarkCase.visualTraitId || request.concept.intensity !== benchmarkCase.intensity) {
        return { code: 'BENCHMARK_CONCEPT_MISMATCH', message: 'Trait e intensita devono coincidere con il benchmark case controllato.' }
    }
    if (input.policy.benchmark.generationProfiles.configurationError) return { code: 'GENERATION_PROFILE_CONFIGURATION_INVALID', message: 'La configurazione dei generation profile non e valida.' }
    const configuredProfile = request.generationProfileId ? input.policy.benchmark.generationProfiles.profiles.get(request.generationProfileId) : null
    if (!configuredProfile) return { code: 'GENERATION_PROFILE_NOT_FOUND', message: 'Il generation profile richiesto non esiste.' }
    const profile = getEnabledCreatureImageGenerationProfile(input.policy.benchmark.generationProfiles, configuredProfile.id)
    if (!profile) return { code: 'GENERATION_PROFILE_DISABLED', message: 'Il generation profile richiesto non e abilitato.' }
    const maxCost = input.policy.realImage.maxEstimatedCostUsd
    if (maxCost === null || profile.estimatedCostUsd > maxCost) return { code: 'REAL_IMAGE_REQUEST_COST_LIMIT_EXCEEDED', message: 'Il costo stimato del generation profile supera il limite consentito.' }
    const resolvedCreature = await input.resolver.resolve({ profileId: input.profileId!, creatureId: request.creatureId })
    const controlledConcept = await new MockCreatureConceptGenerator().generateConcept({
        identity: resolvedCreature.identity,
        visualTrait: VISUAL_TRAIT_BY_ID[benchmarkCase.visualTraitId],
        intensity: benchmarkCase.intensity,
        seed: benchmarkCase.conceptSeed,
    })
    if (JSON.stringify(request.concept) !== JSON.stringify(controlledConcept)) {
        return { code: 'BENCHMARK_CONCEPT_MISMATCH', message: 'Il concept non corrisponde al seed controllato del benchmark case.' }
    }
    return { benchmarkCase, profile, controlledConcept }
}

async function reserveConcept(input: GenerateConceptEdgeOrchestrationInput, request: GenerateConceptRequest): Promise<RequestReservationResult> {
    return input.repository.reserve({
        profileId: input.profileId!, creatureId: request.creatureId, idempotencyKey: request.idempotencyKey, operation: request.operation,
        visualTraitId: request.visualTraitId, intensity: request.intensity, conceptMode: request.conceptMode,
        ...estimateConceptCost(request), dailyRequestLimit: input.policy.dailyRequestLimit, dailyBudgetUsd: input.policy.dailyBudgetUsd,
    })
}

async function reserveImage(input: GenerateImageEdgeOrchestrationInput, request: GenerateImageRequest, benchmark?: BenchmarkImageExecution): Promise<RequestReservationResult> {
    const fingerprint = request.imageProviderMode === 'REAL'
        ? await requestFingerprint({ operation: request.operation, creatureId: request.creatureId, imageProviderMode: request.imageProviderMode, concept: request.concept, benchmarkCaseId: request.benchmarkCaseId, generationProfileId: request.generationProfileId })
        : undefined
    return input.repository.reserve({
        profileId: input.profileId!, creatureId: request.creatureId, idempotencyKey: request.idempotencyKey, operation: request.operation,
        visualTraitId: request.concept.visualTrait, intensity: request.concept.intensity, imageProviderMode: request.imageProviderMode,
        ...estimateImageCost(request, input.policy, benchmark), dailyRequestLimit: input.policy.dailyRequestLimit, dailyBudgetUsd: input.policy.dailyBudgetUsd,
        ...(request.imageProviderMode === 'REAL' ? { requestFingerprint: fingerprint, ...realImageReservationLimits(input.policy) } : {}),
        ...(benchmark ? { benchmarkCaseId: benchmark.benchmarkCase.id, generationProfileId: benchmark.profile.id, conceptSeed: benchmark.benchmarkCase.conceptSeed } : {}),
    })
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

function storedWarnings(record: CreatureTransformationRequestRecord): string[] {
    if (record.validationWarnings.length) return record.validationWarnings
    return record.imageProviderMode === 'MOCK'
        ? ['MOCK_PROVIDER_NO_VISUAL_TRANSFORMATION', ...(record.sourceSha256 === record.resultSha256 ? ['RESULT_IMAGE_UNCHANGED_MOCK'] : [])]
        : []
}

async function recoverSucceededImage(input: GenerateImageEdgeOrchestrationInput, record: CreatureTransformationRequestRecord): Promise<GenerateImageApiResponse> {
    const persistence = toPersistence(record, 'EXISTING')
    if (!record.resultPath || !record.resultSha256 || !record.resultMimeType || !record.resultWidth || !record.resultHeight) {
        return failure(input.requestId, 'REQUEST_PERSISTENCE_FAILED', 'La richiesta completata non contiene metadati immagine recuperabili.', undefined, persistence)
    }
    try {
        const signed = await input.storage.createResultSignedUrl(record.resultPath)
        return {
            success: true,
            requestId: input.requestId,
            result: {
                signedUrl: signed.signedUrl, expiresAt: signed.expiresAt, mimeType: record.resultMimeType, width: record.resultWidth, height: record.resultHeight,
                sha256: record.resultSha256, assetReadiness: record.assetReadiness ?? 'FINAL_ASSET',
            },
            generation: {
                provider: record.provider ?? 'mock-creature-image-provider', model: record.model ?? 'source-byte-copy-v1',
                isMock: record.imageProviderMode === 'MOCK', ...(record.providerRequestId ? { providerRequestId: record.providerRequestId } : {}),
                latencyMs: record.generationLatencyMs ?? 0, ...(record.estimatedCostUsd === null ? {} : { estimatedCostUsd: record.estimatedCostUsd }),
            },
            validation: { warnings: storedWarnings(record) },
            requestPersistence: persistence,
        }
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message, details.problems, persistence)
    }
}

async function completeImageGeneration(input: GenerateImageEdgeOrchestrationInput, request: GenerateImageRequest, running: CreatureTransformationRequestRecord, provider: CreatureImageProvider, idempotencyStatus: TransformationRequestIdempotencyStatus, benchmark?: BenchmarkImageExecution): Promise<GenerateImageApiResponse> {
    try {
        const controlledRequest = benchmark ? { ...request, concept: benchmark.controlledConcept } : request
        const result = await generateImageForAuthenticatedProfile({
            profileId: input.profileId!, requestId: input.requestId, request: controlledRequest, resolver: input.resolver, storage: input.storage,
            provider, ...(input.validator ? { validator: input.validator } : {}),
            ...(benchmark ? { promptTemplateVersion: benchmark.profile.promptTemplateVersion } : {}),
        })
        if (!result.success) return markFailed(input.repository, input.requestId, input.profileId!, running, idempotencyStatus, { code: result.code, message: result.message, ...(result.problems ? { problems: result.problems } : {}) })
        const resultPath = await input.storage.createResultObjectPath(input.profileId!, request.idempotencyKey)
        const completed = await input.repository.markSucceeded({
            requestId: running.id, profileId: input.profileId!,
            data: {
                provider: result.generation.provider, model: result.generation.model, providerRequestId: result.generation.providerRequestId,
                sourceSha256: result.sourceSha256, resultSha256: result.result.sha256, resultPath, resultMimeType: result.result.mimeType,
                resultWidth: result.result.width, resultHeight: result.result.height, generationLatencyMs: result.generation.latencyMs,
                assetReadiness: result.result.assetReadiness, validationWarnings: result.validation.warnings,
                ...(result.generation.estimatedCostUsd === undefined ? estimateImageCost(request, input.policy, benchmark) : { estimatedCostUsd: result.generation.estimatedCostUsd }),
                ...(request.imageProviderMode === 'MOCK' ? { actualCostUsd: 0 } : {}),
                promptTemplateVersion: benchmark?.profile.promptTemplateVersion ?? CREATURE_PROMPT_TEMPLATE_VERSION,
                promptSha256: result.promptSha256,
                conceptSnapshot: result.conceptSnapshot,
                ...(benchmark ? { generationQuality: benchmark.profile.quality } : request.imageProviderMode === 'REAL' ? { generationQuality: input.policy.realImage.quality } : {}),
            },
        })
        return withImagePersistence(result, completed, idempotencyStatus)
    } catch (error) {
        return markFailed(input.repository, input.requestId, input.profileId!, running, idempotencyStatus, mapThrownError(error))
    }
}

async function runRealImageGenerationTask(input: GenerateImageEdgeOrchestrationInput, request: GenerateImageRequest, running: CreatureTransformationRequestRecord, benchmark?: BenchmarkImageExecution): Promise<void> {
    try {
        await completeImageGeneration(input, request, running, input.createRealImageProvider!(benchmark?.profile), 'CREATED', benchmark)
    } catch (error) {
        await markFailed(input.repository, input.requestId, input.profileId!, running, 'CREATED', mapThrownError(error))
    }
}

function acceptedRealImage(requestId: string, record: CreatureTransformationRequestRecord, idempotencyStatus: TransformationRequestIdempotencyStatus): GenerateImageAcceptedResponse {
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

function productionImageProfile(policy: CreatureTransformationLabPolicy): CreatureImageGenerationProfile | null {
    const configuredId = policy.visualProgression.productionGenerationProfileId
    if (!configuredId) return null
    return getEnabledCreatureImageGenerationProfile(policy.benchmark.generationProfiles, configuredId)
}

function productionRealImageFailure(policy: CreatureTransformationLabPolicy, profile: CreatureImageGenerationProfile | null): FailureDetails | null {
    const real = policy.realImage
    if (!real.enabled || real.provider !== 'OPENAI' || !real.apiKey || !real.model || real.estimatedCostUsd === null || real.maxEstimatedCostUsd === null) {
        return { code: 'REAL_IMAGE_PROVIDER_NOT_CONFIGURED', message: 'La generazione immagini di produzione non e configurata.' }
    }
    if (profile === null && real.estimatedCostUsd > real.maxEstimatedCostUsd) return { code: 'REAL_IMAGE_REQUEST_COST_LIMIT_EXCEEDED', message: 'Il costo stimato della generazione supera il limite consentito.' }
    if (profile !== null && profile.estimatedCostUsd > real.maxEstimatedCostUsd) return { code: 'REAL_IMAGE_REQUEST_COST_LIMIT_EXCEEDED', message: 'Il costo stimato del profilo di generazione supera il limite consentito.' }
    return null
}

async function toCurrentVisualResponse(input: GenerateImageEdgeOrchestrationInput, version: StoredVisualVersion) {
    const signed = await input.storage.createVisualVersionSignedUrl({ assetPath: version.assetPath, isBaseVersion: version.visualTraitId === null })
    return {
        creatureId: version.creatureId, versionId: version.id, versionNumber: version.versionNumber,
        signedUrl: signed.signedUrl, expiresAt: signed.expiresAt, width: version.width, height: version.height,
        mimeType: version.mimeType, sha256: version.assetSha256, isBaseVersion: version.visualTraitId === null,
    } as const
}

async function restoreVisualTrackAfterFailure(input: GenerateImageEdgeOrchestrationInput, trackId: string, record: CreatureTransformationRequestRecord) {
    try {
        await input.visualRepository.completeGeneration({ profileId: input.profileId!, trackId, requestId: record.id, finalAsset: false })
    } catch (error) {
        console.error('Creature visual track restore failed', { requestId: input.requestId, transformationRequestId: record.id, code: mapThrownError(error).code })
    }
}

async function runUnlockedTransformationTask(
    input: CreatureTransformationEdgeOrchestrationInput,
    request: GenerateUnlockedTransformationRequest,
    running: CreatureTransformationRequestRecord,
    visualTraitId: GenerateConceptRequest['visualTraitId'],
    profile: CreatureImageGenerationProfile | null,
): Promise<void> {
    try {
        const conceptRequest: GenerateConceptRequest = {
            operation: 'GENERATE_CONCEPT', creatureId: request.creatureId, visualTraitId, intensity: 2,
            conceptMode: 'AI', idempotencyKey: request.idempotencyKey,
        }
        const concept = await generateConceptForAuthenticatedProfile({
            profileId: input.profileId!, requestId: input.requestId, request: conceptRequest,
            resolver: input.resolver, generator: input.createGenerator('AI'), now: input.now,
        })
        if (!concept.success) {
            await input.repository.markFailed({ requestId: running.id, profileId: input.profileId!, errorCode: concept.code, errorMessage: concept.message })
            await restoreVisualTrackAfterFailure(input, request.progressTrackId, running)
            return
        }
        const imageRequest: GenerateImageRequest = {
            operation: 'GENERATE_IMAGE', creatureId: request.creatureId, concept: concept.concept,
            imageProviderMode: 'REAL', idempotencyKey: request.idempotencyKey,
        }
        const generated = await generateImageForAuthenticatedProfile({
            profileId: input.profileId!, requestId: input.requestId, request: imageRequest, resolver: input.resolver,
            storage: input.storage, provider: input.createRealImageProvider!(profile ?? undefined),
            ...(input.validator ? { validator: input.validator } : {}), promptTemplateVersion: CREATURE_PROMPT_TEMPLATE_VERSION_EXPERIMENTAL,
            storageDestination: 'RAW_EXPERIMENT',
        })
        if (!generated.success) {
            await input.repository.markFailed({ requestId: running.id, profileId: input.profileId!, errorCode: generated.code, errorMessage: generated.message })
            await restoreVisualTrackAfterFailure(input, request.progressTrackId, running)
            return
        }
        const completed = await input.repository.markSucceeded({
            requestId: running.id, profileId: input.profileId!, data: {
                provider: generated.generation.provider, model: generated.generation.model, providerRequestId: generated.generation.providerRequestId,
                sourceSha256: generated.sourceSha256, resultSha256: generated.result.sha256, resultPath: await input.storage.createRawResultObjectPath(input.profileId!, request.idempotencyKey), resultMimeType: generated.result.mimeType,
                resultWidth: generated.result.width, resultHeight: generated.result.height, generationLatencyMs: generated.generation.latencyMs,
                assetReadiness: 'EXPERIMENT_ONLY', validationWarnings: [...generated.validation.warnings, 'BACKGROUND_REMOVAL_PENDING_CLIENT'],
                estimatedCostUsd: generated.generation.estimatedCostUsd ?? profile?.estimatedCostUsd ?? input.policy.realImage.estimatedCostUsd ?? 0,
                promptTemplateVersion: CREATURE_PROMPT_TEMPLATE_VERSION_EXPERIMENTAL, promptSha256: generated.promptSha256,
                conceptSnapshot: generated.conceptSnapshot, generationQuality: profile?.quality ?? input.policy.realImage.quality,
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
        const track = await input.visualRepository.selectTrack({ profileId: input.profileId, creatureId: parsed.request.creatureId, visualTraitId: parsed.request.visualTraitId, target: input.policy.visualProgression.winsRequired })
        const current = await input.visualRepository.getCurrentVersion({ profileId: input.profileId, creatureId: parsed.request.creatureId })
        if (!current) return failure(input.requestId, 'CURRENT_VISUAL_UNAVAILABLE', 'La visuale corrente non e disponibile.')
        return { success: true, requestId: input.requestId, track, lastExperiment: null, lastFailure: null, currentVersion: { id: current.id, versionNumber: current.versionNumber, visualTraitId: current.visualTraitId, conceptName: current.conceptName }, history: await input.visualRepository.listHistory({ profileId: input.profileId, creatureId: parsed.request.creatureId }) }
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
        const [initialTrack, current, history] = await Promise.all([
            input.visualRepository.getTrack({ profileId: input.profileId, creatureId: parsed.request.creatureId }),
            input.visualRepository.getCurrentVersion({ profileId: input.profileId, creatureId: parsed.request.creatureId }),
            input.visualRepository.listHistory({ profileId: input.profileId, creatureId: parsed.request.creatureId }),
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
        return { success: true, requestId: input.requestId, track, lastExperiment, lastFailure, currentVersion: { id: current.id, versionNumber: current.versionNumber, visualTraitId: current.visualTraitId, conceptName: current.conceptName }, history }
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
    const profile = productionImageProfile(input.policy)
    if (input.policy.visualProgression.productionGenerationProfileId && !profile) return failure(input.requestId, 'GENERATION_PROFILE_CONFIGURATION_INVALID', 'Il profilo di generazione produzione non e disponibile.')
    const realFailure = productionRealImageFailure(input.policy, profile)
    if (realFailure) return failure(input.requestId, realFailure.code, realFailure.message)
    try {
        const [track, source] = await Promise.all([
            input.visualRepository.getTrack({ profileId: input.profileId, creatureId: parsed.request.creatureId }),
            input.resolver.resolve({ profileId: input.profileId, creatureId: parsed.request.creatureId }),
        ])
        if (!track || track.id !== parsed.request.progressTrackId) return failure(input.requestId, 'VISUAL_TRACK_NOT_FOUND', 'Il percorso visuale non e disponibile.')
        if (track.status === 'GENERATING') return failure(input.requestId, 'VISUAL_GENERATION_ALREADY_RUNNING', 'La generazione visuale e gia in corso.')
        if (track.status !== 'READY') return failure(input.requestId, 'VISUAL_TRACK_NOT_READY', 'Il percorso deve essere sbloccato prima della generazione.')
        const fingerprint = await requestFingerprint({ operation: parsed.request.operation, creatureId: parsed.request.creatureId, progressTrackId: parsed.request.progressTrackId, visualTraitId: track.visualTraitId, sourceVisualVersionId: source.currentVisualVersionId })
        const reservation = await input.repository.reserve({
            profileId: input.profileId, creatureId: parsed.request.creatureId, idempotencyKey: parsed.request.idempotencyKey,
            operation: 'GENERATE_UNLOCKED_TRANSFORMATION', visualTraitId: track.visualTraitId, intensity: 2, conceptMode: 'AI', imageProviderMode: 'REAL',
            estimatedCostUsd: profile?.estimatedCostUsd ?? input.policy.realImage.estimatedCostUsd ?? 0,
            dailyRequestLimit: input.policy.dailyRequestLimit, dailyBudgetUsd: input.policy.dailyBudgetUsd,
            requestFingerprint: fingerprint, ...realImageReservationLimits(input.policy),
            visualProgressTrackId: track.id, sourceVisualVersionId: source.currentVisualVersionId,
        })
        if (reservation.outcome !== 'CREATED' && reservation.outcome !== 'EXISTING') return reservationFailure(input.requestId, reservation)
        if (reservation.record.operation !== 'GENERATE_UNLOCKED_TRANSFORMATION') return failure(input.requestId, 'REQUEST_STATE_CONFLICT', 'La idempotency key appartiene a un operazione diversa.')
        if (reservation.outcome === 'EXISTING') {
            const existing = existingStateFailure(input.requestId, reservation.record, input.policy)
            return existing ?? acceptedRealImage(input.requestId, reservation.record, 'EXISTING')
        }
        let startedTrack
        try {
            startedTrack = await input.visualRepository.startGeneration({ profileId: input.profileId, creatureId: parsed.request.creatureId, trackId: track.id, requestId: reservation.record.id })
        } catch (error) {
            try { await input.repository.markFailed({ requestId: reservation.record.id, profileId: input.profileId, errorCode: 'VISUAL_TRACK_STATE_CONFLICT', errorMessage: 'Il percorso visuale non puo iniziare la generazione.' }) } catch { /* the track remains authoritative */ }
            throw error
        }
        if (startedTrack.status !== 'GENERATING') return failure(input.requestId, 'VISUAL_TRACK_STATE_CONFLICT', 'Il percorso visuale non puo iniziare la generazione.')
        let running: CreatureTransformationRequestRecord
        try {
            running = await input.repository.markRunning({ requestId: reservation.record.id, profileId: input.profileId })
        } catch (error) {
            await restoreVisualTrackAfterFailure(input, track.id, reservation.record)
            const details = mapThrownError(error)
            return failure(input.requestId, details.code, details.message)
        }
        if (!input.createRealImageProvider || !input.deferBackgroundTask) {
            try { await input.repository.markFailed({ requestId: running.id, profileId: input.profileId, errorCode: 'REAL_IMAGE_PROVIDER_NOT_CONFIGURED', errorMessage: 'La generazione visuale non e disponibile.' }) } catch { /* preserve the safe track restore */ }
            await restoreVisualTrackAfterFailure(input, track.id, running)
            return failure(input.requestId, 'REAL_IMAGE_PROVIDER_NOT_CONFIGURED', 'La generazione visuale non e disponibile.')
        }
        input.deferBackgroundTask(runUnlockedTransformationTask(input, parsed.request, running, track.visualTraitId, profile))
        return acceptedRealImage(input.requestId, running, 'CREATED')
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

export async function orchestrateSubmitBackgroundRemovalCandidate(input: GenerateImageEdgeOrchestrationInput): Promise<SubmitBackgroundRemovalCandidateResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseSubmitBackgroundRemovalCandidateRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const bytes = decodeBackgroundRemovalCandidate(parsed.request.candidatePngBase64)
    if (!bytes) return failure(input.requestId, 'BACKGROUND_REMOVAL_CANDIDATE_INVALID', 'Il PNG elaborato non puo essere decodificato.')
    let record: CreatureTransformationRequestRecord | null
    try {
        record = await input.repository.getById({ profileId: input.profileId, requestId: parsed.request.transformationRequestId })
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message, details.problems)
    }
    if (!record) return failure(input.requestId, 'REQUEST_NOT_FOUND', 'La richiesta di trasformazione non e disponibile.')
    if (record.operation !== 'GENERATE_UNLOCKED_TRANSFORMATION' || record.status !== 'SUCCEEDED' || record.assetReadiness !== 'EXPERIMENT_ONLY' || !record.visualProgressTrackId) {
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
        const finalized = await input.repository.finalizeBackgroundRemovalCandidate({
            requestId: record.id, profileId: input.profileId, candidatePath, candidateSha256: validation.metadata.sha256,
            candidateMimeType: validation.metadata.mimeType, candidateWidth: validation.metadata.width,
            candidateHeight: validation.metadata.height, validationWarnings: validation.warnings,
        })
        return {
            success: true, requestId: input.requestId, requestPersistence: toPersistence(finalized, 'CREATED'),
            candidate: { assetReadiness: 'FINAL_ASSET', sha256: validation.metadata.sha256, mimeType: validation.metadata.mimeType, width: validation.metadata.width, height: validation.metadata.height, warnings: validation.warnings },
        }
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message, details.problems)
    }
}

function backgroundCleanupAccessFailure(policy: CreatureTransformationLabPolicy): FailureDetails | null {
    return policy.visualProgression.backgroundCleanupEnabled ? null : { code: 'BACKGROUND_CLEANUP_DISABLED', message: 'La pulizia batch delle visuali non e abilitata.' }
}

export async function orchestrateListVisualBackgroundCleanup(input: GenerateImageEdgeOrchestrationInput): Promise<ListVisualBackgroundCleanupResponse | CreatureTransformationErrorResponse> {
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

export async function orchestrateSubmitVisualBackgroundCleanup(input: GenerateImageEdgeOrchestrationInput): Promise<SubmitVisualBackgroundCleanupResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseSubmitVisualBackgroundCleanupRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const access = backgroundCleanupAccessFailure(input.policy)
    if (access) return failure(input.requestId, access.code, access.message)
    const bytes = decodeBackgroundRemovalCandidate(parsed.request.candidatePngBase64)
    if (!bytes) return failure(input.requestId, 'BACKGROUND_CLEANUP_CANDIDATE_INVALID', 'Il PNG ripulito non puo essere decodificato.')
    const validation = await (input.validator ?? new ImageValidator()).validate({
        bytes, mimeType: 'image/png', renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
        requireAlphaCoverage: true, requireTransparentEdges: true,
    })
    if (!validation.valid) return failure(input.requestId, 'BACKGROUND_CLEANUP_CANDIDATE_INVALID', 'Il PNG ripulito non ha superato la validazione alpha.', validation.problems)
    try {
        const assetPath = await input.storage.createCleanupObjectPath(parsed.request.visualVersionId)
        await input.storage.saveCleanedVisual({ visualVersionId: parsed.request.visualVersionId, image: bytes })
        const version = await input.visualRepository.promoteCleanedVisual({
            visualVersionId: parsed.request.visualVersionId, assetPath, assetSha256: validation.metadata.sha256,
            width: validation.metadata.width, height: validation.metadata.height,
        })
        return { success: true, requestId: input.requestId, visualVersionId: version.id, creatureId: version.creatureId, versionNumber: version.versionNumber }
    } catch (error) { const details = mapThrownError(error); return failure(input.requestId, details.code, details.message, details.problems) }
}

export async function orchestrateAdoptCreatureTransformation(input: CreatureTransformationEdgeOrchestrationInput): Promise<AdoptCreatureTransformationResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseAdoptCreatureTransformationRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const access = visualProgressionAccessFailure(input.policy, 'ADOPT')
    if (access) return failure(input.requestId, access.code, access.message)
    try {
        const version = await input.visualRepository.adopt({ profileId: input.profileId, creatureId: parsed.request.creatureId, trackId: parsed.request.progressTrackId, requestId: parsed.request.transformationRequestId, expectedCurrentVisualVersionId: parsed.request.expectedCurrentVisualVersionId })
        return { success: true, requestId: input.requestId, version: { id: version.id, versionNumber: version.versionNumber, visualTraitId: version.visualTraitId, conceptName: version.conceptName } }
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
        return { success: true, requestId: input.requestId, version: { id: version.id, versionNumber: version.versionNumber, visualTraitId: version.visualTraitId, conceptName: version.conceptName } }
    } catch (error) { const details = mapThrownError(error); return failure(input.requestId, details.code, details.message) }
}

export async function orchestrateGenerateConcept(input: GenerateConceptEdgeOrchestrationInput): Promise<GenerateConceptApiResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseGenerateConceptRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    if (!input.policy.enabled) return failure(input.requestId, 'LAB_DISABLED', 'Il laboratorio trasformazioni non e abilitato.')
    if (!input.policy.allowedConceptModes.has(parsed.request.conceptMode)) return failure(input.requestId, 'CONCEPT_MODE_NOT_ALLOWED', 'La modalita concept richiesta non e autorizzata.')
    if (parsed.request.conceptMode === 'AI') {
        const accessFailure = generationAccessFailure(input)
        if (accessFailure) return failure(input.requestId, accessFailure.code, accessFailure.message)
    }
    const benchmarkCase = parsed.request.benchmarkCaseId ? getCreatureTransformationBenchmarkCase(parsed.request.benchmarkCaseId) : null
    if (parsed.request.benchmarkCaseId) {
        const accessFailure = benchmarkGenerationAllowed(input.policy, input.profileId)
        if (accessFailure) return failure(input.requestId, accessFailure.code, accessFailure.message)
        if (!benchmarkCase) return failure(input.requestId, 'BENCHMARK_CASE_NOT_FOUND', 'Il benchmark case richiesto non esiste.')
        if (parsed.request.conceptMode !== 'MOCK' || parsed.request.visualTraitId !== benchmarkCase.visualTraitId || parsed.request.intensity !== benchmarkCase.intensity) {
            return failure(input.requestId, 'BENCHMARK_CONCEPT_MISMATCH', 'Il concept benchmark deve essere MOCK e coincidere con trait e intensita del caso.')
        }
    }

    let reservation: RequestReservationResult
    try {
        reservation = await reserveConcept(input, parsed.request)
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message, details.problems)
    }
    if (reservation.outcome !== 'CREATED' && reservation.outcome !== 'EXISTING') return reservationFailure(input.requestId, reservation)
    if (reservation.record.operation !== 'GENERATE_CONCEPT') return failure(input.requestId, 'REQUEST_STATE_CONFLICT', 'La idempotency key appartiene a un operazione diversa.', undefined, toPersistence(reservation.record, reservation.outcome))
    if (reservation.outcome === 'EXISTING') {
        const existing = existingStateFailure(input.requestId, reservation.record, input.policy)
        return existing ?? failure(input.requestId, 'IDEMPOTENT_REQUEST_ALREADY_COMPLETED', 'La richiesta concept e gia completata; il payload creativo non viene persistito.', undefined, toPersistence(reservation.record, 'EXISTING'))
    }

    let running: CreatureTransformationRequestRecord
    try {
        running = await input.repository.markRunning({ requestId: reservation.record.id, profileId: input.profileId })
    } catch (error) {
        return markFailed(input.repository, input.requestId, input.profileId, reservation.record, 'CREATED', mapThrownError(error))
    }
    try {
        const result = await generateConceptForAuthenticatedProfile({
            profileId: input.profileId, requestId: input.requestId, request: parsed.request, resolver: input.resolver,
            generator: input.createGenerator(parsed.request.conceptMode), now: input.now,
            ...(benchmarkCase ? { benchmarkConceptSeed: benchmarkCase.conceptSeed } : {}),
        })
        if (!result.success) return markFailed(input.repository, input.requestId, input.profileId, running, 'CREATED', { code: result.code, message: result.message, ...(result.problems ? { problems: result.problems } : {}) })
        const completed = await input.repository.markSucceeded({
            requestId: running.id, profileId: input.profileId,
            data: { provider: result.generation.generator, model: result.generation.model, promptTemplateVersion: result.prompt.templateVersion, conceptSchemaVersion: result.concept.schemaVersion, generationLatencyMs: result.generation.latencyMs, ...estimateConceptCost(parsed.request), ...(parsed.request.conceptMode === 'MOCK' ? { actualCostUsd: 0 } : {}) },
        })
        return withConceptPersistence(result, completed, 'CREATED')
    } catch (error) {
        return markFailed(input.repository, input.requestId, input.profileId, running, 'CREATED', mapThrownError(error))
    }
}

export async function orchestrateGenerateImage(input: GenerateImageEdgeOrchestrationInput): Promise<GenerateImageApiResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseGenerateImageRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    if (!input.policy.enabled) return failure(input.requestId, 'LAB_DISABLED', 'Il laboratorio trasformazioni non e abilitato.')
    if (parsed.request.imageProviderMode === 'REAL') {
        const accessFailure = generationAccessFailure(input)
        if (accessFailure) return failure(input.requestId, accessFailure.code, accessFailure.message)
        const policyFailure = realImagePolicyFailure(input.policy, input.profileId, input.canGenerateImages)
        if (policyFailure) return failure(input.requestId, policyFailure.code, policyFailure.message)
    } else if (!input.policy.allowedImageProviderModes.has(parsed.request.imageProviderMode)) {
        return failure(input.requestId, 'IMAGE_PROVIDER_MODE_NOT_ALLOWED', 'La modalita immagini richiesta non e autorizzata.')
    }

    let benchmark: BenchmarkImageExecution | undefined
    try {
        const resolvedBenchmark = await resolveBenchmarkImageExecution(input, parsed.request)
        if (resolvedBenchmark && 'code' in resolvedBenchmark) return failure(input.requestId, resolvedBenchmark.code, resolvedBenchmark.message)
        benchmark = resolvedBenchmark ?? undefined
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message, details.problems)
    }

    let reservation: RequestReservationResult
    try {
        reservation = await reserveImage(input, parsed.request, benchmark)
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message, details.problems)
    }
    if (reservation.outcome !== 'CREATED' && reservation.outcome !== 'EXISTING') return reservationFailure(input.requestId, reservation)
    if (reservation.record.operation !== 'GENERATE_IMAGE') return failure(input.requestId, 'REQUEST_STATE_CONFLICT', 'La idempotency key appartiene a un operazione diversa.', undefined, toPersistence(reservation.record, reservation.outcome))
    if (reservation.outcome === 'EXISTING') {
        if (reservation.record.status === 'SUCCEEDED') return recoverSucceededImage(input, reservation.record)
        if (parsed.request.imageProviderMode === 'REAL' && (reservation.record.status === 'RESERVED' || reservation.record.status === 'RUNNING') && !isStale(reservation.record, input.policy.staleRequestSeconds)) {
            return acceptedRealImage(input.requestId, reservation.record, 'EXISTING')
        }
        return existingStateFailure(input.requestId, reservation.record, input.policy)!
    }

    let running: CreatureTransformationRequestRecord
    try {
        running = await input.repository.markRunning({ requestId: reservation.record.id, profileId: input.profileId })
    } catch (error) {
        return markFailed(input.repository, input.requestId, input.profileId, reservation.record, 'CREATED', mapThrownError(error))
    }
    if (parsed.request.imageProviderMode === 'REAL') {
        if (!input.createRealImageProvider || !input.deferBackgroundTask) {
            return markFailed(input.repository, input.requestId, input.profileId, running, 'CREATED', { code: 'REQUEST_PERSISTENCE_FAILED', message: 'Il runtime asincrono del provider reale non e disponibile.' })
        }
        try {
            input.deferBackgroundTask(runRealImageGenerationTask(input, parsed.request, running, benchmark))
            return acceptedRealImage(input.requestId, running, 'CREATED')
        } catch (error) {
            return markFailed(input.repository, input.requestId, input.profileId, running, 'CREATED', mapThrownError(error))
        }
    }
    return completeImageGeneration(input, parsed.request, running, input.createImageProvider(), 'CREATED', benchmark)
}

export async function orchestrateGetTransformationRequestStatus(input: GenerateImageEdgeOrchestrationInput): Promise<TransformationRequestStatusResponse | CreatureTransformationErrorResponse> {
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
        ...(record.status === 'FAILED' && record.errorCode && record.errorMessage ? { error: { code: record.errorCode, message: record.errorMessage } } : {}),
        ...(record.visualProgressTrackId && record.sourceVisualVersionId && record.visualTraitId ? {
            productPreview: {
                progressTrackId: record.visualProgressTrackId, sourceVisualVersionId: record.sourceVisualVersionId,
                visualTraitId: record.visualTraitId,
                conceptName: record.conceptSnapshot && typeof record.conceptSnapshot.conceptName === 'string' ? record.conceptSnapshot.conceptName : 'Evoluzione visuale',
                evolutionaryFunction: record.conceptSnapshot && typeof record.conceptSnapshot.evolutionaryFunction === 'string' ? record.conceptSnapshot.evolutionaryFunction : 'Proposta visuale generata e validata dal server.',
                warnings: storedWarnings(record),
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
            mimeType: record.resultMimeType, sha256: record.resultSha256, assetReadiness: record.assetReadiness ?? 'FINAL_ASSET', warnings: storedWarnings(record),
        } as const
        return { ...response, result, ...(record.assetReadiness === 'EXPERIMENT_ONLY' ? { rawResult: { signedUrl: result.signedUrl, expiresAt: result.expiresAt, width: result.width, height: result.height, mimeType: result.mimeType, sha256: result.sha256 } } : {}) }
    } catch (error) {
        const details = mapThrownError(error)
        return { ...response, error: { code: details.code, message: details.message } }
    }
}

function isKnownPromptTemplateVersion(value: string | null): value is typeof CREATURE_PROMPT_TEMPLATE_VERSION | typeof CREATURE_PROMPT_TEMPLATE_VERSION_EXPERIMENTAL {
    return value === CREATURE_PROMPT_TEMPLATE_VERSION || value === CREATURE_PROMPT_TEMPLATE_VERSION_EXPERIMENTAL
}

async function toBenchmarkResultEntry(
    input: GenerateImageEdgeOrchestrationInput,
    record: BenchmarkRequestRecord,
    review: CreatureTransformationExperimentReview | null,
) {
    let result: { signedUrl: string, expiresAt: string, mimeType: 'image/png', width: number, height: number } | undefined
    if (record.status === 'SUCCEEDED' && record.resultPath && record.resultMimeType && record.resultWidth && record.resultHeight) {
        try {
            const signed = await input.storage.createResultSignedUrl(record.resultPath)
            result = { signedUrl: signed.signedUrl, expiresAt: signed.expiresAt, mimeType: record.resultMimeType, width: record.resultWidth, height: record.resultHeight }
        } catch {
            // A signed URL failure must not disclose the internal path or prevent aggregate inspection.
        }
    }
    return {
        transformationRequestId: record.id, benchmarkCaseId: record.benchmarkCaseId, generationProfileId: record.generationProfileId, conceptSeed: record.conceptSeed,
        provider: record.provider, model: record.model, quality: record.generationQuality, promptTemplateVersion: record.promptTemplateVersion,
        promptSha256: record.promptSha256, visualTraitId: record.visualTraitId, intensity: record.intensity, status: record.status,
        assetReadiness: record.assetReadiness, validationWarnings: record.validationWarnings, generationLatencyMs: record.generationLatencyMs,
        estimatedCostUsd: record.estimatedCostUsd, actualCostUsd: record.actualCostUsd, sourceSha256: record.sourceSha256, resultSha256: record.resultSha256,
        ...(result ? { result } : {}), review, classification: classifyExperimentReview(review),
    }
}

export async function orchestrateSubmitExperimentReview(input: GenerateImageEdgeOrchestrationInput): Promise<SubmitExperimentReviewResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseSubmitExperimentReviewRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    if (!input.policy.enabled) return failure(input.requestId, 'LAB_DISABLED', 'Il laboratorio trasformazioni non e abilitato.')
    const accessFailure = benchmarkReviewerAllowed(input.policy, input.profileId)
    if (accessFailure) return failure(input.requestId, accessFailure.code, accessFailure.message)
    let request: CreatureTransformationRequestRecord | null
    try {
        request = await input.repository.getById({ profileId: input.profileId, requestId: parsed.request.transformationRequestId })
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message, details.problems)
    }
    if (!request) return failure(input.requestId, 'REQUEST_NOT_FOUND', 'La richiesta benchmark non e disponibile.')
    if (!request.benchmarkCaseId || request.status !== 'SUCCEEDED' || !request.resultPath) return failure(input.requestId, 'BENCHMARK_REQUEST_NOT_REVIEWABLE', 'La richiesta deve essere un benchmark completato con risultato disponibile.')
    try {
        const review = await input.reviewRepository.upsert({ ...parsed.request, reviewerProfileId: input.profileId })
        return { success: true, requestId: input.requestId, review, classification: classifyExperimentReview(review) }
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message, details.problems)
    }
}

export async function orchestrateGetBenchmarkResults(input: GenerateImageEdgeOrchestrationInput): Promise<GetBenchmarkResultsResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseGetBenchmarkResultsRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    if (!input.policy.enabled) return failure(input.requestId, 'LAB_DISABLED', 'Il laboratorio trasformazioni non e abilitato.')
    const accessFailure = benchmarkReviewerAllowed(input.policy, input.profileId)
    if (accessFailure) return failure(input.requestId, accessFailure.code, accessFailure.message)
    try {
        const [records, reviews] = await Promise.all([
            input.reviewRepository.listRequestRecordsForProfile(input.profileId),
            input.reviewRepository.listForReviewer(input.profileId),
        ])
        const reviewsByRequestId = new Map(reviews.map((review) => [review.transformationRequestId, review]))
        const entries = await Promise.all(records.map((record) => toBenchmarkResultEntry(input, record, reviewsByRequestId.get(record.id) ?? null)))
        const metrics: CreatureTransformationBenchmarkMetricRecord[] = records.flatMap((record) => {
            const profile = input.policy.benchmark.generationProfiles.profiles.get(record.generationProfileId)
            const visualTraitId = record.visualTraitId
            const promptTemplateVersion = isKnownPromptTemplateVersion(record.promptTemplateVersion)
                ? record.promptTemplateVersion
                : profile?.promptTemplateVersion
            if (!visualTraitId || !VISUAL_TRAIT_BY_ID[visualTraitId as keyof typeof VISUAL_TRAIT_BY_ID] || !promptTemplateVersion) return []
            return [{
                requestId: record.id, benchmarkCaseId: record.benchmarkCaseId, generationProfileId: record.generationProfileId,
                visualTraitId: visualTraitId as CreatureTransformationBenchmarkMetricRecord['visualTraitId'], promptTemplateVersion, status: record.status,
                assetReadiness: record.assetReadiness, generationLatencyMs: record.generationLatencyMs, estimatedCostUsd: record.estimatedCostUsd,
                actualCostUsd: record.actualCostUsd, review: reviewsByRequestId.get(record.id) ?? null,
            }]
        })
        return {
            success: true,
            requestId: input.requestId,
            catalog: {
                cases: CREATURE_TRANSFORMATION_BENCHMARK_PLAN,
                profiles: [...input.policy.benchmark.generationProfiles.profiles.values()],
                maxRealImageEstimatedCostUsd: input.policy.realImage.maxEstimatedCostUsd,
            },
            entries,
            metrics: summarizeCreatureTransformationBenchmark(metrics),
        }
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message, details.problems)
    }
}

export async function orchestrateCreatureTransformation(input: CreatureTransformationEdgeOrchestrationInput): Promise<CreatureTransformationApiResponse> {
    const operation = input.body && typeof input.body === 'object' && !Array.isArray(input.body) ? (input.body as { operation?: unknown }).operation : undefined
    if (operation === 'GENERATE_IMAGE') return orchestrateGenerateImage(input)
    if (operation === 'GENERATE_UNLOCKED_TRANSFORMATION') return orchestrateGenerateUnlockedTransformation(input)
    if (operation === 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE') return orchestrateSubmitBackgroundRemovalCandidate(input)
    if (operation === 'LIST_VISUAL_BACKGROUND_CLEANUP') return orchestrateListVisualBackgroundCleanup(input)
    if (operation === 'SUBMIT_VISUAL_BACKGROUND_CLEANUP') return orchestrateSubmitVisualBackgroundCleanup(input)
    if (operation === 'GET_REQUEST_STATUS') return orchestrateGetTransformationRequestStatus(input)
    if (operation === 'SUBMIT_EXPERIMENT_REVIEW') return orchestrateSubmitExperimentReview(input)
    if (operation === 'GET_BENCHMARK_RESULTS') return orchestrateGetBenchmarkResults(input)
    if (operation === 'SELECT_VISUAL_PROGRESS_TRACK') return orchestrateSelectCreatureVisualProgressTrack(input)
    if (operation === 'GET_VISUAL_PROGRESS') return orchestrateGetCreatureVisualProgress(input)
    if (operation === 'GET_CURRENT_VISUAL') return orchestrateGetCurrentCreatureVisual(input)
    if (operation === 'GET_GAME_VISUALS') return orchestrateGetGameCreatureVisuals(input)
    if (operation === 'ADOPT_CREATURE_TRANSFORMATION') return orchestrateAdoptCreatureTransformation(input)
    if (operation === 'ROLLBACK_CREATURE_VISUAL_VERSION') return orchestrateRollbackCreatureVisualVersion(input)
    return orchestrateGenerateConcept(input)
}
