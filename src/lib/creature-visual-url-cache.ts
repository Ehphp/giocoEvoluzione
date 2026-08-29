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
 *
 * The cache is persisted, and that is the point rather than an optimisation. Held only in memory it
 * died with the page, so every load re-signed all eleven forms of a lineage and re-downloaded 1.08 MB
 * of artwork the browser already had on disk. The objects are served `cache-control: no-cache` with
 * an ETag, so a stable URL still costs one conditional request per image — which comes back `304`
 * with no body. Same pixels, none of the bytes.
 */
const MINIMUM_VALIDITY_MS = 30_000
const STORAGE_KEY = 'evori.creature-visual-urls.v1'

const urlsByVisualVersion = new Map<string, SignedUrl>()
let isHydrated = false

/**
 * `window.localStorage` rather than the bare global: under Node the bare one is Node's own, which
 * throws unless the process was started with `--localstorage-file`. Absent without a DOM, and it
 * throws outright when the browser has storage disabled.
 */
function readStorage(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage ?? null
    } catch {
        return null
    }
}

function hydrate(): void {
    if (isHydrated) return
    isHydrated = true

    const store = readStorage()
    if (!store) return

    let raw: string | null = null
    try {
        raw = store.getItem(STORAGE_KEY)
    } catch {
        return
    }
    if (!raw) return

    try {
        const parsed: unknown = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return

        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (!value || typeof value !== 'object') continue
            const { signedUrl, expiresAt } = value as Partial<SignedUrl>
            if (typeof signedUrl !== 'string' || typeof expiresAt !== 'string') continue
            if (!Number.isFinite(Date.parse(expiresAt))) continue
            urlsByVisualVersion.set(key, { signedUrl, expiresAt })
        }
    } catch {
        // A corrupt entry is a cold cache, not a failure: the next read re-signs and overwrites it.
    }
}

/** Drops what has expired from both copies, so neither grows without bound across sessions. */
function persist(now: number): void {
    const live: Record<string, SignedUrl> = {}

    for (const [key, value] of urlsByVisualVersion) {
        if (Date.parse(value.expiresAt) - now > MINIMUM_VALIDITY_MS) live[key] = value
        else urlsByVisualVersion.delete(key)
    }

    const store = readStorage()
    if (!store) return

    try {
        store.setItem(STORAGE_KEY, JSON.stringify(live))
    } catch {
        // Quota or private browsing. The in-memory map still covers the current page.
    }
}

function stableSignedUrl<T extends SignedUrl>(
    key: string,
    visual: T,
    now: number,
): { visual: T; isNew: boolean } {
    hydrate()

    const cached = urlsByVisualVersion.get(key)
    if (cached && Date.parse(cached.expiresAt) - now > MINIMUM_VALIDITY_MS) {
        return { visual: { ...visual, signedUrl: cached.signedUrl, expiresAt: cached.expiresAt }, isNew: false }
    }

    urlsByVisualVersion.set(key, { signedUrl: visual.signedUrl, expiresAt: visual.expiresAt })
    return { visual, isNew: true }
}

export function reuseCreatureVisualUrl<T extends SignedUrl & { versionId: string }>(visual: T, now = Date.now()): T {
    const resolved = stableSignedUrl(visual.versionId, visual, now)
    if (resolved.isNew) persist(now)

    return resolved.visual
}

/** The history identifies a version by `id`; the current visual calls the same thing `versionId`. */
export function reuseCreatureVisualHistoryUrls<T extends SignedUrl & { id: string }>(
    history: readonly T[],
    now = Date.now(),
): T[] {
    let hasNew = false
    // One write for the whole history rather than one per entry: sixteen forms, one serialisation.
    const resolved = history.map((entry) => {
        const next = stableSignedUrl(entry.id, entry, now)
        hasNew ||= next.isNew

        return next.visual
    })
    if (hasNew) persist(now)

    return resolved
}

/**
 * Forgets every signed URL, in memory and on disk.
 *
 * Signing out has to reach the persisted copy too: a signed URL is a bearer token for the artwork,
 * and leaving the previous account's forms readable on a shared device is exactly what the twelve
 * hour lifetime would otherwise buy.
 */
export function clearCreatureVisualUrlCache() {
    urlsByVisualVersion.clear()
    isHydrated = false

    const store = readStorage()
    if (!store) return

    try {
        store.removeItem(STORAGE_KEY)
    } catch {
        // Nothing was persisted if storage is unavailable.
    }
}
