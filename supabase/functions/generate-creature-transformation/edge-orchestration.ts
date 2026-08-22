import type {
    CreatureTransformationApiResponse,
    CreatureTransformationErrorResponse,
    GenerateImageAcceptedResponse,
    SubmitBackgroundRemovalCandidateResponse,
    CreatureVisualProgressResponse,
    CurrentCreatureVisualApiResponse,
    GameCreatureVisualsResponse,
    AdoptCreatureTransformationResponse,
    TransformationRequestStatusResponse,
} from '../../../shared/creature-transformations/api-contracts.ts'
import type {
    CreatureIdentityResolver,
    ResolvedCreatureSource,
} from '../../../shared/creature-transformations/contracts.ts'
import { ImageValidator, sha256Hex } from '../../../shared/creature-transformations/image-validator.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from '../../../shared/creature-transformations/render-specifications.ts'
import type {
    TransformationRequestIdempotencyStatus,
    TransformationRequestPersistence,
    TransformationRequestStatusPersistence,
} from '../../../shared/creature-transformations/request-persistence.ts'
import {
    buildFluxEvolutionPlan,
    EvolutionPlanError,
} from '../../../shared/creature-transformations/flux-evolution/evolution-plan.ts'
import {
    isFluxEvolutionSnapshot,
    readFluxSnapshotCapability,
} from '../../../shared/creature-transformations/flux-evolution/micro-concept.ts'
import type { CreatureEvolutionPolicy } from './evolution-policy.ts'
import { FalFluxImageProvider, FalFluxImageProviderError } from './fal-flux-image-provider.ts'
import { FluxMicroConceptGenerator, FluxMicroConceptGeneratorError } from './flux-micro-concept-generator.ts'
import { FluxImageGenerationServiceError } from './flux-image-generation-service.ts'
import {
    parseAdoptCreatureTransformationRequest,
    parseGenerateUnlockedTransformationRequest,
    parseGetCreatureVisualProgressRequest,
    parseGetCurrentCreatureVisualRequest,
    parseGetGameCreatureVisualsRequest,
    parseGetTransformationRequestStatusRequest,
    parseRollbackCreatureVisualVersionRequest,
    parseSubmitBackgroundRemovalCandidateRequest,
} from './request-validation.ts'
import { submitSeedreamEvolutionForAuthenticatedProfile } from './fal-queue-submission-service.ts'
import type { FalQueueWorkflow } from './fal-queue-workflow.ts'
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
import {
    CreatureVisualProgressionRepositoryError,
    type StoredVisualVersion,
    SupabaseCreatureVisualProgressionRepository,
} from './creature-visual-progression-repository.ts'

export type CreatureTransformationEdgeOrchestrationInput = Readonly<{
    profileId: string | null
    canGenerateImages?: boolean
    requestId: string
    body: unknown
    policy: CreatureEvolutionPolicy
    resolver: CreatureIdentityResolver
    storage: SupabaseCreatureTransformationStorageAdapter
    repository: CreatureTransformationRequestRepository
    visualRepository: SupabaseCreatureVisualProgressionRepository
    createFluxMicroConceptGenerator?: () => FluxMicroConceptGenerator
    createSeedreamEvolutionProvider?: () => FalFluxImageProvider
    falWebhookUrl?: string
    validator?: ImageValidator
}>

type FailureDetails = Readonly<{
    code: string
    message: string
    problems?: CreatureTransformationErrorResponse['problems']
}>

