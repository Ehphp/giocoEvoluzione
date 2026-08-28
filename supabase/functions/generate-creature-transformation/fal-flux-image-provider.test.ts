import { describe, expect, it, vi } from 'vitest'

import { createTestPng } from '../../../shared/creature-transformations/image-test-fixtures.ts'
import { FAL_SEEDREAM_MODEL, FalFluxImageProvider, parseFalWebhookEvent } from './fal-flux-image-provider.ts'

/**
 * The provider only ever submits to Fal Queue and later downloads the callback result: there is no
 * synchronous generation path, so a submission must return before inference and never buffer media.
 */
describe('FalFluxImageProvider', () => {
    it('parses only completed Fal webhook payloads with a safe result URL', () => {
        expect(
            parseFalWebhookEvent({
                request_id: 'queue-request-1',
                status: 'OK',
                payload: { seed: 7, images: [{ url: 'https://fal.media/result.png', content_type: 'image/png' }] },
            }),
        ).toEqual({
            providerRequestId: 'queue-request-1',
            status: 'OK',
            errorMessage: null,
            image: { url: 'https://fal.media/result.png', contentType: 'image/png' },
            seed: 7,
        })
        expect(
            parseFalWebhookEvent({
                request_id: 'queue-request-1',
                status: 'ERROR',
                error: 'runner failed',
                payload: null,
            }),
        ).toMatchObject({ status: 'ERROR', image: null, errorMessage: 'runner failed' })
        expect(
            parseFalWebhookEvent({
                request_id: 'queue-request-1',
                status: 'OK',
                payload: { images: [{ url: 'data:image/png;base64,aGVsbG8=' }] },
            }),
        ).toMatchObject({ status: 'OK', image: null })
    })

    it('submits the locked Seedream production payload through Queue without downloading output media', async () => {
        const fetchImplementation = vi.fn(
            async () => new Response(JSON.stringify({ request_id: 'seedream-queue-request' })),
        )
        const provider = new FalFluxImageProvider({
            apiKey: 'test-fal-key',
            model: FAL_SEEDREAM_MODEL,
            fetchImplementation,
        })

        await expect(
            provider.submitSeedreamEvolution({
                prompt: 'LOCKED SEEDREAM PROMPT',
                sourceUrl: 'https://storage.example/source.png?token=private',
                imageSize: { width: 1920, height: 2880 },
                webhookUrl: 'https://project.supabase.co/functions/v1/fal-creature-transformation-webhook',
            }),
        ).resolves.toMatchObject({ providerRequestId: 'seedream-queue-request', model: FAL_SEEDREAM_MODEL })

        const [url, init] = fetchImplementation.mock.calls[0]!
        expect(url).toContain('https://queue.fal.run/fal-ai/bytedance/seedream/v4.5/edit?fal_webhook=')
        expect(JSON.parse(String(init.body))).toEqual({
            prompt: 'LOCKED SEEDREAM PROMPT',
            image_urls: ['https://storage.example/source.png?token=private'],
            image_size: { width: 1920, height: 2880 },
            num_images: 1,
            max_images: 1,
            enable_safety_checker: true,
        })
        expect(fetchImplementation).toHaveBeenCalledTimes(1)
    })

    it('refuses to submit an evolution on any model other than the pinned Seedream edit model', async () => {
        const provider = new FalFluxImageProvider({ apiKey: 'test-fal-key', model: 'fal-ai/flux-2-klein/9b/edit' })

        await expect(
            provider.submitSeedreamEvolution({
                prompt: 'LOCKED SEEDREAM PROMPT',
                sourceUrl: 'https://storage.example/source.png',
                imageSize: { width: 1920, height: 2880 },
                webhookUrl: 'https://project.supabase.co/functions/v1/fal-creature-transformation-webhook',
            }),
        ).rejects.toMatchObject({ code: 'FAL_SEEDREAM_MODEL_REQUIRED' })
    })

    it('recovers one completed Queue output without creating another Seedream submission', async () => {
        const fetchImplementation = vi.fn(
            async () =>
                new Response(
                    JSON.stringify({
                        items: [
                            {
                                json_output: {
                                    images: [
                                        {
                                            url: 'https://fal.media/recovered-seedream.png',
                                            content_type: 'image/png',
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                ),
        )
        const provider = new FalFluxImageProvider({
            apiKey: 'test-fal-key',
            model: FAL_SEEDREAM_MODEL,
            fetchImplementation,
        })

        await expect(provider.recoverQueuedImage({ providerRequestId: 'already-completed-request' })).resolves.toEqual({
            url: 'https://fal.media/recovered-seedream.png',
            contentType: 'image/png',
        })

        const [url, init] = fetchImplementation.mock.calls[0]!
        expect(url).toBe(
            'https://api.fal.ai/v1/models/requests/by-endpoint?endpoint_id=fal-ai%2Fbytedance%2Fseedream%2Fv4.5%2Fedit&request_id=already-completed-request&expand=payloads',
        )
        expect(init.method).toBeUndefined()
        expect(init.body).toBeUndefined()
        expect(fetchImplementation).toHaveBeenCalledTimes(1)
    })

    it('rejects an oversized queued result before buffering it in the finalizer', async () => {
        const fetchImplementation = vi.fn(
            async () => new Response(createTestPng(), { headers: { 'content-length': String(40 * 1024 * 1024) } }),
        )
        const provider = new FalFluxImageProvider({
            apiKey: 'test-fal-key',
            model: FAL_SEEDREAM_MODEL,
            fetchImplementation,
        })

        await expect(
            provider.downloadQueuedImage({ url: 'https://fal.media/oversized.png', contentType: 'image/png' }),
        ).rejects.toMatchObject({ code: 'FAL_FLUX_RESPONSE_INVALID' })
    })

    it('converts the JPEG Seedream returns before PNG validation, and leaves a PNG untouched', async () => {
        const jpeg = new Uint8Array([
            0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x00, 0x04, 0x00, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01,
            0x03, 0x11, 0x01,
        ])
        const png = createTestPng({ width: 1920, height: 2880 })
        const convertJpegToPng = vi.fn(async () => png)
        const provider = new FalFluxImageProvider({
            apiKey: 'test-fal-key',
            model: FAL_SEEDREAM_MODEL,
            convertJpegToPng,
        })

        expect(await provider.normalizeQueuedImage({ bytes: jpeg, mimeType: 'image/jpeg' })).toEqual(png)
        expect(convertJpegToPng).toHaveBeenCalledWith(jpeg)
        expect(await provider.normalizeQueuedImage({ bytes: png, mimeType: 'image/png' })).toEqual(png)
        expect(convertJpegToPng).toHaveBeenCalledTimes(1)
    })

    it('reports a specific error when Seedream JPEG conversion is missing or fails', async () => {
        const jpeg = new Uint8Array([
            0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x00, 0x04, 0x00, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01,
            0x03, 0x11, 0x01,
        ])

        await expect(
            new FalFluxImageProvider({ apiKey: 'test-fal-key', model: FAL_SEEDREAM_MODEL }).normalizeQueuedImage({
                bytes: jpeg,
                mimeType: 'image/jpeg',
            }),
        ).rejects.toMatchObject({ code: 'FAL_FLUX_RESPONSE_INVALID' })

        await expect(
            new FalFluxImageProvider({
                apiKey: 'test-fal-key',
                model: FAL_SEEDREAM_MODEL,
                convertJpegToPng: async () => {
                    throw new Error('decode failed')
                },
            }).normalizeQueuedImage({ bytes: jpeg, mimeType: 'image/jpeg' }),
        ).rejects.toMatchObject({
            code: 'FAL_FLUX_RESPONSE_INVALID',
            message: expect.stringContaining('La conversione JPEG di Seedream in PNG non e riuscita.'),
        })
    })
})
