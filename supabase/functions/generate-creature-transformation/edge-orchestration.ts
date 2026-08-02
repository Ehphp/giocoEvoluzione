import type {
    CreatureTransformationApiResponse,
    CreatureTransformationErrorResponse,
    GenerateConceptApiResponse,
    GenerateImageAcceptedResponse,
    GenerateImageApiResponse,
    GenerateImageResponse,
    TransformationRequestStatusResponse,
} from '../../../shared/creature-transformations/api-contracts.ts'
import type { CreatureConceptGenerator } from '../../../shared/creature-transformations/concept-generator.ts'
import { CreatureConceptGenerationError } from '../../../shared/creature-transformations/concept-generator.ts'
import type { CreatureIdentityResolver, GenerateConceptRequest, GenerateImageRequest } from '../../../shared/creature-transformations/contracts.ts'
import type { CreatureImageProvider } from '../../../shared/creature-transformations/image-generation.ts'
import type { ImagePostProcessor } from '../../../shared/creature-transformations/image-post-processor.ts'
import { ImageValidator } from '../../../shared/creature-transformations/image-validator.ts'
import type { TransformationCost, TransformationRequestIdempotencyStatus, TransformationRequestPersistence, TransformationRequestStatusPersistence } from '../../../shared/creature-transformations/request-persistence.ts'
import { generateConceptForAuthenticatedProfile, type GeneratedConceptResponse } from './generation-service.ts'
import { ImageGenerationServiceError, generateImageForAuthenticatedProfile, type GeneratedImageResponse } from './image-generation-service.ts'
import type { CreatureTransformationLabPolicy } from './lab-policy.ts'
import { OpenAiStructuredConceptModelError } from './openai-structured-concept-model.ts'
import { parseGenerateConceptRequest, parseGenerateImageRequest, parseGetTransformationRequestStatusRequest } from './request-validation.ts'
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

type PersistenceInput = Readonly<{ repository: CreatureTransformationRequestRepository }>
type BackgroundTaskScheduler = (task: Promise<void>) => void

export type GenerateConceptEdgeOrchestrationInput = Readonly<{
    profileId: string | null
    requestId: string
    body: unknown
    policy: CreatureTransformationLabPolicy
    resolver: CreatureIdentityResolver
    createGenerator: (mode: 'MOCK' | 'AI') => CreatureConceptGenerator
    now?: () => number
}> & PersistenceInput

export type GenerateImageEdgeOrchestrationInput = Readonly<{
    profileId: string | null
    requestId: string
    body: unknown
    policy: CreatureTransformationLabPolicy
    resolver: CreatureIdentityResolver
    storage: SupabaseCreatureTransformationStorageAdapter
    createImageProvider: () => CreatureImageProvider
    createRealImageProvider?: () => CreatureImageProvider
    deferBackgroundTask?: BackgroundTaskScheduler
    postProcessor: ImagePostProcessor
    validator?: ImageValidator
}> & PersistenceInput

