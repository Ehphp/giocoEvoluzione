import { describe, expect, it, vi } from 'vitest'

import {
    GeminiRelativeHeightComparisonService,
    readGeminiRelativeHeightComparisonConfiguration,
    type GeminiRelativeHeightComparisonConfiguration,
} from './gemini-relative-height-comparison-service.ts'

const configuration: GeminiRelativeHeightComparisonConfiguration = Object.freeze({
    enabled: true,
    apiKey: 'test-key',
    model: 'gemini-3.1-flash-lite',
    timeoutMs: 100,
})

function generated(value: unknown): Response {
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }), {
        status: 200,
    })
}

function fetchFor(input: { comparison?: unknown; hang?: boolean; onComparison?: (body: Record<string, unknown>) => void }) {
    let uploaded = 0
    return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const href = String(url)
        if (href.endsWith('/upload/v1beta/files')) {
            uploaded += 1
            return new Response('', {
                status: 200,
                headers: { 'x-goog-upload-url': `https://upload.example.test/session-${uploaded}` },
            })
        }
        if (href.startsWith('https://upload.example.test/session-')) {
            const index = href.at(-1)
            return new Response(
                JSON.stringify({
                    file: { name: `files/${index}`, uri: `gemini://files/${index}`, mimeType: 'image/png' },
                }),
                { status: 200 },
            )
        }
        if (href.includes(':generateContent')) {
            const body = JSON.parse(String(init?.body)) as Record<string, unknown>
            input.onComparison?.(body)
            if (input.hang) {
                return await new Promise<Response>((_resolve, reject) =>
                    init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
                )
            }
            return generated(input.comparison)
        }
        if (init?.method === 'DELETE') return new Response('', { status: 200 })
        throw new Error(`Unexpected Gemini request: ${href}`)
    }) as unknown as typeof fetch
}

describe('GeminiRelativeHeightComparisonService', () => {
    it('has an independent configuration and conservative timeout default', () => {
        const loaded = readGeminiRelativeHeightComparisonConfiguration((name) =>
            ({ GEMINI_API_KEY: 'key', CREATURE_VISION_MODEL: 'shared-model' })[name],
        )
        expect(loaded.model).toBe('shared-model')
        expect(loaded.timeoutMs).toBe(4_000)
    })

    it('compares both images with a dedicated prompt and structured response', async () => {
        let body: Record<string, unknown> | undefined
        const result = await new GeminiRelativeHeightComparisonService(
            configuration,
            fetchFor({
                comparison: {
                    status: 'COMPLETE',
                    change: 'TALLER',
                    confidence: 0.8,
                    confounders: ['LARGE_APPENDAGES'],
                    shortReason: 'The bearing body is taller.',
                    proportionFindings: [
                        {
                            region: 'TRUNK',
                            change: 'INTRODUCED',
                            authorization: 'AUTHORIZED',
                            confidence: 0.94,
                            reason: 'The trunk is longer as requested.',
                        },
                        {
                            region: 'NECK',
                            change: 'INTRODUCED',
                            authorization: 'UNAUTHORIZED',
                            confidence: 0.9,
                            reason: 'The neck is longer than the target permits.',
                        },
                        {
                            region: 'HEAD',
                            change: 'PREEXISTING',
                            authorization: 'NOT_APPLICABLE',
                            confidence: 0.92,
                            reason: 'The head was already oversized in the source.',
                        },
                    ],
                },
                onComparison: (nextBody) => {
                    body = nextBody
                },
            }),
        ).compare({
            sourceImage: new Uint8Array([1]),
            sourceMimeType: 'image/png',
            resultImage: new Uint8Array([2]),
            resultMimeType: 'image/png',
            sourceVersionId: 'version-1',
            sourceHeightMeters: 1.4,
            proportionContext: {
                evolutionTargetId: 'BODY_SHAPE',
                microConceptSummary: 'Elongated Trunk. Increase trunk length by about 30%.',
            },
        })

        expect(result).toEqual({
            status: 'COMPLETE',
            change: 'TALLER',
            confidence: 0.8,
            confounders: ['LARGE_APPENDAGES'],
            shortReason: 'The bearing body is taller.',
            proportionFindings: [
                {
                    region: 'TRUNK',
                    change: 'INTRODUCED',
                    authorization: 'AUTHORIZED',
                    confidence: 0.94,
                    reason: 'The trunk is longer as requested.',
                },
                {
                    region: 'NECK',
                    change: 'INTRODUCED',
                    authorization: 'UNAUTHORIZED',
                    confidence: 0.9,
                    reason: 'The neck is longer than the target permits.',
                },
                {
                    region: 'HEAD',
                    change: 'PREEXISTING',
                    authorization: 'NOT_APPLICABLE',
                    confidence: 0.92,
                    reason: 'The head was already oversized in the source.',
                },
            ],
        })
        const parts = (body!.contents as Array<{ parts: Array<{ text?: string; file_data?: { file_uri?: string } }> }>)[0]
            .parts
        expect(parts[0]?.text).toContain('first image is SOURCE')
        expect(parts[0]?.text).toContain('Do not estimate absolute metres')
        expect(parts[0]?.text).toContain('quadruped-to-biped or biped-to-quadruped locomotion transition')
        expect(parts[0]?.text).toContain('not by itself a pose confounder')
        expect(parts[0]?.text).toContain('Selected target: BODY_SHAPE')
        expect(parts[0]?.text).toContain('Increase trunk length by about 30%')
        expect(parts[0]?.text).toContain('at most four proportionFindings')
        expect(parts[1]?.file_data?.file_uri).toBe('gemini://files/1')
        expect(parts[2]?.file_data?.file_uri).toBe('gemini://files/2')
    })

    it('fails open for malformed provider output and timeouts', async () => {
        await expect(
            new GeminiRelativeHeightComparisonService(
                configuration,
                fetchFor({ comparison: { status: 'COMPLETE' } }),
            ).compare({
                sourceImage: new Uint8Array([1]),
                sourceMimeType: 'image/png',
                resultImage: new Uint8Array([2]),
                resultMimeType: 'image/png',
                sourceVersionId: 'version-1',
                sourceHeightMeters: 1.4,
            }),
        ).resolves.toMatchObject({ status: 'UNAVAILABLE', change: 'UNCHANGED' })

        await expect(
            new GeminiRelativeHeightComparisonService(
                { ...configuration, timeoutMs: 1 },
                fetchFor({ hang: true }),
            ).compare({
                sourceImage: new Uint8Array([1]),
                sourceMimeType: 'image/png',
                resultImage: new Uint8Array([2]),
                resultMimeType: 'image/png',
                sourceVersionId: 'version-1',
                sourceHeightMeters: 1.4,
            }),
        ).resolves.toMatchObject({ status: 'UNAVAILABLE', change: 'UNCHANGED' })
    })
})