function toPersistence(
    record: CreatureTransformationRequestRecord,
    idempotencyStatus: TransformationRequestIdempotencyStatus,
): TransformationRequestPersistence {
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

function failure(
    requestId: string,
    code: string,
    message: string,
    problems?: CreatureTransformationErrorResponse['problems'],
    requestPersistence?: TransformationRequestPersistence,
): CreatureTransformationErrorResponse {
    return {
        success: false,
        requestId,
        code,
        message,
        ...(problems?.length ? { problems } : {}),
        ...(requestPersistence ? { requestPersistence } : {}),
    }
}

/**
 * Every failure code the client can receive, mapped to its HTTP status. A table rather than a
 * chain of comparisons: adding a code is one line, and a code declared twice is a visible
 * duplicate key instead of an unreachable branch.
 */
const FAILURE_STATUS: Readonly<Record<string, number>> = Object.freeze({
    // 401 — not authenticated
    UNAUTHENTICATED: 401,
    // 403 — authenticated but not allowed
    CREATURE_NOT_OWNED: 403,
    IMAGE_GENERATION_NOT_ALLOWED: 403,
    VISUAL_PROGRESSION_DISABLED: 403,
    VISUAL_PRODUCTION_GENERATION_DISABLED: 403,
    VISUAL_ADOPTION_DISABLED: 403,
    BODY_PLAN_MUTATION_NOT_AUTHORIZED: 403,
    OPPONENT_VISUAL_NOT_AUTHORIZED: 403,
    // 404 — not found
    CREATURE_NOT_FOUND: 404,
    SOURCE_IMAGE_NOT_FOUND: 404,
    REQUEST_NOT_FOUND: 404,
    VISUAL_TRACK_NOT_FOUND: 404,
    VISUAL_VERSION_NOT_FOUND: 404,
    CURRENT_VISUAL_UNAVAILABLE: 404,
    // 405 — wrong method
    METHOD_NOT_ALLOWED: 405,
    // 409 — state conflict
    REQUEST_ALREADY_IN_PROGRESS: 409,
    IDEMPOTENT_REQUEST_ALREADY_COMPLETED: 409,
    IDEMPOTENCY_KEY_REUSED: 409,
    REQUEST_PREVIOUSLY_FAILED: 409,
    REQUEST_STALE: 409,
    REQUEST_STATE_CONFLICT: 409,
    VISUAL_TRACK_ALREADY_ACTIVE: 409,
    VISUAL_TRACK_NOT_READY: 409,
    VISUAL_TRACK_STATE_CONFLICT: 409,
    VISUAL_GENERATION_ALREADY_RUNNING: 409,
    CREATURE_VISUAL_VERSION_CONFLICT: 409,
    CREATURE_VISUAL_ALREADY_ADOPTED: 409,
    VISUAL_GENERATION_NOT_ADOPTABLE: 409,
    BACKGROUND_CLEANUP_VERSION_CONFLICT: 409,
    // 422 — well-formed but unprocessable
    BACKGROUND_REMOVAL_CANDIDATE_INVALID: 422,
    BACKGROUND_CLEANUP_CANDIDATE_INVALID: 422,
    PNG_ALPHA_COVERAGE_INVALID: 422,
    CREATURE_IDENTITY_NOT_SUPPORTED: 422,
    CREATURE_IDENTITY_CONFIGURATION_INVALID: 422,
    EVOLUTION_TARGET_NOT_AVAILABLE: 422,
    EVOLUTION_DIRECTION_UNAVAILABLE: 422,
    EXPERIMENTAL_SOURCE_NOT_AVAILABLE: 422,
    SOURCE_VISUAL_NOT_AVAILABLE: 422,
    FLUX_BODY_PLAN_UNSUPPORTED: 422,
    FLUX_SOURCE_IMAGE_INVALID: 422,
    FLUX_RESULT_IMAGE_INVALID: 422,
    FLUX_RESULT_IMAGE_UNCHANGED: 422,
    FLUX_SUBJECT_CROPPED: 422,
    FAL_FLUX_BAD_REQUEST: 422,
    FLUX_CONCEPT_RESPONSE_INVALID: 422,
    FLUX_REQUEST_COST_LIMIT_EXCEEDED: 422,
    // 429 — quota or rate limit
    DAILY_LIMIT_REACHED: 429,
    DAILY_BUDGET_REACHED: 429,
    REAL_IMAGE_USER_LIMIT_REACHED: 429,
    REAL_IMAGE_USER_CONCURRENCY_REACHED: 429,
    REAL_IMAGE_COOLDOWN_ACTIVE: 429,
    REAL_IMAGE_GLOBAL_LIMIT_REACHED: 429,
    REAL_IMAGE_GLOBAL_CONCURRENCY_REACHED: 429,
    FAL_FLUX_RATE_LIMITED: 429,
    // 500 — our fault
    REQUEST_RESERVATION_FAILED: 500,
    REQUEST_PERSISTENCE_FAILED: 500,
    INTERNAL_ERROR: 500,
    CREATURE_LOOKUP_FAILED: 500,
    // 501 — not implemented
    OPERATION_NOT_IMPLEMENTED: 501,
    // 502 — upstream failed
    STORAGE_UPLOAD_FAILED: 502,
    SIGNED_URL_FAILED: 502,
    FAL_FLUX_PROVIDER_ERROR: 502,
    FAL_FLUX_RESPONSE_INVALID: 502,
    FLUX_CONCEPT_PROVIDER_ERROR: 502,
    // 503 — not configured
    FAL_FLUX_NOT_CONFIGURED: 503,
    FLUX_CONCEPT_NOT_CONFIGURED: 503,
    FAL_SEEDREAM_MODEL_REQUIRED: 503,
    // 504 — upstream timed out
    FAL_FLUX_TIMEOUT: 504,
    FLUX_CONCEPT_TIMEOUT: 504,
})

/** Anything unmapped is a malformed request rather than a server fault. */
export function getCreatureTransformationFailureStatus(code: string): number {
    return FAILURE_STATUS[code] ?? 400
}

function mapThrownError(error: unknown): FailureDetails {
    if (error instanceof CreatureIdentityResolutionError) return { code: error.code, message: error.message }
    if (error instanceof CreatureTransformationStorageError) return { code: error.code, message: error.message }
    if (error instanceof CreatureTransformationRequestRepositoryError)
        return { code: error.code, message: error.message }
    if (error instanceof CreatureVisualProgressionRepositoryError) return { code: error.code, message: error.message }
    if (error instanceof EvolutionPlanError) return { code: error.code, message: error.message }
    if (error instanceof FluxImageGenerationServiceError)
        return { code: error.code, message: error.message, ...(error.problems ? { problems: error.problems } : {}) }
    if (error instanceof FluxMicroConceptGeneratorError || error instanceof FalFluxImageProviderError)
        return { code: error.code, message: error.message }
    return { code: 'INTERNAL_ERROR', message: 'Errore interno durante la trasformazione della creatura.' }
}

function persistedFailureMessage(details: FailureDetails): string {
    const problem = details.problems?.[0]
    return problem ? `${details.message} ${problem.message} (${problem.code})` : details.message
}

function generationAccessFailure(
    input: Pick<CreatureTransformationEdgeOrchestrationInput, 'profileId' | 'canGenerateImages' | 'policy'>,
): FailureDetails | null {
    if (
        input.canGenerateImages ||
        (input.profileId !== null && input.policy.paidGenerationProfileIds.has(input.profileId))
    )
        return null
    return {
        code: 'IMAGE_GENERATION_NOT_ALLOWED',
        message: 'Il profilo autenticato non e autorizzato alla generazione a pagamento.',
    }
}
/**
 * Seedream owns the image call, but the prompt is still composed from a micro-concept, so the
 * concept credentials are as required as the provider key itself.
 */
function seedreamProductionConfigurationFailure(policy: CreatureEvolutionPolicy): FailureDetails | null {
    const seedream = policy.seedream
    if (
        !seedream.apiKey ||
        !policy.microConcept.apiKey ||
        !policy.microConcept.model ||
        seedream.estimatedCostUsd === null ||
        seedream.maxEstimatedCostUsd === null
    ) {
        return { code: 'FAL_FLUX_NOT_CONFIGURED', message: 'La pipeline Seedream non e configurata.' }
    }
    if (seedream.estimatedCostUsd > seedream.maxEstimatedCostUsd)
        return {
            code: 'FLUX_REQUEST_COST_LIMIT_EXCEEDED',
            message: 'Il costo stimato Seedream supera il limite consentito.',
        }
    return null
}

function realImageReservationLimits(policy: CreatureEvolutionPolicy) {
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
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, canonicalizeForFingerprint((value as Record<string, unknown>)[key])]),
        )
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

