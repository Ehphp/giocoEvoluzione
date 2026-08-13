import type { CreatureTransformationAssetReadiness } from '../../../shared/creature-transformations/api-contracts.ts'
import type { TransformationCost, TransformationRequestStatus } from '../../../shared/creature-transformations/request-persistence.ts'
import type { CreatureTransformationConceptSnapshot } from '../../../shared/creature-transformations/creature-visual-versions.ts'
import type { EvolutionFunctionId, EvolutionTargetId } from '../../../shared/creature-transformations/evolution-targets.ts'

export type CreatureTransformationRequestOperation = 'GENERATE_CONCEPT' | 'GENERATE_IMAGE' | 'GENERATE_UNLOCKED_TRANSFORMATION'

export type CreatureTransformationRequestRecord = Readonly<{
    id: string
    profileId: string
    creatureId: string
    idempotencyKey: string
    operation: CreatureTransformationRequestOperation
    status: TransformationRequestStatus
    conceptMode: 'MOCK' | 'AI' | null
    imageProviderMode: 'MOCK' | 'REAL' | null
    benchmarkCaseId: string | null
    generationProfileId: string | null
    conceptSeed: string | null
    promptSha256: string | null
    promptText: string | null
    generationQuality: 'low' | 'medium' | 'high' | null
    visualProgressTrackId: string | null
    sourceVisualVersionId: string | null
    evolutionTargetId: EvolutionTargetId | null
    evolutionFunction: EvolutionFunctionId | null
    provider: string | null
    model: string | null
    providerRequestId: string | null
    visualTraitId: string | null
    intensity: number | null
    promptTemplateVersion: string | null
    conceptSchemaVersion: number | null
    sourceSha256: string | null
    resultSha256: string | null
    resultPath: string | null
    resultMimeType: 'image/png' | null
    resultWidth: number | null
    resultHeight: number | null
    generationLatencyMs: number | null
    estimatedCostUsd: number | null
    actualCostUsd: number | null
    assetReadiness: CreatureTransformationAssetReadiness | null
    validationWarnings: string[]
    conceptSnapshot: CreatureTransformationConceptSnapshot | null
    attemptCount: number
    errorCode: string | null
    errorMessage: string | null
    createdAt: string
    startedAt: string | null
    completedAt: string | null
    updatedAt: string
}>

export type RequestReservationOutcome = 'CREATED' | 'EXISTING' | 'DAILY_LIMIT_REACHED' | 'DAILY_BUDGET_REACHED' | 'CREATURE_NOT_OWNED' | 'IDEMPOTENCY_KEY_REUSED' | 'REAL_IMAGE_USER_LIMIT_REACHED' | 'REAL_IMAGE_USER_CONCURRENCY_REACHED' | 'REAL_IMAGE_COOLDOWN_ACTIVE' | 'REAL_IMAGE_GLOBAL_LIMIT_REACHED' | 'REAL_IMAGE_GLOBAL_CONCURRENCY_REACHED'
export type RequestReservationResult =
    | { outcome: 'CREATED' | 'EXISTING'; record: CreatureTransformationRequestRecord }
    | { outcome: Exclude<RequestReservationOutcome, 'CREATED' | 'EXISTING'> }

export type CreatureTransformationDailyUsage = Readonly<{
    requestCount: number
    realImageCount: number
    globalRealImageCount: number
    spentUsd: number
}>

export type ReserveCreatureTransformationRequestInput = TransformationCost & Readonly<{
    profileId: string
    creatureId: string
    idempotencyKey: string
    operation: CreatureTransformationRequestOperation
    visualTraitId?: string
    intensity?: number
    conceptMode?: 'MOCK' | 'AI'
    imageProviderMode?: 'MOCK' | 'REAL'
    benchmarkCaseId?: string
    generationProfileId?: string
    conceptSeed?: string
    visualProgressTrackId?: string
    sourceVisualVersionId?: string
    evolutionTargetId?: EvolutionTargetId
    evolutionFunction?: EvolutionFunctionId
    requestFingerprint?: string
    dailyRealImageLimit?: number
    globalDailyRealImageLimit?: number
    globalConcurrentRealImageLimit?: number
    realImageCooldownSeconds?: number
    staleRequestSeconds?: number
    dailyRequestLimit: number
    dailyBudgetUsd: number
}>

