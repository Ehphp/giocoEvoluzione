import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('creature visual URL cache persistence', () => {
    /*
     * jsdom here provides no `localStorage`, so the test installs one. What is under test is the
     * module's use of the Storage API across a reload, not jsdom's implementation of it.
     */
    function installStorage(onSetItem?: () => void) {
        const entries = new Map<string, string>()
        const fake = {
            getItem: (key: string) => entries.get(key) ?? null,
            setItem: (key: string, value: string) => { onSetItem?.(); entries.set(key, value) },
            removeItem: (key: string) => { entries.delete(key) },
            clear: () => entries.clear(),
            key: (index: number) => [...entries.keys()][index] ?? null,
            get length() { return entries.size },
        } as Storage

        Object.defineProperty(window, 'localStorage', { value: fake, configurable: true, writable: true })

        return entries
    }

    /** A reload keeps `localStorage` and loses the module, which is what this reproduces. */
    async function reloadModule() {
        vi.resetModules()

        return import('./creature-visual-url-cache.ts')
    }

    beforeEach(() => { installStorage() })
    afterEach(() => {
        clearCreatureVisualUrlCache()
        Reflect.deleteProperty(window, 'localStorage')
    })

    it('reuses the URL minted before a reload, so the artwork is not fetched again', async () => {
        const now = Date.parse('2026-08-29T10:00:00.000Z')
        reuseCreatureVisualUrl(
            { versionId: 'visual-1', signedUrl: 'https://signed.example/before', expiresAt: '2026-08-29T22:00:00.000Z' },
            now,
        )

        const reloaded = await reloadModule()
        const after = reloaded.reuseCreatureVisualUrl(
            { versionId: 'visual-1', signedUrl: 'https://signed.example/after', expiresAt: '2026-08-29T23:00:00.000Z' },
            now + 60_000,
        )

        expect(after.signedUrl).toBe('https://signed.example/before')
    })

    it('does not carry an expired URL across a reload', async () => {
        const now = Date.parse('2026-08-29T10:00:00.000Z')
        reuseCreatureVisualUrl(
            { versionId: 'visual-1', signedUrl: 'https://signed.example/stale', expiresAt: '2026-08-29T10:00:10.000Z' },
            now,
        )

        const reloaded = await reloadModule()
        const after = reloaded.reuseCreatureVisualUrl(
            { versionId: 'visual-1', signedUrl: 'https://signed.example/fresh', expiresAt: '2026-08-29T22:00:00.000Z' },
            now + 60_000,
        )

        expect(after.signedUrl).toBe('https://signed.example/fresh')
    })

    it('persists the whole history, not just the last entry written', async () => {
        const now = Date.parse('2026-08-29T10:00:00.000Z')
        const history = (suffix: string) =>
            [1, 2, 3].map((number) => ({
                id: `visual-${number}`,
                signedUrl: `https://signed.example/${number}-${suffix}`,
                expiresAt: '2026-08-29T22:00:00.000Z',
            }))

        reuseCreatureVisualHistoryUrls(history('first'), now)

        const reloaded = await reloadModule()
        const after = reloaded.reuseCreatureVisualHistoryUrls(history('second'), now + 60_000)

        expect(after.map((entry) => entry.signedUrl)).toEqual([
            'https://signed.example/1-first',
            'https://signed.example/2-first',
            'https://signed.example/3-first',
        ])
    })

    it('writes once for a whole history rather than once per entry', () => {
        const now = Date.parse('2026-08-29T10:00:00.000Z')
        let writes = 0
        installStorage(() => { writes += 1 })

        reuseCreatureVisualHistoryUrls(
            [1, 2, 3, 4, 5].map((number) => ({
                id: `visual-${number}`,
                signedUrl: `https://signed.example/${number}`,
                expiresAt: '2026-08-29T22:00:00.000Z',
            })),
            now,
        )

        expect(writes).toBe(1)
    })

    it('signing out leaves nothing for the next account to reuse', async () => {
        const now = Date.parse('2026-08-29T10:00:00.000Z')
        reuseCreatureVisualUrl(
            { versionId: 'visual-1', signedUrl: 'https://signed.example/previous-account', expiresAt: '2026-08-29T22:00:00.000Z' },
            now,
        )
        clearCreatureVisualUrlCache()

        const reloaded = await reloadModule()
        const after = reloaded.reuseCreatureVisualUrl(
            { versionId: 'visual-1', signedUrl: 'https://signed.example/next-account', expiresAt: '2026-08-29T23:00:00.000Z' },
            now + 60_000,
        )

        expect(after.signedUrl).toBe('https://signed.example/next-account')
    })

    it('still hands back a stable URL when storage refuses the write', () => {
        const now = Date.parse('2026-08-29T10:00:00.000Z')
        installStorage(() => { throw new Error('QuotaExceededError') })

        const first = reuseCreatureVisualUrl(
            { versionId: 'visual-1', signedUrl: 'https://signed.example/first', expiresAt: '2026-08-29T22:00:00.000Z' },
            now,
        )
        const second = reuseCreatureVisualUrl(
            { versionId: 'visual-1', signedUrl: 'https://signed.example/second', expiresAt: '2026-08-29T23:00:00.000Z' },
            now + 1_000,
        )

        expect(first.signedUrl).toBe('https://signed.example/first')
        expect(second.signedUrl).toBe('https://signed.example/first')
    })
})