function reservationFailure(
    requestId: string,
    result: Exclude<RequestReservationResult, { outcome: 'CREATED' | 'EXISTING' }>,
): CreatureTransformationErrorResponse {
    if (result.outcome === 'CREATURE_NOT_OWNED')
        return failure(requestId, 'CREATURE_NOT_OWNED', 'La creatura non appartiene al profilo autenticato.')
    if (result.outcome === 'DAILY_LIMIT_REACHED')
        return failure(
            requestId,
            'DAILY_LIMIT_REACHED',
            'Hai raggiunto il limite giornaliero di richieste del laboratorio.',
        )
    if (result.outcome === 'REAL_IMAGE_USER_LIMIT_REACHED')
        return failure(requestId, result.outcome, 'Hai raggiunto il limite giornaliero di immagini reali.')
    if (result.outcome === 'REAL_IMAGE_USER_CONCURRENCY_REACHED')
        return failure(requestId, result.outcome, 'Hai gia una generazione immagini reale in corso.')
    if (result.outcome === 'REAL_IMAGE_COOLDOWN_ACTIVE')
        return failure(requestId, result.outcome, 'Attendi il cooldown prima di una nuova immagine reale.')
    if (result.outcome === 'REAL_IMAGE_GLOBAL_LIMIT_REACHED')
        return failure(requestId, result.outcome, 'Il limite globale giornaliero immagini e stato raggiunto.')
    if (result.outcome === 'REAL_IMAGE_GLOBAL_CONCURRENCY_REACHED')
        return failure(requestId, result.outcome, 'Ci sono gia troppe immagini reali in elaborazione.')
    if (result.outcome === 'IDEMPOTENCY_KEY_REUSED')
        return failure(requestId, result.outcome, 'La idempotency key e gia associata a una richiesta diversa.')
    return failure(
        requestId,
        'DAILY_BUDGET_REACHED',
        'Il budget giornaliero del laboratorio non consente questa richiesta.',
    )
}
function existingStateFailure(
    requestId: string,
    record: CreatureTransformationRequestRecord,
    policy: CreatureEvolutionPolicy,
): CreatureTransformationErrorResponse | null {
    const persistence = toPersistence(record, 'EXISTING')
    if (record.status === 'SUCCEEDED') return null
    if (record.status === 'FAILED')
        return failure(
            requestId,
            'REQUEST_PREVIOUSLY_FAILED',
            'La richiesta con questa idempotency key era gia fallita; avvia un nuovo tentativo con una nuova key.',
            undefined,
            persistence,
        )
    if (isStale(record, policy.staleRequestSeconds))
        return failure(
            requestId,
            'REQUEST_STALE',
            'La richiesta precedente risulta bloccata; non viene riavviata automaticamente.',
            undefined,
            persistence,
        )
    return failure(
        requestId,
        'REQUEST_ALREADY_IN_PROGRESS',
        'La richiesta con questa idempotency key e gia in corso.',
        undefined,
        persistence,
    )
}

function acceptedGeneration(
    requestId: string,
    record: CreatureTransformationRequestRecord,
    idempotencyStatus: TransformationRequestIdempotencyStatus,
): GenerateImageAcceptedResponse {
    return { success: true, accepted: true, requestId, requestPersistence: toPersistence(record, idempotencyStatus) }
}

function visualProgressionReadAccessFailure(policy: CreatureEvolutionPolicy): FailureDetails | null {
    if (!policy.visualProgression.enabled)
        return { code: 'VISUAL_PROGRESSION_DISABLED', message: 'La progressione visiva non e abilitata.' }
    return null
}

function visualProgressionAccessFailure(
    policy: CreatureEvolutionPolicy,
    capability: 'GENERATE' | 'ADOPT',
): FailureDetails | null {
    const readAccess = visualProgressionReadAccessFailure(policy)
    if (readAccess) return readAccess
    if (capability === 'GENERATE' && !policy.visualProgression.productionGenerationEnabled)
        return {
            code: 'VISUAL_PRODUCTION_GENERATION_DISABLED',
            message: 'La generazione visuale di produzione non e abilitata.',
        }
    if (capability === 'ADOPT' && !policy.visualProgression.adoptionEnabled)
        return { code: 'VISUAL_ADOPTION_DISABLED', message: 'L adozione visuale non e abilitata.' }
    return null
}

async function toCurrentVisualResponse(
    input: CreatureTransformationEdgeOrchestrationInput,
    version: StoredVisualVersion,
) {
    const displayAvailable = Boolean(
        version.displayAssetPath &&
        version.displayAssetSha256 &&
        version.displayMimeType === 'image/webp' &&
        version.displayWidth &&
        version.displayHeight,
    )
    const assetPath = displayAvailable ? version.displayAssetPath! : version.assetPath
    const signed = await input.storage.createVisualVersionSignedUrl({
        assetPath,
        isBaseVersion: !displayAvailable && version.visualTraitId === null,
    })
    return {
        creatureId: version.creatureId,
        versionId: version.id,
        versionNumber: version.versionNumber,
        signedUrl: signed.signedUrl,
        expiresAt: signed.expiresAt,
        width: displayAvailable ? version.displayWidth! : version.width,
        height: displayAvailable ? version.displayHeight! : version.height,
        mimeType: displayAvailable ? 'image/webp' : version.mimeType,
        sha256: displayAvailable ? version.displayAssetSha256! : version.assetSha256,
        isBaseVersion: version.visualTraitId === null,
    } as const
}

