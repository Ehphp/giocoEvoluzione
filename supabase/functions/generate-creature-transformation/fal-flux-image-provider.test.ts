import { describe, expect, it, vi } from 'vitest'

import { createTestPng } from '../../../shared/creature-transformations/image-test-fixtures.ts'
import { FAL_SEEDREAM_MODEL, FalFluxImageProvider, parseFalWebhookEvent } from './fal-flux-image-provider.ts'

describe('FalFluxImageProvider', () => {
    it('submits to the durable Queue endpoint and returns request_id without downloading output media', async () => {
        const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({ request_id: 'queue-request-1', status_url: 'https://queue.fal.run/status' })))
        const provider = new FalFluxImageProvider({ apiKey: 'test-fal-key', fetchImplementation })

        const result = await provider.submitFlux({
            prompt: 'SERVER FLUX PROMPT',
            sourceUrl: 'https://storage.example/source.png?token=private',
            webhookUrl: 'https://project.supabase.co/functions/v1/fal-creature-transformation-webhook',
        })

        const [url, init] = fetchImplementation.mock.calls[0]!
        expect(url).toBe('https://queue.fal.run/fal-ai/flux-2-klein/9b/edit?fal_webhook=https%3A%2F%2Fproject.supabase.co%2Ffunctions%2Fv1%2Ffal-creature-transformation-webhook')
        expect(JSON.parse(String(init.body))).toMatchObject({ prompt: 'SERVER FLUX PROMPT', image_urls: ['https://storage.example/source.png?token=private'], output_format: 'png' })
        expect(fetchImplementation).toHaveBeenCalledTimes(1)
        expect(result).toMatchObject({ provider: 'fal.ai', providerRequestId: 'queue-request-1' })
    })

    it('parses only completed Fal webhook payloads with a safe result URL', () => {
        expect(parseFalWebhookEvent({ request_id: 'queue-request-1', status: 'OK', payload: { seed: 7, images: [{ url: 'https://fal.media/result.png', content_type: 'image/png' }] } }))
            .toEqual({ providerRequestId: 'queue-request-1', status: 'OK', errorMessage: null, image: { url: 'https://fal.media/result.png', contentType: 'image/png' }, seed: 7 })
        expect(parseFalWebhookEvent({ request_id: 'queue-request-1', status: 'ERROR', error: 'runner failed', payload: null }))
            .toMatchObject({ status: 'ERROR', image: null, errorMessage: 'runner failed' })
        expect(parseFalWebhookEvent({ request_id: 'queue-request-1', status: 'OK', payload: { images: [{ url: 'data:image/png;base64,aGVsbG8=' }] } }))
            .toMatchObject({ status: 'OK', image: null })
    })

    it('rejects an oversized queued result before buffering it in the finalizer', async () => {
        const fetchImplementation = vi.fn(async () => new Response(createTestPng(), { headers: { 'content-length': String(10 * 1024 * 1024 + 1) } }))
        const provider = new FalFluxImageProvider({ apiKey: 'test-fal-key', fetchImplementation })

        await expect(provider.downloadQueuedImage({ url: 'https://fal.media/oversized.png', contentType: 'image/png' }))
            .rejects.toMatchObject({ code: 'FAL_FLUX_RESPONSE_INVALID' })
    })

    it('sends the validated FLUX.2 Klein 9B edit request and returns provider metadata', async () => {
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ request_id: 'fal-request-1', seed: 77, images: [{ url: 'https://cdn.example/result.png' }] }), { headers: { 'x-fal-request-id': 'fallback-id' } }))
            .mockResolvedValueOnce(new Response(createTestPng({ width: 768, height: 1152 })))
        const provider = new FalFluxImageProvider({ apiKey: 'test-fal-key', estimatedCostUsd: 0.0203, fetchImplementation, now: (() => { const ticks = [10, 22]; return () => ticks.shift() ?? 22 })() })

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
            num_images: 1, max_images: 1, enable_safety_checker: true, seed: 42,
        })
        expect(request.image_urls[0]).toMatch(/^data:image\/png;base64,/)
        expect(request).not.toHaveProperty('num_inference_steps')
        expect(result).toMatchObject({ provider: 'fal.ai', model: FAL_SEEDREAM_MODEL, providerRequestId: 'seedream-request' })
    })

    it('converts the JPEG returned by Seedream before PNG validation', async () => {
        const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
        const png = createTestPng({ width: 1920, height: 2880 })
        const convertJpegToPng = vi.fn(async () => png)
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                images: [{
                    url: 'https://v3b.fal.media/files/result.jpg', content_type: 'image/jpeg',
                    file_name: 'result.jpg', file_size: 1228881, width: null, height: null,
                }],
            })))
            .mockResolvedValueOnce(new Response(jpeg))
        const provider = new FalFluxImageProvider({ apiKey: 'test-fal-key', model: FAL_SEEDREAM_MODEL, convertJpegToPng, fetchImplementation })

        const result = await provider.transform({ prompt: 'SERVER EVOLUTION PROMPT', sourcePng: createTestPng() })

        expect(convertJpegToPng).toHaveBeenCalledWith(jpeg)
        expect(result.image).toEqual(png)
    })

    it('preserves actual diagnostic source MIME and sends only the current Seedream schema', async () => {
        const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
        const png = createTestPng({ width: 1920, height: 2880 })
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ request_id: 'seedream-jpeg', images: [{ url: 'https://cdn.example/seedream.jpg', content_type: 'image/jpeg' }] })))
            .mockResolvedValueOnce(new Response(jpeg))
        const provider = new FalFluxImageProvider({
            apiKey: 'test-fal-key',
            model: FAL_SEEDREAM_MODEL,
            convertJpegToPng: async () => png,
            fetchImplementation,
        })

        const result = await provider.transformSeedreamDiagnostic({
            prompt: 'EXACT PLAYGROUND PROMPT',
            source: { bytes: jpeg, mimeType: 'image/jpeg' },
            parameters: { imageSize: 'auto_4K', numImages: 1, maxImages: 1, seed: 42, syncMode: false, enableSafetyChecker: true },
        })
        const request = JSON.parse(String(fetchImplementation.mock.calls[0]![1].body))

        expect(request.image_urls).toHaveLength(1)
        expect(request.image_urls[0]).toMatch(/^data:image\/jpeg;base64,/)
        expect(Object.keys(request).sort()).toEqual(['enable_safety_checker', 'image_size', 'image_urls', 'max_images', 'num_images', 'prompt', 'seed', 'sync_mode'])
        expect(request).not.toHaveProperty('output_format')
        expect(result).toMatchObject({ providerOutputMimeType: 'image/jpeg', storedResultMimeType: 'image/png', model: FAL_SEEDREAM_MODEL })
        expect(result.rawProviderImage).toEqual(jpeg)
        expect(result.image).toEqual(png)

        const wrongModel = new FalFluxImageProvider({ apiKey: 'test-fal-key', model: 'fal-ai/flux-2-klein/9b/edit' })
        await expect(wrongModel.transformSeedreamDiagnostic({ prompt: 'p', source: { bytes: png, mimeType: 'image/png' }, parameters: { imageSize: 'auto_4K' } }))
            .rejects.toMatchObject({ code: 'FAL_SEEDREAM_MODEL_REQUIRED' })
    })

    it('reports a specific error when Seedream JPEG conversion fails', async () => {
        const fetchImplementation = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ images: [{ url: 'https://v3b.fal.media/files/result.jpg', content_type: 'image/jpeg' }] })))
            .mockResolvedValueOnce(new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])))
        const provider = new FalFluxImageProvider({
            apiKey: 'test-fal-key', model: FAL_SEEDREAM_MODEL, fetchImplementation,
            convertJpegToPng: async () => { throw new Error('decode failed') },
        })

        await expect(provider.transform({ prompt: 'SERVER EVOLUTION PROMPT', sourcePng: createTestPng() }))
            .rejects.toMatchObject({ code: 'FAL_FLUX_RESPONSE_INVALID', message: 'La conversione JPEG di Seedream in PNG non e riuscita.' })
    })
})
