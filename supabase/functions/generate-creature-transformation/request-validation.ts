import type { CreatureTransformationConcept } from '../../../shared/creature-transformations/concepts.ts'
import type { CreatureTransformationRequest, GenerateConceptRequest, GenerateImageRequest } from '../../../shared/creature-transformations/contracts.ts'
import type { VisualTraitId } from '../../../shared/creature-transformations/visual-traits.ts'
import { VISUAL_TRAIT_BY_ID } from '../../../shared/creature-transformations/visual-traits.ts'

const CONCEPT_REQUEST_FIELDS = new Set(['operation', 'creatureId', 'visualTraitId', 'intensity', 'conceptMode', 'idempotencyKey'])
const IMAGE_REQUEST_FIELDS = new Set(['operation', 'creatureId', 'concept', 'imageProviderMode', 'idempotencyKey'])

export type ParsedCreatureTransformationRequest =
    | { valid: true; request: CreatureTransformationRequest }
    | { valid: false; code: 'INVALID_REQUEST' | 'INVALID_VISUAL_TRAIT' | 'OPERATION_NOT_IMPLEMENTED'; message: string }

export type ParsedGenerateConceptRequest =
    | { valid: true; request: GenerateConceptRequest }
    | Extract<ParsedCreatureTransformationRequest, { valid: false }>

export type ParsedGenerateImageRequest =
    | { valid: true; request: GenerateImageRequest }
    | Extract<ParsedCreatureTransformationRequest, { valid: false }>

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

    return {
        valid: true,
        request: {
            operation: 'GENERATE_CONCEPT',
            creatureId: required.creatureId,
            visualTraitId: body.visualTraitId as VisualTraitId,
            intensity: body.intensity,
            conceptMode: body.conceptMode,
            idempotencyKey: required.idempotencyKey,
        },
    }
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

    return {
        valid: true,
        request: {
            operation: 'GENERATE_IMAGE',
            creatureId: required.creatureId,
            concept: body.concept as CreatureTransformationConcept,
            imageProviderMode: body.imageProviderMode,
            idempotencyKey: required.idempotencyKey,
        },
    }
}

export function parseCreatureTransformationRequest(value: unknown): ParsedCreatureTransformationRequest {
    const body = asRecord(value)
    if (!body) return { valid: false, code: 'INVALID_REQUEST', message: 'Il body deve essere un oggetto JSON.' }
    if (body.operation === 'GENERATE_CONCEPT') return parseGenerateConceptRequest(body)
    if (body.operation === 'GENERATE_IMAGE') return parseGenerateImageRequest(body)
    return { valid: false, code: 'INVALID_REQUEST', message: 'operation deve essere GENERATE_CONCEPT o GENERATE_IMAGE.' }
}
