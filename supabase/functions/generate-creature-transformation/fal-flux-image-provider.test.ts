import { describe, expect, it, vi } from 'vitest'

import { createTestPng } from '../../../shared/creature-transformations/image-test-fixtures.ts'
import { FAL_FLUX_MODEL, FAL_SEEDREAM_MODEL, FalFluxImageProvider } from './fal-flux-image-provider.ts'

describe('FalFluxImageProvider', () => {
    it('sends the validated FLUX.2 Klein 9B edit request and returns provider metadata', async () => {
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ request_id: 'fal-request-1', seed: 77, images: [{ url: 'https://cdn.example/result.png' }] }), { headers: { 'x-fal-request-id': 'fallback-id' } }))
            .mockResolvedValueOnce(new Response(createTestPng({ width: 768, height: 1152 })))
        const provider = new FalFluxImageProvider({ apiKey: 'test-fal-key', model: FAL_FLUX_MODEL, estimatedCostUsd: 0.0203, fetchImplementation, now: (() => { const ticks = [10, 22]; return () => ticks.shift() ?? 22 })() })

        const result = await provider.transform({ prompt: 'SERVER FLUX PROMPT', sourcePng: createTestPng() })
        const [url, init] = fetchImplementation.mock.calls[0]!
        const request = JSON.parse(String(init.body))
        expect(url).toBe('https://fal.run/fal-ai/flux-2-klein/9b/edit')
        expect(init.headers).toEqual({ Authorization: 'Key test-fal-key', 'Content-Type': 'application/json' })
        expect(request).toMatchObject({ prompt: 'SERVER FLUX PROMPT', image_size: { width: 768, height: 1152 }, output_format: 'png', num_images: 1, num_inference_steps: 4 })
        expect(request.image_urls[0]).toMatch(/^data:image\/png;base64,/)
        expect(result).toMatchObject({ provider: 'fal.ai', model: 'fal-ai/flux-2-klein/9b/edit', providerRequestId: 'fal-request-1', seed: 77, latencyMs: 12, estimatedCostUsd: 0.0203 })
        expect(JSON.stringify(result)).not.toContain('test-fal-key')
    })

    it('maps timeout, rate limit and malformed result responses', async () => {
        const timeout = new FalFluxImageProvider({ apiKey: 'key', timeoutMs: 1, fetchImplementation: async (_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) })
        await expect(timeout.transform({ prompt: 'p', sourcePng: createTestPng() })).rejects.toMatchObject({ code: 'FAL_FLUX_TIMEOUT' })

        const rateLimit = new FalFluxImageProvider({ apiKey: 'key', fetchImplementation: async () => new Response(JSON.stringify({ error: { code: 'rate_limit' } }), { status: 429 }) })
        await expect(rateLimit.transform({ prompt: 'p', sourcePng: createTestPng() })).rejects.toMatchObject({ code: 'FAL_FLUX_RATE_LIMITED', providerErrorCode: 'rate_limit' })

        const invalid = new FalFluxImageProvider({ apiKey: 'key', fetchImplementation: async () => new Response(JSON.stringify({ images: [] })) })
        await expect(invalid.transform({ prompt: 'p', sourcePng: createTestPng() })).rejects.toMatchObject({ code: 'FAL_FLUX_RESPONSE_INVALID' })
    })

    it('uses the Seedream 4.5 edit schema without FLUX-only parameters', async () => {
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ request_id: 'seedream-request', images: [{ url: 'https://cdn.example/seedream.png' }] })))
            .mockResolvedValueOnce(new Response(createTestPng({ width: 1920, height: 2880 })))
        const provider = new FalFluxImageProvider({ apiKey: 'test-fal-key', model: FAL_SEEDREAM_MODEL, fetchImplementation })

        const result = await provider.transform({ prompt: 'SERVER EVOLUTION PROMPT', sourcePng: createTestPng(), seed: 42 })
        const [url, init] = fetchImplementation.mock.calls[0]!
        const request = JSON.parse(String(init.body))

        expect(url).toBe('https://fal.run/fal-ai/bytedance/seedream/v4.5/edit')
        expect(request).toMatchObject({
            prompt: 'SERVER EVOLUTION PROMPT', image_size: { width: 1920, height: 2880 },
            output_format: 'png', num_images: 1, max_images: 1, enable_safety_checker: true, seed: 42,
        })
        expect(request.image_urls[0]).toMatch(/^data:image\/png;base64,/)
        expect(request).not.toHaveProperty('num_inference_steps')
        expect(result).toMatchObject({ provider: 'fal.ai', model: FAL_SEEDREAM_MODEL, providerRequestId: 'seedream-request' })
    })

    it('rejects a Seedream JPEG response before PNG validation', async () => {
        const fetchImplementation = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
            images: [{
                url: 'https://v3b.fal.media/files/result.jpg', content_type: 'image/jpeg',
                file_name: 'result.jpg', file_size: 1228881, width: null, height: null,
            }],
        })))
        const provider = new FalFluxImageProvider({ apiKey: 'test-fal-key', model: FAL_SEEDREAM_MODEL, fetchImplementation })

        await expect(provider.transform({ prompt: 'SERVER EVOLUTION PROMPT', sourcePng: createTestPng() }))
            .rejects.toMatchObject({ code: 'FAL_FLUX_RESPONSE_INVALID', message: 'fal.ai ha restituito image/jpeg invece del PNG richiesto.' })
        expect(fetchImplementation).toHaveBeenCalledTimes(1)
    })
})
