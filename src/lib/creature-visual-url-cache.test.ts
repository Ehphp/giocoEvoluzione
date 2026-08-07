import { afterEach, describe, expect, it } from 'vitest'

import { clearCreatureVisualUrlCache, reuseCreatureVisualUrl } from './creature-visual-url-cache.ts'

afterEach(clearCreatureVisualUrlCache)

describe('creature visual URL cache', () => {
    it('reuses a valid signed URL for the same visual version', () => {
        const now = Date.parse('2026-08-07T10:00:00.000Z')
        const first = reuseCreatureVisualUrl({ versionId: 'visual-1', signedUrl: 'https://signed.example/first', expiresAt: '2026-08-07T10:10:00.000Z' }, now)
        const second = reuseCreatureVisualUrl({ versionId: 'visual-1', signedUrl: 'https://signed.example/second', expiresAt: '2026-08-07T10:20:00.000Z' }, now + 1_000)

        expect(first.signedUrl).toBe('https://signed.example/first')
        expect(second).toMatchObject({ signedUrl: 'https://signed.example/first', expiresAt: '2026-08-07T10:10:00.000Z' })
    })

    it('replaces an expired cached URL with the newly resolved URL', () => {
        const now = Date.parse('2026-08-07T10:00:00.000Z')
        reuseCreatureVisualUrl({ versionId: 'visual-1', signedUrl: 'https://signed.example/expired', expiresAt: '2026-08-07T10:00:15.000Z' }, now)
        const renewed = reuseCreatureVisualUrl({ versionId: 'visual-1', signedUrl: 'https://signed.example/renewed', expiresAt: '2026-08-07T10:10:00.000Z' }, now)

        expect(renewed.signedUrl).toBe('https://signed.example/renewed')
    })
})