export type RequestTransitionData = TransformationCost & Readonly<{
    provider?: string
    model?: string
    providerRequestId?: string
    promptTemplateVersion?: string
    conceptSchemaVersion?: number
    sourceSha256?: string
    resultSha256?: string
    resultPath?: string
    resultMimeType?: 'image/png'
    resultWidth?: number
    resultHeight?: number
    generationLatencyMs?: number
    assetReadiness?: CreatureTransformationAssetReadiness
    validationWarnings?: string[]
    generationQuality?: 'low' | 'medium' | 'high'
    promptSha256?: string
    promptText?: string
    conceptSnapshot?: CreatureTransformationConceptSnapshot
    errorCode?: string
    errorMessage?: string
}>

export interface CreatureTransformationRequestRepository {
    reserve(input: ReserveCreatureTransformationRequestInput): Promise<RequestReservationResult>
    markRunning(input: { requestId: string; profileId: string }): Promise<CreatureTransformationRequestRecord>
    markSucceeded(input: { requestId: string; profileId: string; data: RequestTransitionData }): Promise<CreatureTransformationRequestRecord>
    markFailed(input: { requestId: string; profileId: string; errorCode: string; errorMessage: string }): Promise<CreatureTransformationRequestRecord>
    finalizeBackgroundRemovalCandidate(input: { requestId: string; profileId: string; candidatePath: string; candidateSha256: string; candidateMimeType: 'image/png'; candidateWidth: number; candidateHeight: number; validationWarnings: string[]; displayAsset?: { path: string; sha256: string; width: number; height: number } }): Promise<CreatureTransformationRequestRecord>
    getByIdempotencyKey(input: { profileId: string; idempotencyKey: string }): Promise<CreatureTransformationRequestRecord | null>
    getById(input: { profileId: string; requestId: string }): Promise<CreatureTransformationRequestRecord | null>
    getDailyUsage(input: { profileId: string }): Promise<CreatureTransformationDailyUsage>
    listCompletedImageRecords(input: { profileId: string; offset: number; limit: number }): Promise<CreatureTransformationRequestRecord[]>
}

type DatabaseError = { message?: string } | null
type RequestReadQuery = {
    eq(column: string, value: string): RequestReadQuery
    maybeSingle(): Promise<{ data: unknown; error: DatabaseError }>
}
type RequestListQuery = {
    eq(column: string, value: string): RequestListQuery
    order(column: string, options: { ascending: boolean }): RequestListQuery
    range(from: number, to: number): Promise<{ data: unknown; error: DatabaseError }>
}
export interface CreatureTransformationRequestRepositoryClient {
    rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: DatabaseError }>
    from(table: string): {
        select(columns: string): RequestReadQuery & RequestListQuery
    }
}

export type CreatureTransformationRequestRepositoryErrorCode =
    | 'REQUEST_RESERVATION_FAILED'
    | 'REQUEST_STATE_CONFLICT'
    | 'REQUEST_PERSISTENCE_FAILED'

export class CreatureTransformationRequestRepositoryError extends Error {
    readonly code: CreatureTransformationRequestRepositoryErrorCode

    constructor(code: CreatureTransformationRequestRepositoryErrorCode, message: string, options?: { cause?: unknown }) {
        super(message, options)
        this.name = 'CreatureTransformationRequestRepositoryError'
        this.code = code
    }
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readString(record: Record<string, unknown>, field: string, nullable = false): string | null {
    const value = record[field]
    if (value === null && nullable) return null
    if (typeof value !== 'string') return null
    return value
}

function readNumber(record: Record<string, unknown>, field: string, nullable = false): number | null {
    const value = record[field]
    if (value === null && nullable) return null
    const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
    return Number.isFinite(number) ? number : null
}

function readWarnings(record: Record<string, unknown>): string[] {
    const value = record.validation_warnings
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) return []
    return [...value]
}

