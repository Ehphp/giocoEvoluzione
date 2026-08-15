import type { AdoptCreatureTransformationRequest, CreatureTransformationRequest, GenerateUnlockedTransformationRequest, GenerateFluxEvolutionChainStepRequest, GetCreatureTransformationLabUsageRequest, GetGeneratedImageCatalogRequest, GetCreatureVisualProgressRequest, GetCurrentCreatureVisualRequest, GetGameCreatureVisualsRequest, GetTransformationRequestStatusRequest, ListVisualBackgroundCleanupRequest, RollbackCreatureVisualVersionRequest, SelectCreatureVisualProgressTrackRequest, SubmitBackgroundRemovalCandidateRequest, SubmitVisualBackgroundCleanupRequest } from '../../../shared/creature-transformations/contracts.ts'
import { EVOLUTION_TARGET_BY_ID, type EvolutionTargetId } from '../../../shared/creature-transformations/evolution-targets.ts'
import { isBodyPlanMutationId, type BodyPlanMutationId } from '../../../shared/creature-transformations/flux-evolution/body-plan-mutations.ts'

const STATUS_REQUEST_FIELDS = new Set(['operation', 'transformationRequestId'])
const LAB_USAGE_REQUEST_FIELDS = new Set(['operation'])
const GENERATED_IMAGE_CATALOG_REQUEST_FIELDS = new Set(['operation', 'page'])
const UNLOCKED_REQUEST_FIELDS = new Set(['operation', 'creatureId', 'progressTrackId', 'idempotencyKey'])
const FLUX_CHAIN_STEP_REQUEST_FIELDS = new Set(['operation', 'creatureId', 'evolutionTargetId', 'promptTemplateVersion', 'bodyPlanMutationId', 'experimentalSourceRequestId', 'sourceVisualVersionId', 'previousStepRequestIds', 'idempotencyKey'])
const BACKGROUND_REMOVAL_CANDIDATE_REQUEST_FIELDS = new Set(['operation', 'transformationRequestId', 'candidatePngBase64', 'displayAssetWebpBase64'])
const VISUAL_BACKGROUND_CLEANUP_LIST_REQUEST_FIELDS = new Set(['operation'])
const VISUAL_BACKGROUND_CLEANUP_SUBMIT_REQUEST_FIELDS = new Set(['operation', 'visualVersionId', 'candidatePngBase64', 'displayAssetWebpBase64'])
const SELECT_TRACK_REQUEST_FIELDS = new Set(['operation', 'creatureId', 'evolutionTargetId'])
const GET_VISUAL_PROGRESS_REQUEST_FIELDS = new Set(['operation', 'creatureId'])
const GET_CURRENT_VISUAL_REQUEST_FIELDS = new Set(['operation', 'creatureId'])
const GET_GAME_VISUALS_REQUEST_FIELDS = new Set(['operation', 'gameId'])
const ADOPT_REQUEST_FIELDS = new Set(['operation', 'creatureId', 'progressTrackId', 'transformationRequestId', 'expectedCurrentVisualVersionId'])
const ROLLBACK_REQUEST_FIELDS = new Set(['operation', 'creatureId', 'targetVersionId', 'expectedCurrentVisualVersionId'])

export type ParsedCreatureTransformationRequest =
    | { valid: true; request: CreatureTransformationRequest }
    | { valid: false; code: 'INVALID_REQUEST' | 'INVALID_EVOLUTION_TARGET' | 'OPERATION_NOT_IMPLEMENTED'; message: string }

export type ParsedRequest<T> = { valid: true; request: T } | Extract<ParsedCreatureTransformationRequest, { valid: false }>

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function hasOnlyFields(body: Record<string, unknown>, fields: Set<string>): boolean {
    return !Object.keys(body).some((field) => !fields.has(field))
}

