import type {
    AdoptCreatureTransformationRequest,
    CreatureTransformationRequest,
    GenerateUnlockedTransformationRequest,
    GetCreatureVisualProgressRequest,
    GetCurrentCreatureVisualRequest,
    GetGameCreatureVisualsRequest,
    GetTransformationRequestStatusRequest,
    RollbackCreatureVisualVersionRequest,
    SubmitBackgroundRemovalCandidateRequest,
} from '../../../shared/creature-transformations/contracts.ts'

const STATUS_REQUEST_FIELDS = new Set(['operation', 'transformationRequestId'])
const UNLOCKED_REQUEST_FIELDS = new Set(['operation', 'creatureId', 'progressTrackId', 'idempotencyKey'])
const BACKGROUND_REMOVAL_CANDIDATE_REQUEST_FIELDS = new Set([
    'operation',
    'transformationRequestId',
    'candidatePngBase64',
    'displayAssetWebpBase64',
])
const GET_VISUAL_PROGRESS_REQUEST_FIELDS = new Set(['operation', 'creatureId'])
const GET_CURRENT_VISUAL_REQUEST_FIELDS = new Set(['operation', 'creatureId'])
const GET_GAME_VISUALS_REQUEST_FIELDS = new Set(['operation', 'gameId'])
const ADOPT_REQUEST_FIELDS = new Set([
    'operation',
    'creatureId',
    'progressTrackId',
    'transformationRequestId',
    'expectedCurrentVisualVersionId',
])
const ROLLBACK_REQUEST_FIELDS = new Set([
    'operation',
    'creatureId',
    'targetVersionId',
    'expectedCurrentVisualVersionId',
])

export type ParsedCreatureTransformationRequest =
    | { valid: true; request: CreatureTransformationRequest }
    | {
          valid: false
          code: 'INVALID_REQUEST' | 'INVALID_EVOLUTION_TARGET' | 'OPERATION_NOT_IMPLEMENTED'
          message: string
      }

export type ParsedRequest<T> =
    { valid: true; request: T } | Extract<ParsedCreatureTransformationRequest, { valid: false }>

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function hasOnlyFields(body: Record<string, unknown>, fields: Set<string>): boolean {
    return !Object.keys(body).some((field) => !fields.has(field))
}

