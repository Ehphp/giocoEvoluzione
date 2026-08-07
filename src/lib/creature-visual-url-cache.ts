type SignedCreatureVisual = Readonly<{
    versionId: string
    signedUrl: string
    expiresAt: string
}>

const MINIMUM_VALIDITY_MS = 30_000
const urlsByVisualVersion = new Map<string, SignedCreatureVisual>()

export function reuseCreatureVisualUrl<T extends SignedCreatureVisual>(visual: T, now = Date.now()): T {
    const cached = urlsByVisualVersion.get(visual.versionId)
    if (cached && Date.parse(cached.expiresAt) - now > MINIMUM_VALIDITY_MS) {
        return { ...visual, signedUrl: cached.signedUrl, expiresAt: cached.expiresAt }
    }
    urlsByVisualVersion.set(visual.versionId, visual)
    return visual
}

export function clearCreatureVisualUrlCache() {
    urlsByVisualVersion.clear()
}