export type CreatureTransformationEdgeOrchestrationInput = GenerateConceptEdgeOrchestrationInput & GenerateImageEdgeOrchestrationInput

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
    if (code === 'LAB_DISABLED' || code === 'CONCEPT_MODE_NOT_ALLOWED' || code === 'IMAGE_PROVIDER_MODE_NOT_ALLOWED' || code === 'CREATURE_NOT_OWNED' || code === 'REAL_IMAGE_PROVIDER_DISABLED' || code === 'REAL_IMAGE_PROVIDER_NOT_ALLOWED') return 403
    if (code === 'CREATURE_NOT_FOUND' || code === 'SOURCE_IMAGE_NOT_FOUND' || code === 'REQUEST_NOT_FOUND') return 404
    if (code === 'AI_RATE_LIMITED' || code === 'DAILY_LIMIT_REACHED' || code === 'DAILY_BUDGET_REACHED' || code === 'OPENAI_IMAGE_RATE_LIMITED') return 429
    if (code === 'AI_NOT_CONFIGURED' || code === 'REAL_IMAGE_PROVIDER_NOT_CONFIGURED') return 503
    if (code === 'OPERATION_NOT_IMPLEMENTED') return 501
    if (code === 'AI_TIMEOUT' || code === 'IMAGE_PROVIDER_TIMEOUT' || code === 'OPENAI_IMAGE_TIMEOUT') return 504
    if (code === 'REQUEST_ALREADY_IN_PROGRESS' || code === 'IDEMPOTENT_REQUEST_ALREADY_COMPLETED' || code === 'REQUEST_PREVIOUSLY_FAILED' || code === 'REQUEST_STALE' || code === 'REQUEST_STATE_CONFLICT') return 409
    if (code === 'CONCEPT_REJECTED' || code === 'CREATURE_IDENTITY_NOT_SUPPORTED' || code === 'CREATURE_IDENTITY_CONFIGURATION_INVALID' || code === 'SOURCE_IMAGE_INVALID' || code === 'RESULT_IMAGE_EMPTY' || code === 'RESULT_IMAGE_INVALID' || code === 'RESULT_IMAGE_UNCHANGED' || code === 'OPENAI_IMAGE_BAD_REQUEST' || code === 'OPENAI_IMAGE_MODERATION_BLOCKED') return 422
    if (code === 'AI_PROVIDER_ERROR' || code === 'MOCK_PROVIDER_FAILED' || code === 'POST_PROCESSING_FAILED' || code === 'STORAGE_UPLOAD_FAILED' || code === 'SIGNED_URL_FAILED' || code === 'OPENAI_IMAGE_PROVIDER_ERROR' || code === 'OPENAI_IMAGE_RESPONSE_INVALID' || code === 'OPENAI_IMAGE_BASE64_INVALID') return 502
    if (code === 'REQUEST_RESERVATION_FAILED' || code === 'REQUEST_PERSISTENCE_FAILED' || code === 'INTERNAL_ERROR' || code === 'CREATURE_LOOKUP_FAILED') return 500
    return 400
}

function mapThrownError(error: unknown): FailureDetails {
    if (error instanceof CreatureIdentityResolutionError) return { code: error.code, message: error.message }
    if (error instanceof CreatureTransformationStorageError) return { code: error.code, message: error.message }
    if (error instanceof CreatureTransformationRequestRepositoryError) return { code: error.code, message: error.message }
    if (error instanceof ImageGenerationServiceError) return { code: error.code, message: error.message, ...(error.problems ? { problems: error.problems } : {}) }
    if (error instanceof OpenAiStructuredConceptModelError) return { code: error.code, message: error.code === 'AI_NOT_CONFIGURED' ? 'La modalita AI non e configurata.' : 'La generazione AI non e disponibile.' }
    if (error instanceof CreatureConceptGenerationError && error.cause instanceof OpenAiStructuredConceptModelError) return mapThrownError(error.cause)
    if (error instanceof CreatureConceptGenerationError) return { code: 'AI_PROVIDER_ERROR', message: 'La generazione AI non ha prodotto un concept utilizzabile.' }
    return { code: 'INTERNAL_ERROR', message: 'Errore interno durante la trasformazione della creatura.' }
}

function estimateConceptCost(request: GenerateConceptRequest): TransformationCost {
    return request.conceptMode === 'MOCK' ? { estimatedCostUsd: 0 } : {}
}

function estimateImageCost(request: GenerateImageRequest, policy: CreatureTransformationLabPolicy): TransformationCost {
    if (request.imageProviderMode === 'MOCK') return { estimatedCostUsd: 0 }
    return policy.realImage.estimatedCostUsd === null ? {} : { estimatedCostUsd: policy.realImage.estimatedCostUsd }
}

function isStale(record: CreatureTransformationRequestRecord, staleRequestSeconds: number, now = Date.now()): boolean {
    if (record.status !== 'RUNNING' && record.status !== 'RESERVED') return false
    const startedAt = Date.parse(record.startedAt ?? record.createdAt)
    return Number.isFinite(startedAt) && now - startedAt > staleRequestSeconds * 1000
}

