import type { GenerateConceptRequest } from '../../../shared/creature-transformations/contracts.ts'
import type { VisualTraitId } from '../../../shared/creature-transformations/visual-traits.ts'
import { VISUAL_TRAIT_BY_ID } from '../../../shared/creature-transformations/visual-traits.ts'

const REQUEST_FIELDS = new Set(['operation', 'creatureId', 'visualTraitId', 'intensity', 'conceptMode', 'idempotencyKey'])

export type ParsedGenerateConceptRequest =
    | { valid: true; request: GenerateConceptRequest }
    | { valid: false; code: 'INVALID_REQUEST' | 'INVALID_VISUAL_TRAIT' | 'OPERATION_NOT_IMPLEMENTED'; message: string }

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function parseGenerateConceptRequest(value: unknown): ParsedGenerateConceptRequest {
    const body = asRecord(value)
    if (!body) return { valid: false, code: 'INVALID_REQUEST', message: 'Il body deve essere un oggetto JSON.' }
    if (body.operation === 'GENERATE_IMAGE') {
        return { valid: false, code: 'OPERATION_NOT_IMPLEMENTED', message: 'La generazione immagine non e implementata in questa fase.' }
    }
    if (Object.keys(body).some((field) => !REQUEST_FIELDS.has(field))) {
        return { valid: false, code: 'INVALID_REQUEST', message: 'La richiesta contiene campi non previsti dal contratto pubblico.' }
    }
    if (body.operation !== 'GENERATE_CONCEPT') {
        return { valid: false, code: 'INVALID_REQUEST', message: 'operation deve essere GENERATE_CONCEPT.' }
    }
    if (typeof body.creatureId !== 'string' || !body.creatureId.trim() || typeof body.idempotencyKey !== 'string' || !body.idempotencyKey.trim()) {
        return { valid: false, code: 'INVALID_REQUEST', message: 'creatureId e idempotencyKey sono obbligatori.' }
    }
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
            creatureId: body.creatureId.trim(),
            visualTraitId: body.visualTraitId as VisualTraitId,
            intensity: body.intensity,
            conceptMode: body.conceptMode,
            idempotencyKey: body.idempotencyKey.trim(),
        },
    }
}