function mapRecord(value: unknown): CreatureTransformationRequestRecord {
    const record = asRecord(value)
    if (!record) throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'Il record persistente restituito non e valido.')
    const required = ['id', 'profile_id', 'creature_id', 'idempotency_key', 'operation', 'status', 'created_at', 'updated_at']
    if (required.some((field) => !readString(record, field))) {
        throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'Il record persistente restituito non e completo.')
    }
    const status = readString(record, 'status') as TransformationRequestStatus
    if (!['RESERVED', 'RUNNING', 'SUCCEEDED', 'FAILED'].includes(status)) {
        throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'Lo stato persistente restituito non e supportato.')
    }
    const operation = readString(record, 'operation') as CreatureTransformationRequestOperation
    if (operation !== 'GENERATE_CONCEPT' && operation !== 'GENERATE_IMAGE' && operation !== 'GENERATE_UNLOCKED_TRANSFORMATION') {
        throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'L operazione persistente restituita non e supportata.')
    }

    return {
        id: readString(record, 'id')!, profileId: readString(record, 'profile_id')!, creatureId: readString(record, 'creature_id')!,
        idempotencyKey: readString(record, 'idempotency_key')!, operation, status,
        conceptMode: readString(record, 'concept_mode', true) as 'MOCK' | 'AI' | null,
        imageProviderMode: readString(record, 'image_provider_mode', true) as 'MOCK' | 'REAL' | null,
        benchmarkCaseId: readString(record, 'benchmark_case_id', true), generationProfileId: readString(record, 'generation_profile_id', true),
        conceptSeed: readString(record, 'concept_seed', true), promptSha256: readString(record, 'prompt_sha256', true), promptText: readString(record, 'prompt_text', true),
        generationQuality: readString(record, 'generation_quality', true) as 'low' | 'medium' | 'high' | null,
        visualProgressTrackId: readString(record, 'visual_progress_track_id', true), sourceVisualVersionId: readString(record, 'source_visual_version_id', true),
        evolutionTargetId: readString(record, 'evolution_target_id', true) as EvolutionTargetId | null,
        evolutionFunction: readString(record, 'evolution_function', true) as EvolutionFunctionId | null,
        provider: readString(record, 'provider', true), model: readString(record, 'model', true), providerRequestId: readString(record, 'provider_request_id', true),
        visualTraitId: readString(record, 'visual_trait_id', true), intensity: readNumber(record, 'intensity', true),
        promptTemplateVersion: readString(record, 'prompt_template_version', true), conceptSchemaVersion: readNumber(record, 'concept_schema_version', true),
        sourceSha256: readString(record, 'source_sha256', true), resultSha256: readString(record, 'result_sha256', true), resultPath: readString(record, 'result_path', true),
        resultMimeType: readString(record, 'result_mime_type', true) as 'image/png' | null, resultWidth: readNumber(record, 'result_width', true), resultHeight: readNumber(record, 'result_height', true),
        generationLatencyMs: readNumber(record, 'generation_latency_ms', true), estimatedCostUsd: readNumber(record, 'estimated_cost_usd', true), actualCostUsd: readNumber(record, 'actual_cost_usd', true),
        assetReadiness: readString(record, 'asset_readiness', true) as CreatureTransformationAssetReadiness | null, validationWarnings: readWarnings(record),
        conceptSnapshot: record.concept_snapshot && typeof record.concept_snapshot === 'object' ? record.concept_snapshot as CreatureTransformationConceptSnapshot : null,
        attemptCount: readNumber(record, 'attempt_count') ?? 0, errorCode: readString(record, 'error_code', true), errorMessage: readString(record, 'error_message', true),
        createdAt: readString(record, 'created_at')!, startedAt: readString(record, 'started_at', true), completedAt: readString(record, 'completed_at', true), updatedAt: readString(record, 'updated_at')!,
    }
}

