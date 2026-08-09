import type { CreatureTransformationConcept } from '../../../shared/creature-transformations/concepts.ts'
import { validateExperimentReviewInput } from '../../../shared/creature-transformations/experiment-reviews.ts'
import type { AdoptCreatureTransformationRequest, CreatureTransformationRequest, GenerateConceptRequest, GenerateImageRequest, GenerateCurrentPipelineExperimentRequest, GenerateLineageFirstExperimentRequest, GenerateUnlockedTransformationRequest, GetBenchmarkResultsRequest, GetCreatureTransformationLabUsageRequest, GetLineageComparisonReviewsRequest, GetCreatureVisualProgressRequest, GetCurrentCreatureVisualRequest, GetGameCreatureVisualsRequest, GetTransformationRequestStatusRequest, ListVisualBackgroundCleanupRequest, RollbackCreatureVisualVersionRequest, SelectCreatureVisualProgressTrackRequest, SubmitBackgroundRemovalCandidateRequest, SubmitExperimentReviewRequest, SubmitLineageComparisonReviewRequest, SubmitVisualBackgroundCleanupRequest } from '../../../shared/creature-transformations/contracts.ts'
import type { VisualTraitId } from '../../../shared/creature-transformations/visual-traits.ts'
import { VISUAL_TRAIT_BY_ID } from '../../../shared/creature-transformations/visual-traits.ts'
import { EVOLUTION_FUNCTION_IDS, EVOLUTION_TARGET_BY_ID, type EvolutionFunctionId, type EvolutionTargetId } from '../../../shared/creature-transformations/evolution-targets.ts'

const CONCEPT_REQUEST_FIELDS = new Set(['operation', 'creatureId', 'visualTraitId', 'evolutionTargetId', 'evolutionFunction', 'intensity', 'conceptMode', 'idempotencyKey', 'benchmarkCaseId'])
const IMAGE_REQUEST_FIELDS = new Set(['operation', 'creatureId', 'concept', 'imageProviderMode', 'idempotencyKey', 'benchmarkCaseId', 'generationProfileId'])
const CURRENT_PIPELINE_EXPERIMENT_FIELDS = new Set(['operation', 'creatureId', 'evolutionTargetId', 'experimentalSourceRequestId', 'sourceVisualVersionId', 'idempotencyKey'])
const LINEAGE_EXPERIMENT_REQUEST_FIELDS = new Set(['operation', 'creatureId', 'evolutionTargetId', 'lineage', 'instruction', 'experimentalSourceRequestId', 'sourceVisualVersionId', 'idempotencyKey'])
const STATUS_REQUEST_FIELDS = new Set(['operation', 'transformationRequestId', 'reviewOwnerProfileId'])
const LAB_USAGE_REQUEST_FIELDS = new Set(['operation'])
const REVIEW_REQUEST_FIELDS = new Set(['operation', 'transformationRequestId', 'scores', 'verdict', 'issueFlags', 'notes'])
const LINEAGE_REVIEW_REQUEST_FIELDS = new Set(['operation', 'creatureId', 'lineageRequestId', 'currentRequestId', 'scores', 'preferredResult'])
const LINEAGE_REVIEW_LIST_REQUEST_FIELDS = new Set(['operation'])
const BENCHMARK_RESULTS_REQUEST_FIELDS = new Set(['operation'])
const UNLOCKED_REQUEST_FIELDS = new Set(['operation', 'creatureId', 'progressTrackId', 'idempotencyKey'])
const BACKGROUND_REMOVAL_CANDIDATE_REQUEST_FIELDS = new Set(['operation', 'transformationRequestId', 'candidatePngBase64', 'displayAssetWebpBase64'])
const VISUAL_BACKGROUND_CLEANUP_LIST_REQUEST_FIELDS = new Set(['operation'])
const VISUAL_BACKGROUND_CLEANUP_SUBMIT_REQUEST_FIELDS = new Set(['operation', 'visualVersionId', 'candidatePngBase64', 'displayAssetWebpBase64'])
const SELECT_TRACK_REQUEST_FIELDS = new Set(['operation', 'creatureId', 'visualTraitId', 'evolutionTargetId'])
const GET_VISUAL_PROGRESS_REQUEST_FIELDS = new Set(['operation', 'creatureId'])
const GET_CURRENT_VISUAL_REQUEST_FIELDS = new Set(['operation', 'creatureId'])
const GET_GAME_VISUALS_REQUEST_FIELDS = new Set(['operation', 'gameId'])
const ADOPT_REQUEST_FIELDS = new Set(['operation', 'creatureId', 'progressTrackId', 'transformationRequestId', 'expectedCurrentVisualVersionId'])
const ROLLBACK_REQUEST_FIELDS = new Set(['operation', 'creatureId', 'targetVersionId', 'expectedCurrentVisualVersionId'])

