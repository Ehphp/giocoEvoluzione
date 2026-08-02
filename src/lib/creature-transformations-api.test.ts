import { describe, expect, it, vi } from 'vitest'

import { composeCreatureTransformationPrompt, CREATURE_PROMPT_TEMPLATE_VERSION } from '../../shared/creature-transformations/prompt-composer.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from '../../shared/creature-transformations/render-specifications.ts'
import { createValidConcept, TEST_CREATURE_IDENTITY } from '../../shared/creature-transformations/concept-test-fixtures.ts'
import {
    createConceptIdempotencyKey,
    createImageIdempotencyKey,
    CreatureTransformationApiError,
    generateCreatureTransformationConcept,
    generateCreatureTransformationImage,
} from './creature-transformations-api'

const request = {
    operation: 'GENERATE_CONCEPT' as const,
    creatureId: 'creature-1',
    visualTraitId: 'IMPACT_ADAPTATION' as const,
    intensity: 2 as const,
    conceptMode: 'MOCK' as const,
    idempotencyKey: 'request-1',
}

const successResponse = {
    success: true as const,
    requestId: 'request-1',
    identity: TEST_CREATURE_IDENTITY,
    concept: createValidConcept(),
    evaluation: { acceptable: true, identityRisk: 'LOW' as const, transformationStrength: 'BALANCED' as const, problems: [] },
    prompt: composeCreatureTransformationPrompt({
        identity: TEST_CREATURE_IDENTITY,
        concept: createValidConcept(),
        renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
        templateVersion: CREATURE_PROMPT_TEMPLATE_VERSION,
    }),
    generation: { generator: 'mock-creature-concept-generator', isMock: true, attempts: 1, latencyMs: 10 },
}

const imageRequest = {
    operation: 'GENERATE_IMAGE' as const,
    creatureId: 'creature-1',
    concept: createValidConcept(),
    imageProviderMode: 'MOCK' as const,
    idempotencyKey: 'image-request-1',
}

const imageSuccessResponse = {
    success: true as const,
    requestId: 'image-request-1',
    result: { signedUrl: 'https://signed.example/image.png', expiresAt: '2026-08-02T10:00:00.000Z', mimeType: 'image/png' as const, width: 1024, height: 1536, sha256: 'a'.repeat(64) },
    generation: { provider: 'mock-creature-image-provider', model: 'source-byte-copy-v1', isMock: true, latencyMs: 10, estimatedCostUsd: 0 },
    validation: { warnings: ['MOCK_PROVIDER_NO_VISUAL_TRANSFORMATION', 'RESULT_IMAGE_UNCHANGED_MOCK'] },
}

describe('creature transformations API client', () => {
    it('invokes only the concept Function with the shared request contract', async () => {
        const invoke = vi.fn(async () => ({ data: successResponse, error: null }))

        await expect(generateCreatureTransformationConcept(request, { invoke })).resolves.toEqual(successResponse)
        expect(invoke).toHaveBeenCalledWith('generate-creature-transformation', { body: request })
    })

    it('extracts structured Function errors from Supabase response context', async () => {
        const context = new Response(JSON.stringify({
            success: false,
            requestId: 'request-2',
            code: 'CONCEPT_REJECTED',
            message: 'Il concept non ha superato i controlli richiesti.',
            problems: [{ code: 'INVALID_INTENSITY', message: 'Intensita non valida.' }],
        }))
        const error = Object.assign(new Error('FunctionsHttpError'), { context })

        await expect(generateCreatureTransformationConcept(request, { invoke: async () => ({ data: null, error }) })).rejects.toMatchObject({
            code: 'CONCEPT_REJECTED',
            requestId: 'request-2',
        } satisfies Partial<CreatureTransformationApiError>)
    })

    it('invokes GENERATE_IMAGE separately and never constructs a prompt or Storage path in the client', async () => {
        const invoke = vi.fn(async () => ({ data: imageSuccessResponse, error: null }))

        await expect(generateCreatureTransformationImage(imageRequest, { invoke })).resolves.toEqual(imageSuccessResponse)
        expect(invoke).toHaveBeenCalledWith('generate-creature-transformation', { body: imageRequest })
        expect(JSON.stringify(invoke.mock.calls)).not.toContain('prompt')
        expect(JSON.stringify(invoke.mock.calls)).not.toContain('bucket')
    })

    it('creates a fresh idempotency key for each intentional request', () => {
        expect(createConceptIdempotencyKey()).not.toBe(createConceptIdempotencyKey())
        expect(createImageIdempotencyKey()).not.toBe(createImageIdempotencyKey())
    })
})
