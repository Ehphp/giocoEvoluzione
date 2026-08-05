import { describe, expect, it } from 'vitest'

import { createValidConcept, TEST_CREATURE_IDENTITY } from '../../../shared/creature-transformations/concept-test-fixtures.ts'
import { VISUAL_TRAIT_BY_ID } from '../../../shared/creature-transformations/visual-traits.ts'
import { OpenAiStructuredConceptModel, OpenAiStructuredConceptModelError } from './openai-structured-concept-model.ts'

const input = {
    task: 'CREATE_CREATURE_TRANSFORMATION_CONCEPT' as const,
    identity: TEST_CREATURE_IDENTITY,
    visualTrait: VISUAL_TRAIT_BY_ID.IMPACT_ADAPTATION,
    intensity: 2 as const,
    correctionFeedback: ['INVALID_INTENSITY: ripristina il valore richiesto'],
}

describe('OpenAiStructuredConceptModel', () => {
    it('uses the Responses API structured schema and returns parsed unknown JSON', async () => {
        let requestBody = ''
        const model = new OpenAiStructuredConceptModel({
            apiKey: 'test-key', model: 'test-model',
            fetchImplementation: async (_url, options) => {
                requestBody = String(options?.body)
                return new Response(JSON.stringify({ output_text: JSON.stringify(createValidConcept()) }), { status: 200 })
            },
        })

        await expect(model.generateStructuredConcept(input)).resolves.toEqual(createValidConcept())
        const payload = JSON.parse(requestBody) as { text: { format: { schema: { properties: Record<string, unknown> } } } }
        expect(requestBody).toContain('"store":false')
        expect(requestBody).toContain('"type":"json_schema"')
        expect(requestBody).toContain('INVALID_INTENSITY: ripristina il valore richiesto')
        expect(requestBody).toContain('Do not return colorEvolution for this legacy trait-based concept')
        expect(requestBody).not.toContain(TEST_CREATURE_IDENTITY.creatureId)
        expect(requestBody).not.toContain(TEST_CREATURE_IDENTITY.baseCreatureKey)
        expect(payload.text.format.schema.properties.schemaVersion).toEqual({ type: 'integer', enum: [1] })
        expect(payload.text.format.schema.properties.visualTrait).toEqual({ type: 'string', enum: [input.visualTrait.id] })
        expect(payload.text.format.schema.properties.intensity).toEqual({ type: 'integer', enum: [input.intensity] })
        expect(payload.text.format.schema.properties.colorEvolution).toBeUndefined()
        expect(JSON.stringify(payload.text.format.schema)).not.toContain('"const"')
    })

    it('requires constrained colour evolution for anatomy-targeted concepts', async () => {
        let requestBody = ''
        const targetInput = {
            ...input,
            evolutionTarget: { id: 'TAIL', primaryBodyAreas: ['TAIL'], supportingBodyAreas: ['BACK'] },
            evolutionTargetId: 'TAIL' as const,
            evolutionFunction: 'BALANCE' as const,
        }
        const model = new OpenAiStructuredConceptModel({
            apiKey: 'test-key', model: 'test-model',
            fetchImplementation: async (_url, options) => {
                requestBody = String(options?.body)
                return new Response(JSON.stringify({ output_text: JSON.stringify(createValidConcept()) }), { status: 200 })
            },
        })

        await model.generateStructuredConcept(targetInput)

        const schema = (JSON.parse(requestBody) as { text: { format: { schema: { required: string[], properties: Record<string, unknown> } } } }).text.format.schema
        expect(requestBody).toContain('Always return colorEvolution')
        expect(schema.required).toContain('colorEvolution')
        expect(schema.properties.colorEvolution).toMatchObject({ type: 'object' })
    })

    it('maps malformed output and provider statuses without retries', async () => {
        const malformed = new OpenAiStructuredConceptModel({
            apiKey: 'test-key', model: 'test-model',
            fetchImplementation: async () => new Response(JSON.stringify({ output_text: '{bad json' }), { status: 200 }),
        })
        await expect(malformed.generateStructuredConcept(input)).rejects.toMatchObject({ code: 'AI_RESPONSE_INVALID' } satisfies Partial<OpenAiStructuredConceptModelError>)

        const limited = new OpenAiStructuredConceptModel({ apiKey: 'test-key', model: 'test-model', fetchImplementation: async () => new Response('', { status: 429 }) })
        await expect(limited.generateStructuredConcept(input)).rejects.toMatchObject({ code: 'AI_RATE_LIMITED' } satisfies Partial<OpenAiStructuredConceptModelError>)

        const badRequest = new OpenAiStructuredConceptModel({
            apiKey: 'test-key', model: 'test-model',
            fetchImplementation: async () => new Response(JSON.stringify({ error: { code: 'invalid_json_schema', message: 'not retained' } }), { status: 400 }),
        })
        await expect(badRequest.generateStructuredConcept(input)).rejects.toMatchObject({ code: 'AI_BAD_REQUEST', providerErrorCode: 'invalid_json_schema' } satisfies Partial<OpenAiStructuredConceptModelError>)

        const unauthenticated = new OpenAiStructuredConceptModel({ apiKey: 'test-key', model: 'test-model', fetchImplementation: async () => new Response('', { status: 401 }) })
        await expect(unauthenticated.generateStructuredConcept(input)).rejects.toMatchObject({ code: 'AI_AUTHENTICATION_FAILED' } satisfies Partial<OpenAiStructuredConceptModelError>)

        const denied = new OpenAiStructuredConceptModel({ apiKey: 'test-key', model: 'test-model', fetchImplementation: async () => new Response('', { status: 403 }) })
        await expect(denied.generateStructuredConcept(input)).rejects.toMatchObject({ code: 'AI_PERMISSION_DENIED' } satisfies Partial<OpenAiStructuredConceptModelError>)

        const unavailable = new OpenAiStructuredConceptModel({ apiKey: 'test-key', model: 'test-model', fetchImplementation: async () => new Response('', { status: 500 }) })
        await expect(unavailable.generateStructuredConcept(input)).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR' } satisfies Partial<OpenAiStructuredConceptModelError>)
    })

    it('maps a rejected fetch as a network error without retaining the cause details', async () => {
        const offline = new OpenAiStructuredConceptModel({
            apiKey: 'test-key', model: 'test-model',
            fetchImplementation: async () => { throw new TypeError('network unreachable') },
        })

        await expect(offline.generateStructuredConcept(input)).rejects.toMatchObject({ code: 'AI_NETWORK_ERROR' } satisfies Partial<OpenAiStructuredConceptModelError>)
    })

    it('maps an explicit timeout from the injected HTTP dependency', async () => {
        const timeout = new OpenAiStructuredConceptModel({
            apiKey: 'test-key', model: 'test-model', timeoutMs: 1,
            fetchImplementation: async (_url, options) => new Promise<Response>((_resolve, reject) => {
                options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
            }),
        })

        await expect(timeout.generateStructuredConcept(input)).rejects.toMatchObject({ code: 'AI_TIMEOUT' } satisfies Partial<OpenAiStructuredConceptModelError>)
    })
})
