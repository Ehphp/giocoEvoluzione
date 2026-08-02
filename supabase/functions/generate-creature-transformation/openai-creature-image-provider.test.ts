import { describe, expect, it, vi } from 'vitest'

import { createTestPng } from '../../../shared/creature-transformations/image-test-fixtures.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from '../../../shared/creature-transformations/render-specifications.ts'
import { OpenAiCreatureImageProvider } from './openai-creature-image-provider.ts'

function base64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
}

function input() {
    return {
        requestId: 'http-request-1', idempotencyKey: 'intentional-key-1', prompt: 'SERVER COMPOSED PROMPT ONLY',
        source: { bytes: createTestPng(), mimeType: 'image/png' as const, width: 1024, height: 1536, sha256: 'a'.repeat(64) },
        renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
    }
}

function provider(fetchImplementation: (input: string, init: RequestInit) => Promise<Response>, overrides: Partial<ConstructorParameters<typeof OpenAiCreatureImageProvider>[0]> = {}) {
    return new OpenAiCreatureImageProvider({
        apiKey: 'test-key-never-logged', model: 'configured-image-model', quality: 'medium', timeoutMs: 50, estimatedCostUsd: 0.12,
        fetchImplementation,
        ...overrides,
    })
}

describe('OpenAiCreatureImageProvider', () => {
    it('sends one multipart edit with the canonical PNG and server-composed prompt', async () => {
        const fetchImplementation = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ data: [{ b64_json: base64(createTestPng()) }] }), { headers: { 'x-request-id': 'openai-request-1' } }))
        const result = await provider(fetchImplementation, { now: (() => { const ticks = [10, 35]; return () => ticks.shift() ?? 35 })() }).transformCreature(input())
        const [url, init] = fetchImplementation.mock.calls[0]
        const form = init.body as FormData

        expect(fetchImplementation).toHaveBeenCalledTimes(1)
        expect(url).toBe('https://api.openai.com/v1/images/edits')
        expect(init.method).toBe('POST')
        expect(init.headers).toEqual({ Authorization: 'Bearer test-key-never-logged' })
        expect(form.get('model')).toBe('configured-image-model')
        expect(form.get('quality')).toBe('medium')
        expect(form.get('size')).toBe('1024x1536')
        expect(form.get('output_format')).toBe('png')
        expect(form.get('n')).toBe('1')
        expect(form.get('prompt')).toBe('SERVER COMPOSED PROMPT ONLY')
        expect(form.get('image[]')).toBeInstanceOf(Blob)
        expect(result).toMatchObject({ provider: 'openai-image-api', model: 'configured-image-model', providerRequestId: 'openai-request-1', latencyMs: 25, estimatedCostUsd: 0.12, image: createTestPng() })
        expect(JSON.stringify(result)).not.toContain('test-key-never-logged')
    })

    it('maps timeout, rate limit, bad request, moderation, provider error and invalid response without retrying', async () => {
        const timeout = provider(async (_url, init) => new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }), { timeoutMs: 1 })
        await expect(timeout.transformCreature(input())).rejects.toMatchObject({ code: 'OPENAI_IMAGE_TIMEOUT' })

        for (const [status, payload, code] of [
            [429, { error: { code: 'rate_limit' } }, 'OPENAI_IMAGE_RATE_LIMITED'],
            [400, { error: { code: 'invalid_request_error' } }, 'OPENAI_IMAGE_BAD_REQUEST'],
            [400, { error: { code: 'moderation_blocked' } }, 'OPENAI_IMAGE_MODERATION_BLOCKED'],
            [500, { error: { code: 'server_error' } }, 'OPENAI_IMAGE_PROVIDER_ERROR'],
        ] as const) {
            const fetchImplementation = vi.fn(async () => new Response(JSON.stringify(payload), { status }))
            await expect(provider(fetchImplementation).transformCreature(input())).rejects.toMatchObject({ code })
            expect(fetchImplementation).toHaveBeenCalledTimes(1)
        }

        await expect(provider(async () => new Response('not json')).transformCreature(input())).rejects.toMatchObject({ code: 'OPENAI_IMAGE_RESPONSE_INVALID' })
        await expect(provider(async () => new Response(JSON.stringify({ data: [{ b64_json: 'not-base64!' }] }))).transformCreature(input())).rejects.toMatchObject({ code: 'OPENAI_IMAGE_BASE64_INVALID' })
    })
})