export type ParsedCreatureTransformationRequest =
    | { valid: true; request: CreatureTransformationRequest }
    | { valid: false; code: 'INVALID_REQUEST' | 'INVALID_VISUAL_TRAIT' | 'OPERATION_NOT_IMPLEMENTED'; message: string }

export type ParsedGenerateConceptRequest =
    | { valid: true; request: GenerateConceptRequest }
    | Extract<ParsedCreatureTransformationRequest, { valid: false }>

export type ParsedGenerateImageRequest =
    | { valid: true; request: GenerateImageRequest }
    | Extract<ParsedCreatureTransformationRequest, { valid: false }>
export type ParsedGenerateLineageFirstExperimentRequest =
    | { valid: true; request: GenerateLineageFirstExperimentRequest }
    | Extract<ParsedCreatureTransformationRequest, { valid: false }>

export type ParsedGetTransformationRequestStatusRequest =
    | { valid: true; request: GetTransformationRequestStatusRequest }
    | Extract<ParsedCreatureTransformationRequest, { valid: false }>
export type ParsedGetCreatureTransformationLabUsageRequest =
    | { valid: true; request: GetCreatureTransformationLabUsageRequest }
    | Extract<ParsedCreatureTransformationRequest, { valid: false }>
export type ParsedVisualBackgroundCleanupRequest<T> = { valid: true; request: T } | Extract<ParsedCreatureTransformationRequest, { valid: false }>

export type ParsedSubmitExperimentReviewRequest =
    | { valid: true; request: SubmitExperimentReviewRequest }
    | Extract<ParsedCreatureTransformationRequest, { valid: false }>

export type ParsedGetBenchmarkResultsRequest =
    | { valid: true; request: GetBenchmarkResultsRequest }
    | Extract<ParsedCreatureTransformationRequest, { valid: false }>
export type ParsedVisualProgressRequest<T> = { valid: true; request: T } | Extract<ParsedCreatureTransformationRequest, { valid: false }>

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