function readRequiredStrings(body: Record<string, unknown>): { creatureId: string; idempotencyKey: string } | null {
    if (
        typeof body.creatureId !== 'string' ||
        !body.creatureId.trim() ||
        typeof body.idempotencyKey !== 'string' ||
        !body.idempotencyKey.trim()
    )
        return null
    if (body.creatureId.trim().length > 128 || body.idempotencyKey.trim().length > 256) return null
    return { creatureId: body.creatureId.trim(), idempotencyKey: body.idempotencyKey.trim() }
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function readUuid(body: Record<string, unknown>, field: string): string | null {
    return typeof body[field] === 'string' && isUuid(body[field].trim()) ? body[field].trim() : null
}

export function parseGetTransformationRequestStatusRequest(
    value: unknown,
): ParsedRequest<GetTransformationRequestStatusRequest> {
    const body = asRecord(value)
    if (!body) return { valid: false, code: 'INVALID_REQUEST', message: 'Il body deve essere un oggetto JSON.' }
    if (
        !hasOnlyFields(body, STATUS_REQUEST_FIELDS) ||
        body.operation !== 'GET_REQUEST_STATUS' ||
        typeof body.transformationRequestId !== 'string'
    ) {
        return {
            valid: false,
            code: 'INVALID_REQUEST',
            message: 'La richiesta di stato non rispetta il contratto pubblico.',
        }
    }
    const transformationRequestId = body.transformationRequestId.trim()
    if (!isUuid(transformationRequestId)) {
        return { valid: false, code: 'INVALID_REQUEST', message: 'transformationRequestId deve essere un UUID valido.' }
    }
    return { valid: true, request: { operation: 'GET_REQUEST_STATUS', transformationRequestId } }
}

export function parseGenerateUnlockedTransformationRequest(
    value: unknown,
): ParsedRequest<GenerateUnlockedTransformationRequest> {
    const body = asRecord(value)
    if (!body || !hasOnlyFields(body, UNLOCKED_REQUEST_FIELDS) || body.operation !== 'GENERATE_UNLOCKED_TRANSFORMATION')
        return {
            valid: false,
            code: 'INVALID_REQUEST',
            message: 'La richiesta di generazione sbloccata non rispetta il contratto.',
        }
    const required = readRequiredStrings(body)
    const progressTrackId = readUuid(body, 'progressTrackId')
    if (!required || !progressTrackId)
        return {
            valid: false,
            code: 'INVALID_REQUEST',
            message: 'creatureId, progressTrackId e idempotencyKey sono obbligatori.',
        }
    return {
        valid: true,
        request: {
            operation: 'GENERATE_UNLOCKED_TRANSFORMATION',
            creatureId: required.creatureId,
            progressTrackId,
            idempotencyKey: required.idempotencyKey,
        },
    }
}

export function parseSubmitBackgroundRemovalCandidateRequest(
    value: unknown,
): ParsedRequest<SubmitBackgroundRemovalCandidateRequest> {
    const body = asRecord(value)
    const transformationRequestId = body ? readUuid(body, 'transformationRequestId') : null
    if (
        !body ||
        !hasOnlyFields(body, BACKGROUND_REMOVAL_CANDIDATE_REQUEST_FIELDS) ||
        body.operation !== 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE' ||
        !transformationRequestId ||
        typeof body.candidatePngBase64 !== 'string' ||
        !body.candidatePngBase64.length ||
        body.candidatePngBase64.length > 14_000_000
    ) {
        return { valid: false, code: 'INVALID_REQUEST', message: 'Il candidato PNG non rispetta il contratto.' }
    }
    if (
        body.displayAssetWebpBase64 !== undefined &&
        (typeof body.displayAssetWebpBase64 !== 'string' ||
            !body.displayAssetWebpBase64.length ||
            body.displayAssetWebpBase64.length > 4_000_000)
    )
        return { valid: false, code: 'INVALID_REQUEST', message: 'Il display asset non rispetta il contratto.' }
    return {
        valid: true,
        request: {
            operation: 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE',
            transformationRequestId,
            candidatePngBase64: body.candidatePngBase64,
            ...(typeof body.displayAssetWebpBase64 === 'string'
                ? { displayAssetWebpBase64: body.displayAssetWebpBase64 }
                : {}),
        },
    }
}

function parseCreatureOnly<T extends 'GET_VISUAL_PROGRESS' | 'GET_CURRENT_VISUAL'>(
    value: unknown,
    operation: T,
    fields: Set<string>,
): ParsedRequest<T extends 'GET_VISUAL_PROGRESS' ? GetCreatureVisualProgressRequest : GetCurrentCreatureVisualRequest> {
    const body = asRecord(value)
    if (
        !body ||
        !hasOnlyFields(body, fields) ||
        body.operation !== operation ||
        typeof body.creatureId !== 'string' ||
        !body.creatureId.trim()
    )
        return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta visuale non rispetta il contratto.' }
    return {
        valid: true,
        request: { operation, creatureId: body.creatureId.trim() } as T extends 'GET_VISUAL_PROGRESS'
            ? GetCreatureVisualProgressRequest
            : GetCurrentCreatureVisualRequest,
    }
}

export function parseGetCreatureVisualProgressRequest(value: unknown) {
    return parseCreatureOnly(value, 'GET_VISUAL_PROGRESS', GET_VISUAL_PROGRESS_REQUEST_FIELDS)
}
export function parseGetCurrentCreatureVisualRequest(value: unknown) {
    return parseCreatureOnly(value, 'GET_CURRENT_VISUAL', GET_CURRENT_VISUAL_REQUEST_FIELDS)
}

export function parseGetGameCreatureVisualsRequest(value: unknown): ParsedRequest<GetGameCreatureVisualsRequest> {
    const body = asRecord(value)
    const gameId = body ? readUuid(body, 'gameId') : null
    if (
        !body ||
        !hasOnlyFields(body, GET_GAME_VISUALS_REQUEST_FIELDS) ||
        body.operation !== 'GET_GAME_VISUALS' ||
        !gameId
    )
        return {
            valid: false,
            code: 'INVALID_REQUEST',
            message: 'La richiesta visuale della partita non rispetta il contratto.',
        }
    return { valid: true, request: { operation: 'GET_GAME_VISUALS', gameId } }
}

export function parseAdoptCreatureTransformationRequest(
    value: unknown,
): ParsedRequest<AdoptCreatureTransformationRequest> {
    const body = asRecord(value)
    const progressTrackId = body ? readUuid(body, 'progressTrackId') : null
    const transformationRequestId = body ? readUuid(body, 'transformationRequestId') : null
    const expectedCurrentVisualVersionId = body ? readUuid(body, 'expectedCurrentVisualVersionId') : null
    if (
        !body ||
        !hasOnlyFields(body, ADOPT_REQUEST_FIELDS) ||
        body.operation !== 'ADOPT_CREATURE_TRANSFORMATION' ||
        typeof body.creatureId !== 'string' ||
        !body.creatureId.trim() ||
        !progressTrackId ||
        !transformationRequestId ||
        !expectedCurrentVisualVersionId
    )
        return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta di adozione non rispetta il contratto.' }
    return {
        valid: true,
        request: {
            operation: 'ADOPT_CREATURE_TRANSFORMATION',
            creatureId: body.creatureId.trim(),
            progressTrackId,
            transformationRequestId,
            expectedCurrentVisualVersionId,
        },
    }
}

export function parseRollbackCreatureVisualVersionRequest(
    value: unknown,
): ParsedRequest<RollbackCreatureVisualVersionRequest> {
    const body = asRecord(value)
    const targetVersionId = body ? readUuid(body, 'targetVersionId') : null
    const expectedCurrentVisualVersionId = body ? readUuid(body, 'expectedCurrentVisualVersionId') : null
    if (
        !body ||
        !hasOnlyFields(body, ROLLBACK_REQUEST_FIELDS) ||
        body.operation !== 'ROLLBACK_CREATURE_VISUAL_VERSION' ||
        typeof body.creatureId !== 'string' ||
        !body.creatureId.trim() ||
        !targetVersionId ||
        !expectedCurrentVisualVersionId
    )
        return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta di rollback non rispetta il contratto.' }
    return {
        valid: true,
        request: {
            operation: 'ROLLBACK_CREATURE_VISUAL_VERSION',
            creatureId: body.creatureId.trim(),
            targetVersionId,
            expectedCurrentVisualVersionId,
        },
    }
}

export function parseCreatureTransformationRequest(value: unknown): ParsedCreatureTransformationRequest {
    const body = asRecord(value)
    if (!body) return { valid: false, code: 'INVALID_REQUEST', message: 'Il body deve essere un oggetto JSON.' }
    if (body.operation === 'GET_REQUEST_STATUS') return parseGetTransformationRequestStatusRequest(body)
    if (body.operation === 'GENERATE_UNLOCKED_TRANSFORMATION') return parseGenerateUnlockedTransformationRequest(body)
    if (body.operation === 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE')
        return parseSubmitBackgroundRemovalCandidateRequest(body)
    if (body.operation === 'GET_VISUAL_PROGRESS') return parseGetCreatureVisualProgressRequest(body)
    if (body.operation === 'GET_CURRENT_VISUAL') return parseGetCurrentCreatureVisualRequest(body)
    if (body.operation === 'GET_GAME_VISUALS') return parseGetGameCreatureVisualsRequest(body)
    if (body.operation === 'ADOPT_CREATURE_TRANSFORMATION') return parseAdoptCreatureTransformationRequest(body)
    if (body.operation === 'ROLLBACK_CREATURE_VISUAL_VERSION') return parseRollbackCreatureVisualVersionRequest(body)
    return { valid: false, code: 'OPERATION_NOT_IMPLEMENTED', message: 'operation non e supportata.' }
}