function readRpcResult(value: unknown): { outcome: string; record?: CreatureTransformationRequestRecord } {
    const payload = asRecord(Array.isArray(value) ? value[0] : value)
    const outcome = payload && readString(payload, 'outcome')
    if (!outcome) throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'La RPC di persistenza ha restituito una risposta non valida.')
    return payload?.record === undefined ? { outcome } : { outcome, record: mapRecord(payload.record) }
}

export class SupabaseCreatureTransformationRequestRepository implements CreatureTransformationRequestRepository {
    private readonly client: CreatureTransformationRequestRepositoryClient

    constructor(client: CreatureTransformationRequestRepositoryClient) {
        this.client = client
    }

    async reserve(input: ReserveCreatureTransformationRequestInput): Promise<RequestReservationResult> {
        let response: { data: unknown; error: DatabaseError }
        try {
            response = await this.client.rpc('reserve_creature_transformation_request', {
                p_profile_id: input.profileId, p_creature_id: input.creatureId, p_idempotency_key: input.idempotencyKey, p_operation: input.operation,
                p_visual_trait_id: input.visualTraitId ?? null, p_intensity: input.intensity ?? null, p_concept_mode: input.conceptMode ?? null,
                p_image_provider_mode: input.imageProviderMode ?? null, p_estimated_cost_usd: input.estimatedCostUsd ?? null,
                p_daily_request_limit: input.dailyRequestLimit, p_daily_budget_usd: input.dailyBudgetUsd,
                p_benchmark_case_id: input.benchmarkCaseId ?? null, p_generation_profile_id: input.generationProfileId ?? null,
                p_concept_seed: input.conceptSeed ?? null,
                p_visual_progress_track_id: input.visualProgressTrackId ?? null, p_source_visual_version_id: input.sourceVisualVersionId ?? null,
                p_evolution_target_id: input.evolutionTargetId ?? null, p_evolution_function: input.evolutionFunction ?? null,
                p_request_fingerprint: input.requestFingerprint ?? null,
                p_daily_real_image_limit: input.dailyRealImageLimit ?? null,
                p_global_daily_real_image_limit: input.globalDailyRealImageLimit ?? null,
                p_global_concurrent_real_image_limit: input.globalConcurrentRealImageLimit ?? null,
                p_real_image_cooldown_seconds: input.realImageCooldownSeconds ?? 0,
                p_stale_request_seconds: input.staleRequestSeconds ?? null,
            })
        } catch (error) {
            throw new CreatureTransformationRequestRepositoryError('REQUEST_RESERVATION_FAILED', 'Non e stato possibile riservare la richiesta.', { cause: error })
        }
        if (response.error) throw new CreatureTransformationRequestRepositoryError('REQUEST_RESERVATION_FAILED', 'Non e stato possibile riservare la richiesta.', { cause: response.error })
        const result = readRpcResult(response.data)
        if (result.outcome === 'CREATED' || result.outcome === 'EXISTING') {
            if (!result.record) throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'La riserva non contiene il record richiesto.')
            return { outcome: result.outcome, record: result.record }
        }
        if (result.outcome === 'DAILY_LIMIT_REACHED' || result.outcome === 'DAILY_BUDGET_REACHED' || result.outcome === 'CREATURE_NOT_OWNED' || result.outcome === 'IDEMPOTENCY_KEY_REUSED' || result.outcome === 'REAL_IMAGE_USER_LIMIT_REACHED' || result.outcome === 'REAL_IMAGE_USER_CONCURRENCY_REACHED' || result.outcome === 'REAL_IMAGE_COOLDOWN_ACTIVE' || result.outcome === 'REAL_IMAGE_GLOBAL_LIMIT_REACHED' || result.outcome === 'REAL_IMAGE_GLOBAL_CONCURRENCY_REACHED') return { outcome: result.outcome }
        throw new CreatureTransformationRequestRepositoryError('REQUEST_RESERVATION_FAILED', 'La riserva ha restituito un esito non supportato.')
    }

    async markRunning(input: { requestId: string; profileId: string }): Promise<CreatureTransformationRequestRecord> {
        return this.transition(input, 'RUNNING', {})
    }

    async markSucceeded(input: { requestId: string; profileId: string; data: RequestTransitionData }): Promise<CreatureTransformationRequestRecord> {
        return this.transition(input, 'SUCCEEDED', input.data)
    }

    async markFailed(input: { requestId: string; profileId: string; errorCode: string; errorMessage: string }): Promise<CreatureTransformationRequestRecord> {
        return this.transition(input, 'FAILED', { errorCode: input.errorCode, errorMessage: input.errorMessage })
    }

    async finalizeBackgroundRemovalCandidate(input: { requestId: string; profileId: string; candidatePath: string; candidateSha256: string; candidateMimeType: 'image/png'; candidateWidth: number; candidateHeight: number; validationWarnings: string[]; displayAsset?: { path: string; sha256: string; width: number; height: number } }): Promise<CreatureTransformationRequestRecord> {
        let response: { data: unknown; error: DatabaseError }
        try {
            response = await this.client.rpc('finalize_creature_background_removal_candidate', {
                p_profile_id: input.profileId, p_request_id: input.requestId, p_candidate_path: input.candidatePath,
                p_candidate_sha256: input.candidateSha256, p_candidate_mime_type: input.candidateMimeType,
                p_candidate_width: input.candidateWidth, p_candidate_height: input.candidateHeight,
                p_validation_warnings: input.validationWarnings,
                p_display_asset_path: input.displayAsset?.path ?? null, p_display_asset_sha256: input.displayAsset?.sha256 ?? null,
                p_display_mime_type: input.displayAsset ? 'image/webp' : null, p_display_width: input.displayAsset?.width ?? null, p_display_height: input.displayAsset?.height ?? null,
            })
        } catch (error) {
            throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'Non e stato possibile finalizzare il PNG elaborato.', { cause: error })
        }
        if (response.error) throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'Non e stato possibile finalizzare il PNG elaborato.', { cause: response.error })
        const result = readRpcResult(response.data)
        if (result.outcome === 'CONFLICT') throw new CreatureTransformationRequestRepositoryError('REQUEST_STATE_CONFLICT', 'La richiesta non e pronta per il PNG elaborato.')
        if (result.outcome !== 'UPDATED' || !result.record) throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'La finalizzazione non ha restituito il record aggiornato.')
        return result.record
    }

    async getByIdempotencyKey(input: { profileId: string; idempotencyKey: string }): Promise<CreatureTransformationRequestRecord | null> {
        return this.getOne('idempotency_key', input.idempotencyKey, input.profileId)
    }

    async getById(input: { profileId: string; requestId: string }): Promise<CreatureTransformationRequestRecord | null> {
        return this.getOne('id', input.requestId, input.profileId)
    }

    async getDailyUsage(input: { profileId: string }): Promise<CreatureTransformationDailyUsage> {
        let response: { data: unknown; error: DatabaseError }
        try {
            response = await this.client.rpc('get_creature_transformation_daily_usage', { p_profile_id: input.profileId })
        } catch (error) {
            throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'Non e stato possibile leggere l utilizzo giornaliero.', { cause: error })
        }
        if (response.error) throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'Non e stato possibile leggere l utilizzo giornaliero.', { cause: response.error })
        const usage = asRecord(Array.isArray(response.data) ? response.data[0] : response.data)
        const requestCount = usage ? readNumber(usage, 'request_count') : null
        const realImageCount = usage ? readNumber(usage, 'real_image_count') : null
        const globalRealImageCount = usage ? readNumber(usage, 'global_real_image_count') : null
        const spentUsd = usage ? readNumber(usage, 'spent_usd') : null
        if (requestCount === null || realImageCount === null || globalRealImageCount === null || spentUsd === null || requestCount < 0 || realImageCount < 0 || globalRealImageCount < 0 || spentUsd < 0) {
            throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'L utilizzo giornaliero restituito non e valido.')
        }
        return { requestCount, realImageCount, globalRealImageCount, spentUsd }
    }

    private async getOne(column: 'idempotency_key' | 'id', value: string, profileId: string): Promise<CreatureTransformationRequestRecord | null> {
        let response: { data: unknown; error: DatabaseError }
        try {
            response = await this.client.from('creature_transformation_requests').select('*').eq('profile_id', profileId).eq(column, value).maybeSingle()
        } catch (error) {
            throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'Non e stato possibile recuperare la richiesta persistente.', { cause: error })
        }
        if (response.error) throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'Non e stato possibile recuperare la richiesta persistente.', { cause: response.error })
        return response.data ? mapRecord(response.data) : null
    }

    private async transition(input: { requestId: string; profileId: string }, targetStatus: 'RUNNING' | 'SUCCEEDED' | 'FAILED', data: RequestTransitionData): Promise<CreatureTransformationRequestRecord> {
        let response: { data: unknown; error: DatabaseError }
        try {
            response = await this.client.rpc('transition_creature_transformation_request', {
                p_request_id: input.requestId, p_profile_id: input.profileId, p_target_status: targetStatus,
                p_provider: data.provider ?? null, p_model: data.model ?? null, p_provider_request_id: data.providerRequestId ?? null,
                p_prompt_template_version: data.promptTemplateVersion ?? null, p_concept_schema_version: data.conceptSchemaVersion ?? null,
                p_source_sha256: data.sourceSha256 ?? null, p_result_sha256: data.resultSha256 ?? null, p_result_path: data.resultPath ?? null,
                p_result_mime_type: data.resultMimeType ?? null, p_result_width: data.resultWidth ?? null, p_result_height: data.resultHeight ?? null,
                p_generation_latency_ms: data.generationLatencyMs ?? null, p_estimated_cost_usd: data.estimatedCostUsd ?? null,
                p_actual_cost_usd: data.actualCostUsd ?? null, p_error_code: data.errorCode ?? null, p_error_message: data.errorMessage ?? null,
                p_asset_readiness: data.assetReadiness ?? null, p_validation_warnings: data.validationWarnings ?? null,
                p_generation_quality: data.generationQuality ?? null, p_prompt_sha256: data.promptSha256 ?? null,
                p_concept_snapshot: data.conceptSnapshot ?? null,
                p_prompt_text: data.promptText ?? null,
            })
        } catch (error) {
            throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'Non e stato possibile aggiornare lo stato della richiesta.', { cause: error })
        }
        if (response.error) throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'Non e stato possibile aggiornare lo stato della richiesta.', { cause: response.error })
        const result = readRpcResult(response.data)
        if (result.outcome === 'CONFLICT') throw new CreatureTransformationRequestRepositoryError('REQUEST_STATE_CONFLICT', 'La richiesta e in uno stato non compatibile con questa operazione.')
        if (result.outcome !== 'UPDATED' || !result.record) throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'La transizione persistente non ha restituito il record aggiornato.')
        return result.record
    }

    async listCompletedImageRecords(input: { profileId: string; offset: number; limit: number }): Promise<CreatureTransformationRequestRecord[]> {
        const from = input.offset
        const to = from + input.limit - 1
        let response: { data: unknown; error: DatabaseError }
        try {
            response = await this.client.from('creature_transformation_requests').select('*').eq('profile_id', input.profileId).eq('status', 'SUCCEEDED').order('completed_at', { ascending: false }).range(from, to)
        } catch (error) {
            throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'Non e stato possibile leggere il catalogo delle immagini.', { cause: error })
        }
        if (response.error || !Array.isArray(response.data)) throw new CreatureTransformationRequestRepositoryError('REQUEST_PERSISTENCE_FAILED', 'Non e stato possibile leggere il catalogo delle immagini.', { cause: response.error })
        return response.data.map(mapRecord).filter((record) => Boolean(record.resultPath && record.resultSha256 && record.resultMimeType && record.resultWidth && record.resultHeight))
    }
}
