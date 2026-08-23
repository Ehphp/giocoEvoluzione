type SignedUrl = Readonly<{
    signedUrl: string
    expiresAt: string
}>

/**
 * Keeps one signed URL per visual version for as long as it is valid.
 *
 * The server mints a fresh signature on every read, and a new URL string is a new browser cache
 * entry — so re-signing the same object makes the client re-download artwork it already holds.
 * Every profile refresh re-reads the whole history, and there are seven ways to trigger one, which
 * is how a handful of creatures turned into gigabytes of Storage egress.
 *
 * Returning the previously seen URL costs a slightly shorter remaining validity and buys the HTTP
 * cache a stable key.
 */
const MINIMUM_VALIDITY_MS = 30_000
const urlsByVisualVersion = new Map<string, SignedUrl>()

function stableSignedUrl<T extends SignedUrl>(key: string, visual: T, now: number): T {
    const cached = urlsByVisualVersion.get(key)
    if (cached && Date.parse(cached.expiresAt) - now > MINIMUM_VALIDITY_MS) {
        return { ...visual, signedUrl: cached.signedUrl, expiresAt: cached.expiresAt }
    }
    urlsByVisualVersion.set(key, { signedUrl: visual.signedUrl, expiresAt: visual.expiresAt })
    return visual
}

export function reuseCreatureVisualUrl<T extends SignedUrl & { versionId: string }>(visual: T, now = Date.now()): T {
    return stableSignedUrl(visual.versionId, visual, now)
}

/** The history identifies a version by `id`; the current visual calls the same thing `versionId`. */
export function reuseCreatureVisualHistoryUrls<T extends SignedUrl & { id: string }>(
    history: readonly T[],
    now = Date.now(),
): T[] {
    return history.map((entry) => stableSignedUrl(entry.id, entry, now))
}

export function clearCreatureVisualUrlCache() {
    urlsByVisualVersion.clear()
}