async function toVisualHistoryResponse(
    input: CreatureTransformationEdgeOrchestrationInput,
    profileId: string,
    creatureId: string,
) {
    const versions = await input.visualRepository.listVisualHistory({ profileId, creatureId })
    return Promise.all(
        versions.map(async (version) => {
            const signed = await input.storage.createVisualVersionSignedUrl({
                assetPath: version.assetPath,
                isBaseVersion: version.visualTraitId === null,
            })
            return {
                id: version.id,
                versionNumber: version.versionNumber,
                visualTraitId: version.visualTraitId,
                evolutionTargetId: version.evolutionTargetId ?? null,
                evolutionFunction: version.evolutionFunction ?? null,
                conceptName: version.conceptName,
                signedUrl: signed.signedUrl,
                expiresAt: signed.expiresAt,
            }
        }),
    )
}

function currentVisualVersionSummary(version: StoredVisualVersion): CreatureVisualProgressResponse['currentVersion'] {
    return {
        id: version.id,
        versionNumber: version.versionNumber,
        visualTraitId: version.visualTraitId,
        conceptName: version.conceptName,
        shortDescription: version.visualInspection?.observedVisualState?.shortDescription ?? null,
    }
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

async function restoreVisualTrackAfterFailure(
    input: CreatureTransformationEdgeOrchestrationInput,
    trackId: string,
    record: CreatureTransformationRequestRecord,
) {
    try {
        await input.visualRepository.completeGeneration({
            profileId: input.profileId!,
            trackId,
            requestId: record.id,
            finalAsset: false,
        })
    } catch (error) {
        console.error('Creature visual track restore failed', {
            requestId: input.requestId,
            transformationRequestId: record.id,
            code: mapThrownError(error).code,
        })
    }
}

export async function orchestrateGetCreatureVisualProgress(
    input: CreatureTransformationEdgeOrchestrationInput,
): Promise<CreatureVisualProgressResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseGetCreatureVisualProgressRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const access = visualProgressionReadAccessFailure(input.policy)
    if (access) return failure(input.requestId, access.code, access.message)
    try {
        const [initialTrack, current, source] = await Promise.all([
            input.visualRepository.getTrack({ profileId: input.profileId, creatureId: parsed.request.creatureId }),
            input.visualRepository.getCurrentVersion({
                profileId: input.profileId,
                creatureId: parsed.request.creatureId,
            }),
            input.resolver.resolve({ profileId: input.profileId, creatureId: parsed.request.creatureId }),
        ])
        if (!current)
            return failure(input.requestId, 'CURRENT_VISUAL_UNAVAILABLE', 'La visuale corrente non e disponibile.')
        const track =
            initialTrack?.status === 'GENERATED' && initialTrack.generatedRequestId
                ? await (async () => {
                      const generated = await input.repository.getById({
                          profileId: input.profileId!,
                          requestId: initialTrack.generatedRequestId!,
                      })
                      return generated?.assetReadiness !== 'FINAL_ASSET'
                          ? input.visualRepository.restoreNonFinalGeneration({
                                profileId: input.profileId!,
                                trackId: initialTrack.id,
                                requestId: initialTrack.generatedRequestId!,
                            })
                          : initialTrack
                  })()
                : initialTrack
        const [lastExperiment, lastFailure] = track
            ? await Promise.all([
                  input.visualRepository.getLatestExperiment({ profileId: input.profileId, trackId: track.id }),
                  input.visualRepository.getLatestFailure({ profileId: input.profileId, trackId: track.id }),
              ])
            : [null, null]
        return {
            success: true,
            requestId: input.requestId,
            track,
            lastExperiment,
            lastFailure: track?.status === 'READY' ? lastFailure : null,
            currentVersion: currentVisualVersionSummary(current),
            history: await toVisualHistoryResponse(input, input.profileId, parsed.request.creatureId),
            bodyPlan: toBodyPlanResponse(source),
        }
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message)
    }
}

export async function orchestrateGetCurrentCreatureVisual(
    input: CreatureTransformationEdgeOrchestrationInput,
): Promise<CurrentCreatureVisualApiResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseGetCurrentCreatureVisualRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const access = visualProgressionReadAccessFailure(input.policy)
    if (access) return failure(input.requestId, access.code, access.message)
    try {
        const version = await input.visualRepository.getCurrentVersion({
            profileId: input.profileId,
            creatureId: parsed.request.creatureId,
        })
        if (!version)
            return failure(input.requestId, 'CURRENT_VISUAL_UNAVAILABLE', 'La visuale corrente non e disponibile.')
        return { success: true, requestId: input.requestId, visual: await toCurrentVisualResponse(input, version) }
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message)
    }
}

export async function orchestrateGetGameCreatureVisuals(
    input: CreatureTransformationEdgeOrchestrationInput,
): Promise<GameCreatureVisualsResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseGetGameCreatureVisualsRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const access = visualProgressionReadAccessFailure(input.policy)
    if (access) return failure(input.requestId, access.code, access.message)
    try {
        const participants = await input.visualRepository.listGameHumanParticipants(parsed.request.gameId)
        const me = participants.find((participant) => participant.profileId === input.profileId)
        if (!me)
            return failure(
                input.requestId,
                'OPPONENT_VISUAL_NOT_AUTHORIZED',
                'Non sei un partecipante autorizzato alla partita.',
            )
        const opponent = participants.find((participant) => participant.profileId !== input.profileId) ?? null
        const ownVersion = await input.visualRepository.getCurrentVersion({
            profileId: me.profileId,
            creatureId: me.creatureId,
        })
        if (!ownVersion)
            return failure(input.requestId, 'CURRENT_VISUAL_UNAVAILABLE', 'La visuale corrente non e disponibile.')
        const opponentVersion = opponent
            ? await input.visualRepository.getCurrentVersion({
                  profileId: opponent.profileId,
                  creatureId: opponent.creatureId,
              })
            : null
        return {
            success: true,
            requestId: input.requestId,
            player: await toCurrentVisualResponse(input, ownVersion),
            opponent: opponentVersion ? await toCurrentVisualResponse(input, opponentVersion) : null,
        }
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message)
    }
}

