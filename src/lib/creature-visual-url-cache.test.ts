import { afterEach, describe, expect, it } from 'vitest'

import { clearCreatureVisualUrlCache, reuseCreatureVisualHistoryUrls, reuseCreatureVisualUrl } from './creature-visual-url-cache.ts'

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
describe('creature visual history URLs', () => {
    it('keeps every history entry on the URL first seen for it', () => {
        const now = Date.parse('2026-08-07T10:00:00.000Z')
        const history = (suffix: string) =>
            [1, 2, 3].map((number) => ({
                id: `visual-${number}`,
                signedUrl: `https://signed.example/${number}-${suffix}`,
                expiresAt: '2026-08-07T10:10:00.000Z',
            }))

        const first = reuseCreatureVisualHistoryUrls(history('a'), now)
        const second = reuseCreatureVisualHistoryUrls(history('b'), now + 1_000)

        expect(first.map((entry) => entry.signedUrl)).toEqual(second.map((entry) => entry.signedUrl))
    })

    it('shares its cache with the current visual, so one version has one URL everywhere', () => {
        const now = Date.parse('2026-08-07T10:00:00.000Z')
        reuseCreatureVisualUrl(
            { versionId: 'visual-9', signedUrl: 'https://signed.example/current', expiresAt: '2026-08-07T10:10:00.000Z' },
            now,
        )

        const [entry] = reuseCreatureVisualHistoryUrls(
            [{ id: 'visual-9', signedUrl: 'https://signed.example/history', expiresAt: '2026-08-07T10:20:00.000Z' }],
            now + 1_000,
        )

        expect(entry!.signedUrl).toBe('https://signed.example/current')
    })

    it('renews a history entry whose cached URL is about to expire', () => {
        const now = Date.parse('2026-08-07T10:00:00.000Z')
        reuseCreatureVisualHistoryUrls(
            [{ id: 'visual-1', signedUrl: 'https://signed.example/stale', expiresAt: '2026-08-07T10:00:15.000Z' }],
            now,
        )

        const [entry] = reuseCreatureVisualHistoryUrls(
            [{ id: 'visual-1', signedUrl: 'https://signed.example/fresh', expiresAt: '2026-08-07T10:10:00.000Z' }],
            now,
        )

        expect(entry!.signedUrl).toBe('https://signed.example/fresh')
    })
})