function realImagePolicyFailure(policy: CreatureTransformationLabPolicy, profileId: string): FailureDetails | null {
    const realImage = policy.realImage
    if (!realImage) return { code: 'REAL_IMAGE_PROVIDER_NOT_CONFIGURED', message: 'Il provider immagini reale non e configurato in modo completo.' }
    if (!realImage.enabled) return { code: 'REAL_IMAGE_PROVIDER_DISABLED', message: 'Il pilot immagini reale non e abilitato.' }
    if (!realImage.allowedProfileIds.has(profileId)) return { code: 'REAL_IMAGE_PROVIDER_NOT_ALLOWED', message: 'Il profilo autenticato non e autorizzato al pilot immagini reale.' }
    if (!realImage.provider || !realImage.apiKey || !realImage.model || realImage.estimatedCostUsd === null) {
        return { code: 'REAL_IMAGE_PROVIDER_NOT_CONFIGURED', message: 'Il provider immagini reale non e configurato in modo completo.' }
    }
    return null
}

async function reserveConcept(input: GenerateConceptEdgeOrchestrationInput, request: GenerateConceptRequest): Promise<RequestReservationResult> {
    return input.repository.reserve({
        profileId: input.profileId!, creatureId: request.creatureId, idempotencyKey: request.idempotencyKey, operation: request.operation,
        visualTraitId: request.visualTraitId, intensity: request.intensity, conceptMode: request.conceptMode,
        ...estimateConceptCost(request), dailyRequestLimit: input.policy.dailyRequestLimit, dailyBudgetUsd: input.policy.dailyBudgetUsd,
    })
}

async function reserveImage(input: GenerateImageEdgeOrchestrationInput, request: GenerateImageRequest): Promise<RequestReservationResult> {
    return input.repository.reserve({
        profileId: input.profileId!, creatureId: request.creatureId, idempotencyKey: request.idempotencyKey, operation: request.operation,
        visualTraitId: request.concept.visualTrait, intensity: request.concept.intensity, imageProviderMode: request.imageProviderMode,
        ...estimateImageCost(request, input.policy), dailyRequestLimit: input.policy.dailyRequestLimit, dailyBudgetUsd: input.policy.dailyBudgetUsd,
    })
}

function reservationFailure(requestId: string, result: Exclude<RequestReservationResult, { outcome: 'CREATED' | 'EXISTING' }>): CreatureTransformationErrorResponse {
    if (result.outcome === 'CREATURE_NOT_OWNED') return failure(requestId, 'CREATURE_NOT_OWNED', 'La creatura non appartiene al profilo autenticato.')
    if (result.outcome === 'DAILY_LIMIT_REACHED') return failure(requestId, 'DAILY_LIMIT_REACHED', 'Hai raggiunto il limite giornaliero di richieste del laboratorio.')
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

async function completeImageGeneration(input: GenerateImageEdgeOrchestrationInput, request: GenerateImageRequest, running: CreatureTransformationRequestRecord, provider: CreatureImageProvider, idempotencyStatus: TransformationRequestIdempotencyStatus): Promise<GenerateImageApiResponse> {
    try {
        const result = await generateImageForAuthenticatedProfile({
            profileId: input.profileId!, requestId: input.requestId, request, resolver: input.resolver, storage: input.storage,
            provider, postProcessor: input.postProcessor, ...(input.validator ? { validator: input.validator } : {}),
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
                ...(result.generation.estimatedCostUsd === undefined ? estimateImageCost(request, input.policy) : { estimatedCostUsd: result.generation.estimatedCostUsd }),
                ...(request.imageProviderMode === 'MOCK' ? { actualCostUsd: 0 } : {}),
            },
        })
        return withImagePersistence(result, completed, idempotencyStatus)
    } catch (error) {
        return markFailed(input.repository, input.requestId, input.profileId!, running, idempotencyStatus, mapThrownError(error))
    }
}