/**
 * The production evolution: progress track → resolver → body plan → anatomy contract →
 * micro-concept → locked prompt → Seedream on Fal Queue → validation in the finalizer →
 * background-removal handover → adoption. This call ends at submission and returns 'accepted'.
 */
export async function orchestrateGenerateUnlockedTransformation(
    input: CreatureTransformationEdgeOrchestrationInput,
): Promise<GenerateImageAcceptedResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseGenerateUnlockedTransformationRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const access = visualProgressionAccessFailure(input.policy, 'GENERATE')
    if (access) return failure(input.requestId, access.code, access.message)
    const generationAccess = generationAccessFailure(input)
    if (generationAccess) return failure(input.requestId, generationAccess.code, generationAccess.message)
    const configuration = seedreamProductionConfigurationFailure(input.policy)
    if (configuration) return failure(input.requestId, configuration.code, configuration.message)
    try {
        const [track, source] = await Promise.all([
            input.visualRepository.getTrack({ profileId: input.profileId, creatureId: parsed.request.creatureId }),
            input.resolver.resolve({ profileId: input.profileId, creatureId: parsed.request.creatureId }),
        ])
        if (!track || track.id !== parsed.request.progressTrackId)
            return failure(input.requestId, 'VISUAL_TRACK_NOT_FOUND', 'Il percorso visuale non e disponibile.')
        if (track.status === 'GENERATING')
            return failure(
                input.requestId,
                'VISUAL_GENERATION_ALREADY_RUNNING',
                'La generazione visuale e gia in corso.',
            )
        if (track.status !== 'READY')
            return failure(
                input.requestId,
                'VISUAL_TRACK_NOT_READY',
                'Il percorso deve essere sbloccato prima della generazione.',
            )
        if (!track.evolutionTargetId)
            return failure(
                input.requestId,
                'VISUAL_TRACK_STATE_CONFLICT',
                'Il percorso visuale non ha un target evolutivo.',
            )
        if (!source.bodyPlan)
            return failure(
                input.requestId,
                'FLUX_BODY_PLAN_UNSUPPORTED',
                'La topologia anatomica della creatura non e configurata.',
            )
        // Normal gameplay never carries a structural mutation request: the capability needs both
        // the server policy switch and the Seedream-specific structural opt-in.
        const bodyPlanMutationEnabled =
            input.policy.bodyPlanMutation.enabled && input.policy.seedream.structuralMutationsEnabled
        const plan = buildFluxEvolutionPlan({
            bodyPlan: source.bodyPlan,
            evolutionTargetId: track.evolutionTargetId,
            previousTransformations: source.previousTransformations,
            seed: parsed.request.idempotencyKey,
            bodyPlanMutationEnabled,
            adoptedBodyPlanMutationIds: source.adoptedBodyPlanMutationIds,
        })
        const resolvedTrack = await input.visualRepository.resolveTrackTrait({
            profileId: input.profileId,
            creatureId: parsed.request.creatureId,
            trackId: track.id,
            visualTraitId: plan.visualTraitId,
        })
        if (!resolvedTrack.visualTraitId)
            return failure(
                input.requestId,
                'VISUAL_TRACK_STATE_CONFLICT',
                'Il percorso non ha una direzione funzionale risolvibile.',
            )
        const fingerprint = await requestFingerprint({
            operation: parsed.request.operation,
            creatureId: parsed.request.creatureId,
            progressTrackId: parsed.request.progressTrackId,
            visualTraitId: plan.visualTraitId,
            evolutionTargetId: plan.evolutionTargetId,
            capability: plan.capability,
            sourceVisualVersionId: source.currentVisualVersionId,
            idempotencyKey: parsed.request.idempotencyKey,
        })
        const reservation = await input.repository.reserve({
            profileId: input.profileId,
            creatureId: parsed.request.creatureId,
            idempotencyKey: parsed.request.idempotencyKey,
            operation: 'GENERATE_UNLOCKED_TRANSFORMATION',
            visualTraitId: plan.visualTraitId,
            intensity: 2,
            imageProviderMode: 'REAL',
            estimatedCostUsd: input.policy.seedream.estimatedCostUsd ?? 0,
            dailyRequestLimit: input.policy.dailyRequestLimit,
            dailyBudgetUsd: input.policy.dailyBudgetUsd,
            requestFingerprint: fingerprint,
            ...realImageReservationLimits(input.policy),
            visualProgressTrackId: resolvedTrack.id,
            sourceVisualVersionId: source.currentVisualVersionId,
            evolutionTargetId: plan.evolutionTargetId,
            evolutionFunction: plan.evolutionFunction,
        })
        if (reservation.outcome !== 'CREATED' && reservation.outcome !== 'EXISTING')
            return reservationFailure(input.requestId, reservation)
        if (reservation.record.operation !== 'GENERATE_UNLOCKED_TRANSFORMATION')
            return failure(
                input.requestId,
                'REQUEST_STATE_CONFLICT',
                'La idempotency key appartiene a un operazione diversa.',
            )
        if (reservation.outcome === 'EXISTING') {
            const existing = existingStateFailure(input.requestId, reservation.record, input.policy)
            return (
                existing ??
                failure(
                    input.requestId,
                    'IDEMPOTENT_REQUEST_ALREADY_COMPLETED',
                    'Questa generazione visuale e gia stata completata; avvia un nuovo tentativo.',
                    undefined,
                    toPersistence(reservation.record, 'EXISTING'),
                )
            )
        }
        let startedTrack
        try {
            startedTrack = await input.visualRepository.startGeneration({
                profileId: input.profileId,
                creatureId: parsed.request.creatureId,
                trackId: resolvedTrack.id,
                requestId: reservation.record.id,
            })
        } catch (error) {
            try {
                await input.repository.markFailed({
                    requestId: reservation.record.id,
                    profileId: input.profileId,
                    errorCode: 'VISUAL_TRACK_STATE_CONFLICT',
                    errorMessage: 'Il percorso visuale non puo iniziare la generazione.',
                })
            } catch {
                /* the track remains authoritative */
            }
            throw error
        }
        if (startedTrack.status !== 'GENERATING')
            return failure(
                input.requestId,
                'VISUAL_TRACK_STATE_CONFLICT',
                'Il percorso visuale non puo iniziare la generazione.',
            )
        let running: CreatureTransformationRequestRecord
        try {
            running = await input.repository.markRunning({
                requestId: reservation.record.id,
                profileId: input.profileId,
            })
        } catch (error) {
            await restoreVisualTrackAfterFailure(input, resolvedTrack.id, reservation.record)
            const details = mapThrownError(error)
            return failure(input.requestId, details.code, details.message)
        }
        if (!input.createFluxMicroConceptGenerator || !input.falWebhookUrl || !input.createSeedreamEvolutionProvider) {
            try {
                await input.repository.markFailed({
                    requestId: running.id,
                    profileId: input.profileId,
                    errorCode: 'FAL_FLUX_NOT_CONFIGURED',
                    errorMessage: 'La generazione visuale non e disponibile.',
                })
            } catch {
                /* preserve the safe track restore */
            }
            await restoreVisualTrackAfterFailure(input, resolvedTrack.id, running)
            return failure(input.requestId, 'FAL_FLUX_NOT_CONFIGURED', 'La generazione visuale non e disponibile.')
        }
        try {
            const queueSource = Object.freeze({
                kind: 'CANONICAL' as const,
                path: source.sourceImagePath,
                isBaseVersion: source.sourceIsBaseVersion,
            })
            const workflow: FalQueueWorkflow = Object.freeze({
                version: 1,
                kind: 'SEEDREAM_PRODUCTION',
                source: queueSource,
                parameters: input.policy.seedream.parameters,
            })
            const submitted = await submitSeedreamEvolutionForAuthenticatedProfile({
                identity: source.identity,
                plan,
                source: queueSource,
                storage: input.storage,
                microConceptGenerator: input.createFluxMicroConceptGenerator(),
                provider: input.createSeedreamEvolutionProvider(),
                webhookUrl: input.falWebhookUrl,
                parameters: input.policy.seedream.parameters,
                sourceUrlTtlSeconds: input.policy.seedream.submissionSourceUrlTtlSeconds,
                visualInspection: source.visualInspection,
                ...(input.validator ? { validator: input.validator } : {}),
            })
            const persisted = await input.repository.updateRunningFalSubmission({
                requestId: running.id,
                profileId: input.profileId,
                data: {
                    provider: submitted.submission.provider,
                    model: submitted.submission.model,
                    providerRequestId: submitted.submission.providerRequestId,
                    sourceSha256: submitted.sourceSha256,
                    promptTemplateVersion: submitted.promptTemplateVersion,
                    promptSha256: submitted.promptSha256,
                    promptText: submitted.prompt,
                    conceptSnapshot: submitted.conceptSnapshot,
                    falWorkflow: workflow,
                },
            })
            return acceptedGeneration(input.requestId, persisted, 'CREATED')
        } catch (error) {
            const details = mapThrownError(error)
            try {
                await input.repository.markFailed({
                    requestId: running.id,
                    profileId: input.profileId,
                    errorCode: details.code,
                    errorMessage: persistedFailureMessage(details),
                })
            } catch {
                /* the visual track restore remains required */
            }
            await restoreVisualTrackAfterFailure(input, resolvedTrack.id, running)
            return failure(input.requestId, details.code, details.message)
        }
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message)
    }
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
    return (
        bytes.length >= 12 &&
        String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
        String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
    )
}