function readRequiredStrings(body: Record<string, unknown>): { creatureId: string; idempotencyKey: string } | null {
    if (typeof body.creatureId !== 'string' || !body.creatureId.trim() || typeof body.idempotencyKey !== 'string' || !body.idempotencyKey.trim()) return null
    if (body.creatureId.trim().length > 128 || body.idempotencyKey.trim().length > 256) return null
    return { creatureId: body.creatureId.trim(), idempotencyKey: body.idempotencyKey.trim() }
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function readUuid(body: Record<string, unknown>, field: string): string | null {
    return typeof body[field] === 'string' && isUuid(body[field].trim()) ? body[field].trim() : null
}

function readEvolutionTargetId(value: unknown): EvolutionTargetId | null {
    return typeof value === 'string' && EVOLUTION_TARGET_BY_ID[value as EvolutionTargetId] ? value as EvolutionTargetId : null
}

export function parseGetTransformationRequestStatusRequest(value: unknown): ParsedRequest<GetTransformationRequestStatusRequest> {
    const body = asRecord(value)
    if (!body) return { valid: false, code: 'INVALID_REQUEST', message: 'Il body deve essere un oggetto JSON.' }
    if (!hasOnlyFields(body, STATUS_REQUEST_FIELDS) || body.operation !== 'GET_REQUEST_STATUS' || typeof body.transformationRequestId !== 'string') {
        return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta di stato non rispetta il contratto pubblico.' }
    }
    const transformationRequestId = body.transformationRequestId.trim()
    if (!isUuid(transformationRequestId)) {
        return { valid: false, code: 'INVALID_REQUEST', message: 'transformationRequestId deve essere un UUID valido.' }
    }
    return { valid: true, request: { operation: 'GET_REQUEST_STATUS', transformationRequestId } }
}

export function parseGetCreatureTransformationLabUsageRequest(value: unknown): ParsedRequest<GetCreatureTransformationLabUsageRequest> {
    const body = asRecord(value)
    if (!body || !hasOnlyFields(body, LAB_USAGE_REQUEST_FIELDS) || body.operation !== 'GET_LAB_USAGE') {
        return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta di utilizzo giornaliero non rispetta il contratto pubblico.' }
    }
    return { valid: true, request: { operation: 'GET_LAB_USAGE' } }
}

export function parseGetGeneratedImageCatalogRequest(value: unknown): ParsedRequest<GetGeneratedImageCatalogRequest> {
    const body = asRecord(value)
    const page = body?.page === undefined ? 0 : body?.page
    if (!body || !hasOnlyFields(body, GENERATED_IMAGE_CATALOG_REQUEST_FIELDS) || body.operation !== 'GET_GENERATED_IMAGE_CATALOG' || !Number.isInteger(page) || typeof page !== 'number' || page < 0 || page > 999) {
        return { valid: false, code: 'INVALID_REQUEST', message: 'La pagina del catalogo immagini non e valida.' }
    }
    return { valid: true, request: { operation: 'GET_GENERATED_IMAGE_CATALOG', ...(page ? { page } : {}) } }
}

export function parseGenerateUnlockedTransformationRequest(value: unknown): ParsedRequest<GenerateUnlockedTransformationRequest> {
    const body = asRecord(value)
    if (!body || !hasOnlyFields(body, UNLOCKED_REQUEST_FIELDS) || body.operation !== 'GENERATE_UNLOCKED_TRANSFORMATION') return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta di generazione sbloccata non rispetta il contratto.' }
    const required = readRequiredStrings(body)
    const progressTrackId = readUuid(body, 'progressTrackId')
    if (!required || !progressTrackId) return { valid: false, code: 'INVALID_REQUEST', message: 'creatureId, progressTrackId e idempotencyKey sono obbligatori.' }
    return { valid: true, request: { operation: 'GENERATE_UNLOCKED_TRANSFORMATION', creatureId: required.creatureId, progressTrackId, idempotencyKey: required.idempotencyKey } }
}

export function parseGenerateFluxEvolutionChainStepRequest(value: unknown): ParsedRequest<GenerateFluxEvolutionChainStepRequest> {
    const body = asRecord(value)
    const required = body ? readRequiredStrings(body) : null
    const evolutionTargetId = readEvolutionTargetId(body?.evolutionTargetId)
    const previousStepRequestIds = Array.isArray(body?.previousStepRequestIds) && body.previousStepRequestIds.length <= 20 && body.previousStepRequestIds.every((id) => typeof id === 'string' && isUuid(id))
        ? [...body.previousStepRequestIds] as string[]
        : null
    if (!body || !hasOnlyFields(body, FLUX_CHAIN_STEP_REQUEST_FIELDS) || body.operation !== 'GENERATE_FLUX_EVOLUTION_CHAIN_STEP' || !required || !evolutionTargetId || !previousStepRequestIds) return { valid: false, code: 'INVALID_REQUEST', message: 'Lo step della catena FLUX non rispetta il contratto.' }
    const bodyPlanMutationId: BodyPlanMutationId | undefined | null = body.bodyPlanMutationId === undefined
        ? undefined
        : isBodyPlanMutationId(body.bodyPlanMutationId) ? body.bodyPlanMutationId : null
    if (bodyPlanMutationId === null) return { valid: false, code: 'INVALID_REQUEST', message: 'bodyPlanMutationId non appartiene al catalogo delle mutazioni strutturali.' }
    const promptTemplateVersion = body.promptTemplateVersion === undefined
        ? undefined
        : body.promptTemplateVersion === 'flux-micro-v6' || body.promptTemplateVersion === 'flux-micro-v5' || body.promptTemplateVersion === 'flux-minimal-v1' ? body.promptTemplateVersion : null
    if (promptTemplateVersion === null) return { valid: false, code: 'INVALID_REQUEST', message: 'La versione sperimentale del prompt FLUX non e valida.' }
    if (body.experimentalSourceRequestId !== undefined && !readUuid(body, 'experimentalSourceRequestId')) return { valid: false, code: 'INVALID_REQUEST', message: 'experimentalSourceRequestId deve essere un UUID valido.' }
    if (body.sourceVisualVersionId !== undefined && !readUuid(body, 'sourceVisualVersionId')) return { valid: false, code: 'INVALID_REQUEST', message: 'sourceVisualVersionId deve essere un UUID valido.' }
    if (body.experimentalSourceRequestId !== undefined && body.sourceVisualVersionId !== undefined) return { valid: false, code: 'INVALID_REQUEST', message: 'Imposta una sola sorgente: sperimentale oppure produttiva.' }
    if (new Set(previousStepRequestIds).size !== previousStepRequestIds.length) return { valid: false, code: 'INVALID_REQUEST', message: 'Lo storico della catena contiene duplicati.' }
    return {
        valid: true,
        request: {
            operation: 'GENERATE_FLUX_EVOLUTION_CHAIN_STEP', creatureId: required.creatureId, evolutionTargetId,
            ...(promptTemplateVersion ? { promptTemplateVersion } : {}),
            ...(bodyPlanMutationId ? { bodyPlanMutationId } : {}),
            ...(typeof body.experimentalSourceRequestId === 'string' ? { experimentalSourceRequestId: body.experimentalSourceRequestId } : {}),
            ...(typeof body.sourceVisualVersionId === 'string' ? { sourceVisualVersionId: body.sourceVisualVersionId } : {}),
            previousStepRequestIds, idempotencyKey: required.idempotencyKey,
        },
    }
}

export function parseSubmitBackgroundRemovalCandidateRequest(value: unknown): ParsedRequest<SubmitBackgroundRemovalCandidateRequest> {
    const body = asRecord(value)
    const transformationRequestId = body ? readUuid(body, 'transformationRequestId') : null
    if (!body || !hasOnlyFields(body, BACKGROUND_REMOVAL_CANDIDATE_REQUEST_FIELDS) || body.operation !== 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE' || !transformationRequestId || typeof body.candidatePngBase64 !== 'string' || !body.candidatePngBase64.length || body.candidatePngBase64.length > 14_000_000) {
        return { valid: false, code: 'INVALID_REQUEST', message: 'Il candidato PNG non rispetta il contratto.' }
    }
    if (body.displayAssetWebpBase64 !== undefined && (typeof body.displayAssetWebpBase64 !== 'string' || !body.displayAssetWebpBase64.length || body.displayAssetWebpBase64.length > 4_000_000)) return { valid: false, code: 'INVALID_REQUEST', message: 'Il display asset non rispetta il contratto.' }
    return { valid: true, request: { operation: 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE', transformationRequestId, candidatePngBase64: body.candidatePngBase64, ...(typeof body.displayAssetWebpBase64 === 'string' ? { displayAssetWebpBase64: body.displayAssetWebpBase64 } : {}) } }
}

export function parseListVisualBackgroundCleanupRequest(value: unknown): ParsedRequest<ListVisualBackgroundCleanupRequest> {
    const body = asRecord(value)
    if (!body || !hasOnlyFields(body, VISUAL_BACKGROUND_CLEANUP_LIST_REQUEST_FIELDS) || body.operation !== 'LIST_VISUAL_BACKGROUND_CLEANUP') return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta batch non rispetta il contratto.' }
    return { valid: true, request: { operation: 'LIST_VISUAL_BACKGROUND_CLEANUP' } }
}

export function parseSubmitVisualBackgroundCleanupRequest(value: unknown): ParsedRequest<SubmitVisualBackgroundCleanupRequest> {
    const body = asRecord(value)
    const visualVersionId = body ? readUuid(body, 'visualVersionId') : null
    if (!body || !hasOnlyFields(body, VISUAL_BACKGROUND_CLEANUP_SUBMIT_REQUEST_FIELDS) || body.operation !== 'SUBMIT_VISUAL_BACKGROUND_CLEANUP' || !visualVersionId || typeof body.candidatePngBase64 !== 'string' || !body.candidatePngBase64.length || body.candidatePngBase64.length > 14_000_000 || (body.displayAssetWebpBase64 !== undefined && (typeof body.displayAssetWebpBase64 !== 'string' || !body.displayAssetWebpBase64.length || body.displayAssetWebpBase64.length > 4_000_000))) return { valid: false, code: 'INVALID_REQUEST', message: 'Il PNG batch non rispetta il contratto.' }
    return { valid: true, request: { operation: 'SUBMIT_VISUAL_BACKGROUND_CLEANUP', visualVersionId, candidatePngBase64: body.candidatePngBase64, ...(typeof body.displayAssetWebpBase64 === 'string' ? { displayAssetWebpBase64: body.displayAssetWebpBase64 } : {}) } }
}

export function parseSelectCreatureVisualProgressTrackRequest(value: unknown): ParsedRequest<SelectCreatureVisualProgressTrackRequest> {
    const body = asRecord(value)
    if (!body || !hasOnlyFields(body, SELECT_TRACK_REQUEST_FIELDS) || body.operation !== 'SELECT_VISUAL_PROGRESS_TRACK' || typeof body.creatureId !== 'string' || !body.creatureId.trim()) return { valid: false, code: 'INVALID_REQUEST', message: 'La scelta del percorso visuale non rispetta il contratto.' }
    const evolutionTargetId = readEvolutionTargetId(body.evolutionTargetId)
    if (!evolutionTargetId) return { valid: false, code: 'INVALID_EVOLUTION_TARGET', message: 'La track richiede un target evolutivo valido.' }
    return { valid: true, request: { operation: 'SELECT_VISUAL_PROGRESS_TRACK', creatureId: body.creatureId.trim(), evolutionTargetId } }
}

function parseCreatureOnly<T extends 'GET_VISUAL_PROGRESS' | 'GET_CURRENT_VISUAL'>(value: unknown, operation: T, fields: Set<string>): ParsedRequest<T extends 'GET_VISUAL_PROGRESS' ? GetCreatureVisualProgressRequest : GetCurrentCreatureVisualRequest> {
    const body = asRecord(value)
    if (!body || !hasOnlyFields(body, fields) || body.operation !== operation || typeof body.creatureId !== 'string' || !body.creatureId.trim()) return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta visuale non rispetta il contratto.' }
    return { valid: true, request: { operation, creatureId: body.creatureId.trim() } as T extends 'GET_VISUAL_PROGRESS' ? GetCreatureVisualProgressRequest : GetCurrentCreatureVisualRequest }
}

export function parseGetCreatureVisualProgressRequest(value: unknown) { return parseCreatureOnly(value, 'GET_VISUAL_PROGRESS', GET_VISUAL_PROGRESS_REQUEST_FIELDS) }
export function parseGetCurrentCreatureVisualRequest(value: unknown) { return parseCreatureOnly(value, 'GET_CURRENT_VISUAL', GET_CURRENT_VISUAL_REQUEST_FIELDS) }

export function parseGetGameCreatureVisualsRequest(value: unknown): ParsedRequest<GetGameCreatureVisualsRequest> {
    const body = asRecord(value); const gameId = body ? readUuid(body, 'gameId') : null
    if (!body || !hasOnlyFields(body, GET_GAME_VISUALS_REQUEST_FIELDS) || body.operation !== 'GET_GAME_VISUALS' || !gameId) return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta visuale della partita non rispetta il contratto.' }
    return { valid: true, request: { operation: 'GET_GAME_VISUALS', gameId } }
}

export function parseAdoptCreatureTransformationRequest(value: unknown): ParsedRequest<AdoptCreatureTransformationRequest> {
    const body = asRecord(value)
    const progressTrackId = body ? readUuid(body, 'progressTrackId') : null; const transformationRequestId = body ? readUuid(body, 'transformationRequestId') : null; const expectedCurrentVisualVersionId = body ? readUuid(body, 'expectedCurrentVisualVersionId') : null
    if (!body || !hasOnlyFields(body, ADOPT_REQUEST_FIELDS) || body.operation !== 'ADOPT_CREATURE_TRANSFORMATION' || typeof body.creatureId !== 'string' || !body.creatureId.trim() || !progressTrackId || !transformationRequestId || !expectedCurrentVisualVersionId) return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta di adozione non rispetta il contratto.' }
    return { valid: true, request: { operation: 'ADOPT_CREATURE_TRANSFORMATION', creatureId: body.creatureId.trim(), progressTrackId, transformationRequestId, expectedCurrentVisualVersionId } }
}

export function parseRollbackCreatureVisualVersionRequest(value: unknown): ParsedRequest<RollbackCreatureVisualVersionRequest> {
    const body = asRecord(value); const targetVersionId = body ? readUuid(body, 'targetVersionId') : null; const expectedCurrentVisualVersionId = body ? readUuid(body, 'expectedCurrentVisualVersionId') : null
    if (!body || !hasOnlyFields(body, ROLLBACK_REQUEST_FIELDS) || body.operation !== 'ROLLBACK_CREATURE_VISUAL_VERSION' || typeof body.creatureId !== 'string' || !body.creatureId.trim() || !targetVersionId || !expectedCurrentVisualVersionId) return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta di rollback non rispetta il contratto.' }
    return { valid: true, request: { operation: 'ROLLBACK_CREATURE_VISUAL_VERSION', creatureId: body.creatureId.trim(), targetVersionId, expectedCurrentVisualVersionId } }
}

export function parseCreatureTransformationRequest(value: unknown): ParsedCreatureTransformationRequest {
    const body = asRecord(value)
    if (!body) return { valid: false, code: 'INVALID_REQUEST', message: 'Il body deve essere un oggetto JSON.' }
    if (body.operation === 'GET_REQUEST_STATUS') return parseGetTransformationRequestStatusRequest(body)
    if (body.operation === 'GET_LAB_USAGE') return parseGetCreatureTransformationLabUsageRequest(body)
    if (body.operation === 'GET_GENERATED_IMAGE_CATALOG') return parseGetGeneratedImageCatalogRequest(body)
    if (body.operation === 'GENERATE_UNLOCKED_TRANSFORMATION') return parseGenerateUnlockedTransformationRequest(body)
    if (body.operation === 'GENERATE_FLUX_EVOLUTION_CHAIN_STEP') return parseGenerateFluxEvolutionChainStepRequest(body)
    if (body.operation === 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE') return parseSubmitBackgroundRemovalCandidateRequest(body)
    if (body.operation === 'LIST_VISUAL_BACKGROUND_CLEANUP') return parseListVisualBackgroundCleanupRequest(body)
    if (body.operation === 'SUBMIT_VISUAL_BACKGROUND_CLEANUP') return parseSubmitVisualBackgroundCleanupRequest(body)
    if (body.operation === 'SELECT_VISUAL_PROGRESS_TRACK') return parseSelectCreatureVisualProgressTrackRequest(body)
    if (body.operation === 'GET_VISUAL_PROGRESS') return parseGetCreatureVisualProgressRequest(body)
    if (body.operation === 'GET_CURRENT_VISUAL') return parseGetCurrentCreatureVisualRequest(body)
    if (body.operation === 'GET_GAME_VISUALS') return parseGetGameCreatureVisualsRequest(body)
    if (body.operation === 'ADOPT_CREATURE_TRANSFORMATION') return parseAdoptCreatureTransformationRequest(body)
    if (body.operation === 'ROLLBACK_CREATURE_VISUAL_VERSION') return parseRollbackCreatureVisualVersionRequest(body)
    return { valid: false, code: 'OPERATION_NOT_IMPLEMENTED', message: 'operation non e supportata.' }
}