async function runRealImageGenerationTask(input: GenerateImageEdgeOrchestrationInput, request: GenerateImageRequest, running: CreatureTransformationRequestRecord): Promise<void> {
    try {
        await completeImageGeneration(input, request, running, input.createRealImageProvider!(), 'CREATED')
    } catch (error) {
        await markFailed(input.repository, input.requestId, input.profileId!, running, 'CREATED', mapThrownError(error))
    }
}

function acceptedRealImage(requestId: string, record: CreatureTransformationRequestRecord, idempotencyStatus: TransformationRequestIdempotencyStatus): GenerateImageAcceptedResponse {
    return { success: true, accepted: true, requestId, requestPersistence: toPersistence(record, idempotencyStatus) }
}

export async function orchestrateGenerateConcept(input: GenerateConceptEdgeOrchestrationInput): Promise<GenerateConceptApiResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseGenerateConceptRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    if (!input.policy.enabled) return failure(input.requestId, 'LAB_DISABLED', 'Il laboratorio trasformazioni non e abilitato.')
    if (!input.policy.allowedConceptModes.has(parsed.request.conceptMode)) return failure(input.requestId, 'CONCEPT_MODE_NOT_ALLOWED', 'La modalita concept richiesta non e autorizzata.')

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
        const result = await generateConceptForAuthenticatedProfile({ profileId: input.profileId, requestId: input.requestId, request: parsed.request, resolver: input.resolver, generator: input.createGenerator(parsed.request.conceptMode), now: input.now })
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
        const policyFailure = realImagePolicyFailure(input.policy, input.profileId)
        if (policyFailure) return failure(input.requestId, policyFailure.code, policyFailure.message)
    } else if (!input.policy.allowedImageProviderModes.has(parsed.request.imageProviderMode)) {
        return failure(input.requestId, 'IMAGE_PROVIDER_MODE_NOT_ALLOWED', 'La modalita immagini richiesta non e autorizzata.')
    }

    let reservation: RequestReservationResult
    try {
        reservation = await reserveImage(input, parsed.request)
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
            input.deferBackgroundTask(runRealImageGenerationTask(input, parsed.request, running))
            return acceptedRealImage(input.requestId, running, 'CREATED')
        } catch (error) {
            return markFailed(input.repository, input.requestId, input.profileId, running, 'CREATED', mapThrownError(error))
        }
    }
    return completeImageGeneration(input, parsed.request, running, input.createImageProvider(), 'CREATED')
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
    }
    if (record.status !== 'SUCCEEDED') return response
    if (!record.resultPath || !record.resultSha256 || !record.resultMimeType || !record.resultWidth || !record.resultHeight) {
        return { ...response, error: { code: 'REQUEST_PERSISTENCE_FAILED', message: 'Il risultato persistito non e recuperabile.' } }
    }
    try {
        const signed = await input.storage.createResultSignedUrl(record.resultPath)
        return {
            ...response,
            result: {
                signedUrl: signed.signedUrl, expiresAt: signed.expiresAt, width: record.resultWidth, height: record.resultHeight,
                mimeType: record.resultMimeType, sha256: record.resultSha256, assetReadiness: record.assetReadiness ?? 'FINAL_ASSET', warnings: storedWarnings(record),
            },
        }
    } catch (error) {
        const details = mapThrownError(error)
        return { ...response, error: { code: details.code, message: details.message } }
    }
}

export async function orchestrateCreatureTransformation(input: CreatureTransformationEdgeOrchestrationInput): Promise<CreatureTransformationApiResponse> {
    const operation = input.body && typeof input.body === 'object' && !Array.isArray(input.body) ? (input.body as { operation?: unknown }).operation : undefined
    if (operation === 'GENERATE_IMAGE') return orchestrateGenerateImage(input)
    if (operation === 'GET_REQUEST_STATUS') return orchestrateGetTransformationRequestStatus(input)
    return orchestrateGenerateConcept(input)
}