export async function orchestrateSubmitBackgroundRemovalCandidate(
    input: CreatureTransformationEdgeOrchestrationInput,
): Promise<SubmitBackgroundRemovalCandidateResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseSubmitBackgroundRemovalCandidateRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const bytes = decodeBackgroundRemovalCandidate(parsed.request.candidatePngBase64)
    if (!bytes)
        return failure(
            input.requestId,
            'BACKGROUND_REMOVAL_CANDIDATE_INVALID',
            'Il PNG elaborato non puo essere decodificato.',
        )
    const displayBytes = parsed.request.displayAssetWebpBase64
        ? decodeBackgroundRemovalCandidate(parsed.request.displayAssetWebpBase64)
        : null
    if (parsed.request.displayAssetWebpBase64 && (!displayBytes || !isWebp(displayBytes)))
        return failure(input.requestId, 'BACKGROUND_REMOVAL_CANDIDATE_INVALID', 'Il display asset WebP non e valido.')
    let record: CreatureTransformationRequestRecord | null
    try {
        record = await input.repository.getById({
            profileId: input.profileId,
            requestId: parsed.request.transformationRequestId,
        })
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message, details.problems)
    }
    if (!record)
        return failure(input.requestId, 'REQUEST_NOT_FOUND', 'La richiesta di trasformazione non e disponibile.')
    if (record.operation !== 'GENERATE_UNLOCKED_TRANSFORMATION' || record.status !== 'SUCCEEDED') {
        return failure(input.requestId, 'REQUEST_STATE_CONFLICT', 'La richiesta non e pronta per il PNG elaborato.')
    }
    // The candidate submission can be retried when its first HTTP response was
    // lost. Returning the already-final record also absorbs any duplicate from
    // a browser render that began before the in-flight guard was introduced.
    // A finalized candidate is always the validated PNG: `resultMimeType` still holds the raw
    // generation format (Seedream can return JPEG) until candidate finalization overwrites it, so
    // the format is checked here rather than assumed — an unfinalized record falls through below.
    if (
        record.assetReadiness === 'FINAL_ASSET' &&
        record.resultSha256 &&
        record.resultMimeType === 'image/png' &&
        record.resultWidth &&
        record.resultHeight
    ) {
        return {
            success: true,
            requestId: input.requestId,
            requestPersistence: toPersistence(record, 'EXISTING'),
            candidate: {
                assetReadiness: 'FINAL_ASSET',
                sha256: record.resultSha256,
                mimeType: record.resultMimeType,
                width: record.resultWidth,
                height: record.resultHeight,
                warnings: record.validationWarnings,
            },
        }
    }
    if (record.assetReadiness !== 'EXPERIMENT_ONLY') {
        return failure(input.requestId, 'REQUEST_STATE_CONFLICT', 'La richiesta non e pronta per il PNG elaborato.')
    }
    const validation = await (input.validator ?? new ImageValidator()).validate({
        bytes,
        mimeType: 'image/png',
        sourceSha256: record.resultSha256 ?? undefined,
        renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
        requireAlphaCoverage: true,
        requireTransparentEdges: true,
    })
    if (!validation.valid)
        return failure(
            input.requestId,
            'BACKGROUND_REMOVAL_CANDIDATE_INVALID',
            'Il PNG elaborato non ha superato la validazione alpha.',
            validation.problems,
        )
    try {
        const candidatePath = await input.storage.createCandidateObjectPath(input.profileId, record.id)
        await input.storage.saveBackgroundRemovalCandidate({
            profileId: input.profileId,
            transformationRequestId: record.id,
            image: bytes,
        })
        const displayAsset = displayBytes
            ? {
                  path: await input.storage.createDisplayObjectPath(record.id),
                  sha256: await sha256Hex(displayBytes),
                  width: 512,
                  height: 768,
              }
            : undefined
        if (displayBytes) await input.storage.saveDisplayAsset({ key: record.id, image: displayBytes })
        const finalized = await input.repository.finalizeBackgroundRemovalCandidate({
            requestId: record.id,
            profileId: input.profileId,
            candidatePath,
            candidateSha256: validation.metadata.sha256,
            candidateMimeType: validation.metadata.mimeType,
            candidateWidth: validation.metadata.width,
            candidateHeight: validation.metadata.height,
            validationWarnings: validation.warnings,
            ...(displayAsset ? { displayAsset } : {}),
        })
        return {
            success: true,
            requestId: input.requestId,
            requestPersistence: toPersistence(finalized, 'CREATED'),
            // The validator above was given `image/png` and enforced alpha coverage, so the
            // response states the format the candidate was validated against.
            candidate: {
                assetReadiness: 'FINAL_ASSET',
                sha256: validation.metadata.sha256,
                mimeType: 'image/png',
                width: validation.metadata.width,
                height: validation.metadata.height,
                warnings: validation.warnings,
            },
        }
    } catch (error) {
        const details = mapThrownError(error)
        const databaseCode =
            error instanceof CreatureTransformationRequestRepositoryError
                ? getSafeDatabaseLookupCode(error.cause)
                : 'UNKNOWN'
        console.error('Creature background-removal candidate finalization failed', {
            requestId: input.requestId,
            transformationRequestId: record.id,
            code: details.code,
            databaseCode,
        })
        const message =
            details.code === 'REQUEST_PERSISTENCE_FAILED'
                ? `${details.message} Diagnostica database: ${databaseCode}.`
                : details.message
        return failure(input.requestId, details.code, message, details.problems)
    }
}
/**
 * Adoption promotes the generated asset to the creature's active visual. When the adopted
 * generation carried a structural mutation, the canonical body plan of the creature changes with
 * it, so every later generation is contracted against the new topology.
 */