function readOptionalIdentifier(body: Record<string, unknown>, field: string): string | undefined | null {
    if (body[field] === undefined) return undefined
    if (typeof body[field] !== 'string') return null
    const value = body[field].trim()
    return /^[a-z][a-z0-9-]{1,63}$/.test(value) ? value : null
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function readUuid(body: Record<string, unknown>, field: string): string | null {
    return typeof body[field] === 'string' && isUuid(body[field].trim()) ? body[field].trim() : null
}

export function parseGenerateConceptRequest(value: unknown): ParsedGenerateConceptRequest {
    const body = asRecord(value)
    if (!body) return { valid: false, code: 'INVALID_REQUEST', message: 'Il body deve essere un oggetto JSON.' }
    if (body.operation === 'GENERATE_IMAGE') {
        return { valid: false, code: 'OPERATION_NOT_IMPLEMENTED', message: 'Questa orchestrazione gestisce soltanto GENERATE_CONCEPT.' }
    }
    if (!hasOnlyFields(body, CONCEPT_REQUEST_FIELDS)) {
        return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta contiene campi non previsti dal contratto pubblico.' }
    }
    if (body.operation !== 'GENERATE_CONCEPT') {
        return { valid: false, code: 'INVALID_REQUEST', message: 'operation deve essere GENERATE_CONCEPT.' }
    }
    const required = readRequiredStrings(body)
    if (!required) return { valid: false, code: 'INVALID_REQUEST', message: 'creatureId e idempotencyKey sono obbligatori e hanno una lunghezza non valida.' }
    if (body.conceptMode !== 'MOCK' && body.conceptMode !== 'AI') {
        return { valid: false, code: 'INVALID_REQUEST', message: 'conceptMode deve essere MOCK o AI.' }
    }
    if (body.intensity !== 1 && body.intensity !== 2 && body.intensity !== 3) {
        return { valid: false, code: 'INVALID_REQUEST', message: 'intensity deve essere 1, 2 o 3.' }
    }
    if (typeof body.visualTraitId !== 'string' || !VISUAL_TRAIT_BY_ID[body.visualTraitId as VisualTraitId]) {
        return { valid: false, code: 'INVALID_VISUAL_TRAIT', message: 'Il Visual Trait richiesto non e supportato.' }
    }

    const benchmarkCaseId = readOptionalIdentifier(body, 'benchmarkCaseId')
    if (benchmarkCaseId === null) return { valid: false, code: 'INVALID_REQUEST', message: 'benchmarkCaseId non e valido.' }
    const evolutionTargetId = body.evolutionTargetId === undefined ? undefined : typeof body.evolutionTargetId === 'string' && EVOLUTION_TARGET_BY_ID[body.evolutionTargetId as EvolutionTargetId] ? body.evolutionTargetId as EvolutionTargetId : null
    const evolutionFunction = body.evolutionFunction === undefined ? undefined : typeof body.evolutionFunction === 'string' && EVOLUTION_FUNCTION_IDS.includes(body.evolutionFunction as EvolutionFunctionId) ? body.evolutionFunction as EvolutionFunctionId : null
    if (evolutionTargetId === null || evolutionFunction === null || Boolean(evolutionTargetId) !== Boolean(evolutionFunction)) return { valid: false, code: 'INVALID_REQUEST', message: 'target anatomico e funzione evolutiva devono essere entrambi validi.' }
    return {
        valid: true,
        request: {
            operation: 'GENERATE_CONCEPT',
            creatureId: required.creatureId,
            visualTraitId: body.visualTraitId as VisualTraitId,
            intensity: body.intensity,
            conceptMode: body.conceptMode,
            idempotencyKey: required.idempotencyKey,
            ...(evolutionTargetId && evolutionFunction ? { evolutionTargetId, evolutionFunction } : {}),
            ...(benchmarkCaseId ? { benchmarkCaseId } : {}),
        },
    }
}

export function parseGetTransformationRequestStatusRequest(value: unknown): ParsedGetTransformationRequestStatusRequest {
    const body = asRecord(value)
    if (!body) return { valid: false, code: 'INVALID_REQUEST', message: 'Il body deve essere un oggetto JSON.' }
    if (!hasOnlyFields(body, STATUS_REQUEST_FIELDS) || body.operation !== 'GET_REQUEST_STATUS' || typeof body.transformationRequestId !== 'string') {
        return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta di stato non rispetta il contratto pubblico.' }
    }
    const transformationRequestId = body.transformationRequestId.trim()
    if (!isUuid(transformationRequestId)) {
        return { valid: false, code: 'INVALID_REQUEST', message: 'transformationRequestId deve essere un UUID valido.' }
    }
    const reviewOwnerProfileId = body?.reviewOwnerProfileId === undefined ? undefined : readUuid(body, 'reviewOwnerProfileId')
    if (reviewOwnerProfileId === null) return { valid: false, code: 'INVALID_REQUEST', message: 'reviewOwnerProfileId deve essere un UUID valido.' }
    return { valid: true, request: { operation: 'GET_REQUEST_STATUS', transformationRequestId, ...(reviewOwnerProfileId ? { reviewOwnerProfileId } : {}) } }
}

export function parseGetCreatureTransformationLabUsageRequest(value: unknown): ParsedGetCreatureTransformationLabUsageRequest {
    const body = asRecord(value)
    if (!body || !hasOnlyFields(body, LAB_USAGE_REQUEST_FIELDS) || body.operation !== 'GET_LAB_USAGE') {
        return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta di utilizzo giornaliero non rispetta il contratto pubblico.' }
    }
    return { valid: true, request: { operation: 'GET_LAB_USAGE' } }
}

export function parseGenerateImageRequest(value: unknown): ParsedGenerateImageRequest {
    const body = asRecord(value)
    if (!body) return { valid: false, code: 'INVALID_REQUEST', message: 'Il body deve essere un oggetto JSON.' }
    if (!hasOnlyFields(body, IMAGE_REQUEST_FIELDS)) {
        return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta contiene campi non previsti dal contratto pubblico.' }
    }
    if (body.operation !== 'GENERATE_IMAGE') {
        return { valid: false, code: 'INVALID_REQUEST', message: 'operation deve essere GENERATE_IMAGE.' }
    }
    const required = readRequiredStrings(body)
    if (!required) return { valid: false, code: 'INVALID_REQUEST', message: 'creatureId e idempotencyKey sono obbligatori e hanno una lunghezza non valida.' }
    if (body.imageProviderMode !== 'MOCK' && body.imageProviderMode !== 'REAL') {
        return { valid: false, code: 'INVALID_REQUEST', message: 'imageProviderMode deve essere MOCK o REAL.' }
    }
    if (!asRecord(body.concept)) {
        return { valid: false, code: 'INVALID_REQUEST', message: 'concept deve essere un oggetto strutturato.' }
    }

    const benchmarkCaseId = readOptionalIdentifier(body, 'benchmarkCaseId')
    const generationProfileId = readOptionalIdentifier(body, 'generationProfileId')
    if (benchmarkCaseId === null || generationProfileId === null || Boolean(benchmarkCaseId) !== Boolean(generationProfileId)) {
        return { valid: false, code: 'INVALID_REQUEST', message: 'benchmarkCaseId e generationProfileId devono essere entrambi presenti e validi.' }
    }
    return {
        valid: true,
        request: {
            operation: 'GENERATE_IMAGE',
            creatureId: required.creatureId,
            concept: body.concept as CreatureTransformationConcept,
            imageProviderMode: body.imageProviderMode,
            idempotencyKey: required.idempotencyKey,
            ...(benchmarkCaseId && generationProfileId ? { benchmarkCaseId, generationProfileId } : {}),
        },
    }
}

export function parseGenerateLineageFirstExperimentRequest(value: unknown): ParsedGenerateLineageFirstExperimentRequest {
    const body = asRecord(value)
    if (!body || !hasOnlyFields(body, LINEAGE_EXPERIMENT_REQUEST_FIELDS) || body.operation !== 'GENERATE_LINEAGE_FIRST_EXPERIMENT') return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta lineage-first non rispetta il contratto pubblico.' }
    const required = readRequiredStrings(body)
    const evolutionTargetId = typeof body.evolutionTargetId === 'string' && EVOLUTION_TARGET_BY_ID[body.evolutionTargetId as EvolutionTargetId] ? body.evolutionTargetId as EvolutionTargetId : null
    const lineage = asRecord(body.lineage)
    const identityTraits = lineage?.identityTraits
    const acquiredTraits = lineage?.acquiredTraits
    if (!required || !evolutionTargetId || !Array.isArray(identityTraits) || !identityTraits.every((entry) => typeof entry === 'string' && entry.trim().length <= 500) || !Array.isArray(acquiredTraits) || acquiredTraits.length > 24 || !acquiredTraits.every((entry) => {
        const trait = asRecord(entry)
        return trait && typeof trait.description === 'string' && trait.description.trim().length > 0 && trait.description.trim().length <= 500 && (trait.target === undefined || (typeof trait.target === 'string' && Boolean(EVOLUTION_TARGET_BY_ID[trait.target as EvolutionTargetId])))
    }) || (body.instruction !== undefined && (typeof body.instruction !== 'string' || body.instruction.trim().length > 2000)) || (body.experimentalSourceRequestId !== undefined && !readUuid(body, 'experimentalSourceRequestId')) || (body.sourceVisualVersionId !== undefined && !readUuid(body, 'sourceVisualVersionId')) || (body.experimentalSourceRequestId !== undefined && body.sourceVisualVersionId !== undefined)) return { valid: false, code: 'INVALID_REQUEST', message: 'I dati lineage-first non sono validi.' }
    return { valid: true, request: { operation: 'GENERATE_LINEAGE_FIRST_EXPERIMENT', creatureId: required.creatureId, evolutionTargetId, lineage: { identityTraits, acquiredTraits: acquiredTraits as GenerateLineageFirstExperimentRequest['lineage']['acquiredTraits'] }, ...(typeof body.instruction === 'string' && body.instruction.trim() ? { instruction: body.instruction.trim() } : {}), ...(typeof body.experimentalSourceRequestId === 'string' ? { experimentalSourceRequestId: body.experimentalSourceRequestId.trim() } : {}), ...(typeof body.sourceVisualVersionId === 'string' ? { sourceVisualVersionId: body.sourceVisualVersionId.trim() } : {}), idempotencyKey: required.idempotencyKey } }
}

export function parseGenerateCurrentPipelineExperimentRequest(value: unknown): { valid: true, request: GenerateCurrentPipelineExperimentRequest } | Extract<ParsedCreatureTransformationRequest, { valid: false }> {
    const body = asRecord(value)
    const required = body ? readRequiredStrings(body) : null
    const evolutionTargetId = typeof body?.evolutionTargetId === 'string' && EVOLUTION_TARGET_BY_ID[body.evolutionTargetId as EvolutionTargetId] ? body.evolutionTargetId as EvolutionTargetId : null
    if (!body || !hasOnlyFields(body, CURRENT_PIPELINE_EXPERIMENT_FIELDS) || body.operation !== 'GENERATE_CURRENT_PIPELINE_EXPERIMENT' || !required || !evolutionTargetId || (body.experimentalSourceRequestId !== undefined && !readUuid(body, 'experimentalSourceRequestId')) || (body.sourceVisualVersionId !== undefined && !readUuid(body, 'sourceVisualVersionId')) || (body.experimentalSourceRequestId !== undefined && body.sourceVisualVersionId !== undefined)) return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta Current pipeline non rispetta il contratto pubblico.' }
    return { valid: true, request: { operation: 'GENERATE_CURRENT_PIPELINE_EXPERIMENT', creatureId: required.creatureId, evolutionTargetId, ...(typeof body.experimentalSourceRequestId === 'string' ? { experimentalSourceRequestId: body.experimentalSourceRequestId.trim() } : {}), ...(typeof body.sourceVisualVersionId === 'string' ? { sourceVisualVersionId: body.sourceVisualVersionId.trim() } : {}), idempotencyKey: required.idempotencyKey } }
}

export function parseSubmitExperimentReviewRequest(value: unknown): ParsedSubmitExperimentReviewRequest {
    const body = asRecord(value)
    if (!body || !hasOnlyFields(body, REVIEW_REQUEST_FIELDS) || body.operation !== 'SUBMIT_EXPERIMENT_REVIEW' || typeof body.transformationRequestId !== 'string') {
        return { valid: false, code: 'INVALID_REQUEST', message: 'La review non rispetta il contratto pubblico.' }
    }
    const transformationRequestId = body.transformationRequestId.trim()
    if (!isUuid(transformationRequestId)) return { valid: false, code: 'INVALID_REQUEST', message: 'transformationRequestId deve essere un UUID valido.' }
    const validationError = validateExperimentReviewInput({ scores: body.scores, verdict: body.verdict, issueFlags: body.issueFlags, ...(body.notes === undefined ? {} : { notes: body.notes }) })
    if (validationError) return { valid: false, code: 'INVALID_REQUEST', message: validationError }
    return {
        valid: true,
        request: {
            operation: 'SUBMIT_EXPERIMENT_REVIEW', transformationRequestId,
            scores: body.scores as SubmitExperimentReviewRequest['scores'], verdict: body.verdict as SubmitExperimentReviewRequest['verdict'],
            issueFlags: body.issueFlags as SubmitExperimentReviewRequest['issueFlags'], ...(typeof body.notes === 'string' && body.notes.trim() ? { notes: body.notes.trim() } : {}),
        },
    }
}

export function parseSubmitLineageComparisonReviewRequest(value: unknown): { valid: true, request: SubmitLineageComparisonReviewRequest } | Extract<ParsedCreatureTransformationRequest, { valid: false }> {
    const body = asRecord(value)
    const scores = asRecord(body?.scores)
    const validScores = ['creativeSurprise', 'targetTransformationStrength', 'creatureContinuity', 'lineagePreservation', 'nonTargetStability'].every((key) => scores?.[key] === 1 || scores?.[key] === 2 || scores?.[key] === 3 || scores?.[key] === 4 || scores?.[key] === 5)
    const creatureId = typeof body?.creatureId === 'string' && body.creatureId.trim().length ? body.creatureId.trim() : null
    const lineageRequestId = body ? readUuid(body, 'lineageRequestId') : null
    const currentRequestId = body?.currentRequestId === undefined ? undefined : body ? readUuid(body, 'currentRequestId') : null
    if (!body || !hasOnlyFields(body, LINEAGE_REVIEW_REQUEST_FIELDS) || body.operation !== 'SUBMIT_LINEAGE_COMPARISON_REVIEW' || !creatureId || !lineageRequestId || currentRequestId === null || !validScores || !['CURRENT', 'LINEAGE_FIRST', 'NONE'].includes(String(body.preferredResult))) return { valid: false, code: 'INVALID_REQUEST', message: 'La review A/B lineage-first non rispetta il contratto.' }
    return { valid: true, request: { operation: 'SUBMIT_LINEAGE_COMPARISON_REVIEW', creatureId, lineageRequestId, ...(currentRequestId ? { currentRequestId } : {}), scores: scores as SubmitLineageComparisonReviewRequest['scores'], preferredResult: body.preferredResult as SubmitLineageComparisonReviewRequest['preferredResult'] } }
}

export function parseGetLineageComparisonReviewsRequest(value: unknown): { valid: true, request: GetLineageComparisonReviewsRequest } | Extract<ParsedCreatureTransformationRequest, { valid: false }> {
    const body = asRecord(value)
    if (!body || !hasOnlyFields(body, LINEAGE_REVIEW_LIST_REQUEST_FIELDS) || body.operation !== 'GET_LINEAGE_COMPARISON_REVIEWS') return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta di elenco review lineage-first non rispetta il contratto.' }
    return { valid: true, request: { operation: 'GET_LINEAGE_COMPARISON_REVIEWS' } }
}

export function parseGetBenchmarkResultsRequest(value: unknown): ParsedGetBenchmarkResultsRequest {
    const body = asRecord(value)
    if (!body || !hasOnlyFields(body, BENCHMARK_RESULTS_REQUEST_FIELDS) || body.operation !== 'GET_BENCHMARK_RESULTS') {
        return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta benchmark non rispetta il contratto pubblico.' }
    }
    return { valid: true, request: { operation: 'GET_BENCHMARK_RESULTS' } }
}

export function parseGenerateUnlockedTransformationRequest(value: unknown): ParsedVisualProgressRequest<GenerateUnlockedTransformationRequest> {
    const body = asRecord(value)
    if (!body || !hasOnlyFields(body, UNLOCKED_REQUEST_FIELDS) || body.operation !== 'GENERATE_UNLOCKED_TRANSFORMATION') return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta di generazione sbloccata non rispetta il contratto.' }
    const required = readRequiredStrings(body)
    const progressTrackId = readUuid(body, 'progressTrackId')
    if (!required || !progressTrackId) return { valid: false, code: 'INVALID_REQUEST', message: 'creatureId, progressTrackId e idempotencyKey sono obbligatori.' }
    return { valid: true, request: { operation: 'GENERATE_UNLOCKED_TRANSFORMATION', creatureId: required.creatureId, progressTrackId, idempotencyKey: required.idempotencyKey } }
}

export function parseSubmitBackgroundRemovalCandidateRequest(value: unknown): ParsedVisualProgressRequest<SubmitBackgroundRemovalCandidateRequest> {
    const body = asRecord(value)
    const transformationRequestId = body ? readUuid(body, 'transformationRequestId') : null
    if (!body || !hasOnlyFields(body, BACKGROUND_REMOVAL_CANDIDATE_REQUEST_FIELDS) || body.operation !== 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE' || !transformationRequestId || typeof body.candidatePngBase64 !== 'string' || !body.candidatePngBase64.length || body.candidatePngBase64.length > 14_000_000) {
        return { valid: false, code: 'INVALID_REQUEST', message: 'Il candidato PNG non rispetta il contratto.' }
    }
    if (body.displayAssetWebpBase64 !== undefined && (typeof body.displayAssetWebpBase64 !== 'string' || !body.displayAssetWebpBase64.length || body.displayAssetWebpBase64.length > 4_000_000)) return { valid: false, code: 'INVALID_REQUEST', message: 'Il display asset non rispetta il contratto.' }
    return { valid: true, request: { operation: 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE', transformationRequestId, candidatePngBase64: body.candidatePngBase64, ...(typeof body.displayAssetWebpBase64 === 'string' ? { displayAssetWebpBase64: body.displayAssetWebpBase64 } : {}) } }
}

export function parseListVisualBackgroundCleanupRequest(value: unknown): ParsedVisualBackgroundCleanupRequest<ListVisualBackgroundCleanupRequest> {
    const body = asRecord(value)
    if (!body || !hasOnlyFields(body, VISUAL_BACKGROUND_CLEANUP_LIST_REQUEST_FIELDS) || body.operation !== 'LIST_VISUAL_BACKGROUND_CLEANUP') return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta batch non rispetta il contratto.' }
    return { valid: true, request: { operation: 'LIST_VISUAL_BACKGROUND_CLEANUP' } }
}

export function parseSubmitVisualBackgroundCleanupRequest(value: unknown): ParsedVisualBackgroundCleanupRequest<SubmitVisualBackgroundCleanupRequest> {
    const body = asRecord(value)
    const visualVersionId = body ? readUuid(body, 'visualVersionId') : null
    if (!body || !hasOnlyFields(body, VISUAL_BACKGROUND_CLEANUP_SUBMIT_REQUEST_FIELDS) || body.operation !== 'SUBMIT_VISUAL_BACKGROUND_CLEANUP' || !visualVersionId || typeof body.candidatePngBase64 !== 'string' || !body.candidatePngBase64.length || body.candidatePngBase64.length > 14_000_000 || (body.displayAssetWebpBase64 !== undefined && (typeof body.displayAssetWebpBase64 !== 'string' || !body.displayAssetWebpBase64.length || body.displayAssetWebpBase64.length > 4_000_000))) return { valid: false, code: 'INVALID_REQUEST', message: 'Il PNG batch non rispetta il contratto.' }
    return { valid: true, request: { operation: 'SUBMIT_VISUAL_BACKGROUND_CLEANUP', visualVersionId, candidatePngBase64: body.candidatePngBase64, ...(typeof body.displayAssetWebpBase64 === 'string' ? { displayAssetWebpBase64: body.displayAssetWebpBase64 } : {}) } }
}

export function parseSelectCreatureVisualProgressTrackRequest(value: unknown): ParsedVisualProgressRequest<SelectCreatureVisualProgressTrackRequest> {
    const body = asRecord(value)
    if (!body || !hasOnlyFields(body, SELECT_TRACK_REQUEST_FIELDS) || body.operation !== 'SELECT_VISUAL_PROGRESS_TRACK' || typeof body.creatureId !== 'string' || !body.creatureId.trim()) return { valid: false, code: 'INVALID_REQUEST', message: 'La scelta del percorso visuale non rispetta il contratto.' }
    const visualTraitId = typeof body.visualTraitId === 'string' && VISUAL_TRAIT_BY_ID[body.visualTraitId as VisualTraitId]
        ? body.visualTraitId as VisualTraitId
        : undefined
    const evolutionTargetId = typeof body.evolutionTargetId === 'string' && EVOLUTION_TARGET_BY_ID[body.evolutionTargetId as EvolutionTargetId]
        ? body.evolutionTargetId as EvolutionTargetId
        : undefined
    if (Boolean(visualTraitId) === Boolean(evolutionTargetId)) {
        return { valid: false, code: visualTraitId || evolutionTargetId ? 'INVALID_REQUEST' : 'INVALID_VISUAL_TRAIT', message: 'La track richiede un solo Visual Trait legacy o un solo target anatomico valido.' }
    }
    return { valid: true, request: { operation: 'SELECT_VISUAL_PROGRESS_TRACK', creatureId: body.creatureId.trim(), ...(visualTraitId ? { visualTraitId } : { evolutionTargetId: evolutionTargetId! }) } }
}

function parseCreatureOnly<T extends 'GET_VISUAL_PROGRESS' | 'GET_CURRENT_VISUAL'>(value: unknown, operation: T, fields: Set<string>): ParsedVisualProgressRequest<T extends 'GET_VISUAL_PROGRESS' ? GetCreatureVisualProgressRequest : GetCurrentCreatureVisualRequest> {
    const body = asRecord(value)
    if (!body || !hasOnlyFields(body, fields) || body.operation !== operation || typeof body.creatureId !== 'string' || !body.creatureId.trim()) return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta visuale non rispetta il contratto.' }
    return { valid: true, request: { operation, creatureId: body.creatureId.trim() } as T extends 'GET_VISUAL_PROGRESS' ? GetCreatureVisualProgressRequest : GetCurrentCreatureVisualRequest }
}

export function parseGetCreatureVisualProgressRequest(value: unknown) { return parseCreatureOnly(value, 'GET_VISUAL_PROGRESS', GET_VISUAL_PROGRESS_REQUEST_FIELDS) }
export function parseGetCurrentCreatureVisualRequest(value: unknown) { return parseCreatureOnly(value, 'GET_CURRENT_VISUAL', GET_CURRENT_VISUAL_REQUEST_FIELDS) }

export function parseGetGameCreatureVisualsRequest(value: unknown): ParsedVisualProgressRequest<GetGameCreatureVisualsRequest> {
    const body = asRecord(value); const gameId = body ? readUuid(body, 'gameId') : null
    if (!body || !hasOnlyFields(body, GET_GAME_VISUALS_REQUEST_FIELDS) || body.operation !== 'GET_GAME_VISUALS' || !gameId) return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta visuale della partita non rispetta il contratto.' }
    return { valid: true, request: { operation: 'GET_GAME_VISUALS', gameId } }
}

export function parseAdoptCreatureTransformationRequest(value: unknown): ParsedVisualProgressRequest<AdoptCreatureTransformationRequest> {
    const body = asRecord(value)
    const progressTrackId = body ? readUuid(body, 'progressTrackId') : null; const transformationRequestId = body ? readUuid(body, 'transformationRequestId') : null; const expectedCurrentVisualVersionId = body ? readUuid(body, 'expectedCurrentVisualVersionId') : null
    if (!body || !hasOnlyFields(body, ADOPT_REQUEST_FIELDS) || body.operation !== 'ADOPT_CREATURE_TRANSFORMATION' || typeof body.creatureId !== 'string' || !body.creatureId.trim() || !progressTrackId || !transformationRequestId || !expectedCurrentVisualVersionId) return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta di adozione non rispetta il contratto.' }
    return { valid: true, request: { operation: 'ADOPT_CREATURE_TRANSFORMATION', creatureId: body.creatureId.trim(), progressTrackId, transformationRequestId, expectedCurrentVisualVersionId } }
}

export function parseRollbackCreatureVisualVersionRequest(value: unknown): ParsedVisualProgressRequest<RollbackCreatureVisualVersionRequest> {
    const body = asRecord(value); const targetVersionId = body ? readUuid(body, 'targetVersionId') : null; const expectedCurrentVisualVersionId = body ? readUuid(body, 'expectedCurrentVisualVersionId') : null
    if (!body || !hasOnlyFields(body, ROLLBACK_REQUEST_FIELDS) || body.operation !== 'ROLLBACK_CREATURE_VISUAL_VERSION' || typeof body.creatureId !== 'string' || !body.creatureId.trim() || !targetVersionId || !expectedCurrentVisualVersionId) return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta di rollback non rispetta il contratto.' }
    return { valid: true, request: { operation: 'ROLLBACK_CREATURE_VISUAL_VERSION', creatureId: body.creatureId.trim(), targetVersionId, expectedCurrentVisualVersionId } }
}

export function parseCreatureTransformationRequest(value: unknown): ParsedCreatureTransformationRequest {
    const body = asRecord(value)
    if (!body) return { valid: false, code: 'INVALID_REQUEST', message: 'Il body deve essere un oggetto JSON.' }
    if (body.operation === 'GENERATE_CONCEPT') return parseGenerateConceptRequest(body)
    if (body.operation === 'GENERATE_IMAGE') return parseGenerateImageRequest(body)
    if (body.operation === 'GENERATE_LINEAGE_FIRST_EXPERIMENT') return parseGenerateLineageFirstExperimentRequest(body)
    if (body.operation === 'GENERATE_CURRENT_PIPELINE_EXPERIMENT') return parseGenerateCurrentPipelineExperimentRequest(body)
    if (body.operation === 'GET_REQUEST_STATUS') return parseGetTransformationRequestStatusRequest(body)
    if (body.operation === 'GET_LAB_USAGE') return parseGetCreatureTransformationLabUsageRequest(body)
    if (body.operation === 'SUBMIT_EXPERIMENT_REVIEW') return parseSubmitExperimentReviewRequest(body)
    if (body.operation === 'SUBMIT_LINEAGE_COMPARISON_REVIEW') return parseSubmitLineageComparisonReviewRequest(body)
    if (body.operation === 'GET_LINEAGE_COMPARISON_REVIEWS') return parseGetLineageComparisonReviewsRequest(body)
    if (body.operation === 'GET_BENCHMARK_RESULTS') return parseGetBenchmarkResultsRequest(body)
    if (body.operation === 'GENERATE_UNLOCKED_TRANSFORMATION') return parseGenerateUnlockedTransformationRequest(body)
    if (body.operation === 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE') return parseSubmitBackgroundRemovalCandidateRequest(body)
    if (body.operation === 'SELECT_VISUAL_PROGRESS_TRACK') return parseSelectCreatureVisualProgressTrackRequest(body)
    if (body.operation === 'GET_VISUAL_PROGRESS') return parseGetCreatureVisualProgressRequest(body)
    if (body.operation === 'GET_CURRENT_VISUAL') return parseGetCurrentCreatureVisualRequest(body)
    if (body.operation === 'GET_GAME_VISUALS') return parseGetGameCreatureVisualsRequest(body)
    if (body.operation === 'ADOPT_CREATURE_TRANSFORMATION') return parseAdoptCreatureTransformationRequest(body)
    if (body.operation === 'ROLLBACK_CREATURE_VISUAL_VERSION') return parseRollbackCreatureVisualVersionRequest(body)
    return { valid: false, code: 'INVALID_REQUEST', message: 'operation non e supportata.' }
}
