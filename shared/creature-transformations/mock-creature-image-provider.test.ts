import { describe, expect, it, vi } from 'vitest'

import { CURRENT_CREATURE_RENDER_SPECIFICATION } from './render-specifications.ts'
import { createTestPng } from './image-test-fixtures.ts'
import { MockCreatureImageProvider } from './mock-creature-image-provider.ts'

function input() {
    const bytes = createTestPng()
    return {
        requestId: 'request-1',
        idempotencyKey: 'key-1',
        prompt: 'server-side prompt',
        source: { bytes, mimeType: 'image/png' as const, width: 1024, height: 1536, sha256: 'source-hash' },
        renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
    }
}

describe('MockCreatureImageProvider', () => {
    it('copies source bytes with explicit mock metadata, zero cost and warning', async () => {
        const ticks = [10, 34]
        const request = input()
        const result = await new MockCreatureImageProvider({ now: () => ticks.shift() ?? 34 }).transformCreature(request)

        expect(result.image).toEqual(request.source.bytes)
        expect(result.image).not.toBe(request.source.bytes)
        expect(result).toMatchObject({
            mimeType: 'image/png', provider: 'mock-creature-image-provider', model: 'source-byte-copy-v1',
            isMock: true, latencyMs: 24, estimatedCostUsd: 0,
            warnings: ['MOCK_PROVIDER_NO_VISUAL_TRANSFORMATION'],
        })
    })

    it('supports deterministic delay, failure, timeout and intentionally invalid outputs', async () => {
        const sleep = vi.fn(async () => undefined)
        await new MockCreatureImageProvider({ delayMs: 25, sleep }).transformCreature(input())
        expect(sleep).toHaveBeenCalledWith(25)

        await expect(new MockCreatureImageProvider({ behavior: 'FAILURE' }).transformCreature(input())).rejects.toMatchObject({ code: 'MOCK_PROVIDER_FAILED' })
        await expect(new MockCreatureImageProvider({ behavior: 'TIMEOUT' }).transformCreature(input())).rejects.toMatchObject({ code: 'IMAGE_PROVIDER_TIMEOUT' })
        await expect(new MockCreatureImageProvider({ behavior: 'EMPTY_OUTPUT' }).transformCreature(input())).resolves.toMatchObject({ image: new Uint8Array() })
        await expect(new MockCreatureImageProvider({ behavior: 'INVALID_PNG_OUTPUT' }).transformCreature(input())).resolves.toMatchObject({ image: new Uint8Array([0, 1, 2, 3]) })
    })
})