export async function orchestrateAdoptCreatureTransformation(
    input: CreatureTransformationEdgeOrchestrationInput,
): Promise<AdoptCreatureTransformationResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseAdoptCreatureTransformationRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const access = visualProgressionAccessFailure(input.policy, 'ADOPT')
    if (access) return failure(input.requestId, access.code, access.message)
    try {
        const version = await input.visualRepository.adopt({
            profileId: input.profileId,
            creatureId: parsed.request.creatureId,
            trackId: parsed.request.progressTrackId,
            requestId: parsed.request.transformationRequestId,
            expectedCurrentVisualVersionId: parsed.request.expectedCurrentVisualVersionId,
        })
        const source = await input.resolver.resolve({
            profileId: input.profileId,
            creatureId: parsed.request.creatureId,
        })
        return {
            success: true,
            requestId: input.requestId,
            version: {
                id: version.id,
                versionNumber: version.versionNumber,
                visualTraitId: version.visualTraitId,
                conceptName: version.conceptName,
            },
            bodyPlanId: source.bodyPlan?.id ?? null,
        }
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message)
    }
}

export async function orchestrateRollbackCreatureVisualVersion(
    input: CreatureTransformationEdgeOrchestrationInput,
): Promise<AdoptCreatureTransformationResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseRollbackCreatureVisualVersionRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    const access = visualProgressionAccessFailure(input.policy, 'ADOPT')
    if (access) return failure(input.requestId, access.code, access.message)
    try {
        const version = await input.visualRepository.rollback({
            profileId: input.profileId,
            creatureId: parsed.request.creatureId,
            targetVersionId: parsed.request.targetVersionId,
            expectedCurrentVisualVersionId: parsed.request.expectedCurrentVisualVersionId,
        })
        const source = await input.resolver.resolve({
            profileId: input.profileId,
            creatureId: parsed.request.creatureId,
        })
        return {
            success: true,
            requestId: input.requestId,
            version: {
                id: version.id,
                versionNumber: version.versionNumber,
                visualTraitId: version.visualTraitId,
                conceptName: version.conceptName,
            },
            bodyPlanId: source.bodyPlan?.id ?? null,
        }
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message)
    }
}

export async function orchestrateGetTransformationRequestStatus(
    input: CreatureTransformationEdgeOrchestrationInput,
): Promise<TransformationRequestStatusResponse | CreatureTransformationErrorResponse> {
    if (!input.profileId) return failure(input.requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.')
    const parsed = parseGetTransformationRequestStatusRequest(input.body)
    if (!parsed.valid) return failure(input.requestId, parsed.code, parsed.message)
    let record: CreatureTransformationRequestRecord | null
    try {
        record = await input.repository.getById({
            profileId: input.profileId,
            requestId: parsed.request.transformationRequestId,
        })
    } catch (error) {
        const details = mapThrownError(error)
        return failure(input.requestId, details.code, details.message, details.problems)
    }
    if (!record)
        return failure(input.requestId, 'REQUEST_NOT_FOUND', 'La richiesta di trasformazione non e disponibile.')

    const snapshot = isFluxEvolutionSnapshot(record.conceptSnapshot) ? record.conceptSnapshot : null
    const response: TransformationRequestStatusResponse = {
        success: true,
        requestId: input.requestId,
        requestPersistence: toStatusPersistence(record),
        ...(record.provider && record.model
            ? {
                  generation: {
                      provider: record.provider,
                      model: record.model,
                      ...(record.providerRequestId ? { providerRequestId: record.providerRequestId } : {}),
                      ...(record.generationLatencyMs === null ? {} : { latencyMs: record.generationLatencyMs }),
                      ...(record.estimatedCostUsd === null ? {} : { estimatedCostUsd: record.estimatedCostUsd }),
                      ...(record.actualCostUsd === null ? {} : { actualCostUsd: record.actualCostUsd }),
                  },
              }
            : {}),
        ...(record.assetReadiness === 'EXPERIMENT_ONLY' && record.promptText && record.promptSha256
            ? { prompt: { text: record.promptText, sha256: record.promptSha256 } }
            : {}),
        ...(record.status === 'FAILED' && record.errorCode && record.errorMessage
            ? { error: { code: record.errorCode, message: record.errorMessage } }
            : {}),
        ...(record.visualProgressTrackId && record.sourceVisualVersionId && record.visualTraitId
            ? {
                  productPreview: {
                      progressTrackId: record.visualProgressTrackId,
                      sourceVisualVersionId: record.sourceVisualVersionId,
                      visualTraitId: record.visualTraitId,
                      conceptName: snapshot?.conceptName ?? 'Evoluzione visuale',
                      evolutionaryFunction:
                          snapshot?.mutationIdea ?? 'Proposta visuale generata e validata dal server.',
                      warnings: record.validationWarnings,
                  },
              }
            : {}),
        ...(snapshot
            ? {
                  fluxSnapshot: {
                      conceptName: snapshot.conceptName,
                      mutationIdea: snapshot.mutationIdea,
                      evolutionTargetId: snapshot.evolutionTargetId,
                      evolutionFunction: snapshot.evolutionFunction,
                      capability: readFluxSnapshotCapability(snapshot),
                      ...(snapshot.bodyPlanMutationId ? { bodyPlanMutationId: snapshot.bodyPlanMutationId } : {}),
                      ...(snapshot.resultBodyPlanId ? { resultBodyPlanId: snapshot.resultBodyPlanId } : {}),
                  },
              }
            : {}),
    }
    if (record.status !== 'SUCCEEDED') return response
    if (
        !record.resultPath ||
        !record.resultSha256 ||
        !record.resultMimeType ||
        !record.resultWidth ||
        !record.resultHeight
    ) {
        return {
            ...response,
            error: { code: 'REQUEST_PERSISTENCE_FAILED', message: 'Il risultato persistito non e recuperabile.' },
        }
    }
    try {
        const signed = await input.storage.createResultSignedUrl(record.resultPath)
        const result = {
            signedUrl: signed.signedUrl,
            expiresAt: signed.expiresAt,
            width: record.resultWidth,
            height: record.resultHeight,
            mimeType: record.resultMimeType,
            sha256: record.resultSha256,
            assetReadiness: record.assetReadiness ?? 'FINAL_ASSET',
            warnings: record.validationWarnings,
        } as const
        return {
            ...response,
            result,
            ...(record.assetReadiness === 'EXPERIMENT_ONLY'
                ? {
                      rawResult: {
                          signedUrl: result.signedUrl,
                          expiresAt: result.expiresAt,
                          width: result.width,
                          height: result.height,
                          mimeType: result.mimeType,
                          sha256: result.sha256,
                      },
                  }
                : {}),
        }
    } catch (error) {
        const details = mapThrownError(error)
        return { ...response, error: { code: details.code, message: details.message } }
    }
}

export async function orchestrateCreatureTransformation(
    input: CreatureTransformationEdgeOrchestrationInput,
): Promise<CreatureTransformationApiResponse> {
    const operation =
        input.body && typeof input.body === 'object' && !Array.isArray(input.body)
            ? (input.body as { operation?: unknown }).operation
            : undefined
    if (operation === 'GENERATE_UNLOCKED_TRANSFORMATION') return orchestrateGenerateUnlockedTransformation(input)
    if (operation === 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE') return orchestrateSubmitBackgroundRemovalCandidate(input)
    if (operation === 'GET_REQUEST_STATUS') return orchestrateGetTransformationRequestStatus(input)
    if (operation === 'GET_VISUAL_PROGRESS') return orchestrateGetCreatureVisualProgress(input)
    if (operation === 'GET_CURRENT_VISUAL') return orchestrateGetCurrentCreatureVisual(input)
    if (operation === 'GET_GAME_VISUALS') return orchestrateGetGameCreatureVisuals(input)
    if (operation === 'ADOPT_CREATURE_TRANSFORMATION') return orchestrateAdoptCreatureTransformation(input)
    if (operation === 'ROLLBACK_CREATURE_VISUAL_VERSION') return orchestrateRollbackCreatureVisualVersion(input)
    return failure(input.requestId, 'OPERATION_NOT_IMPLEMENTED', 'operation non e supportata.')
}
