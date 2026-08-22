const FAL_JWKS_URL = 'https://rest.fal.ai/.well-known/jwks.json'
const MAX_JWKS_CACHE_MS = 24 * 60 * 60 * 1000
const MAX_FALLBACK_JWKS_CACHE_MS = 5 * 60 * 1000
const MAX_FALLBACK_JWKS_JSON_LENGTH = 64 * 1024
const MAX_WEBHOOK_CLOCK_SKEW_SECONDS = 300

type FetchLike = typeof fetch
type Jwk = Readonly<{ x: string }>
type JwksSource = 'remote' | 'fallback'
export type FalWebhookSignatureRejection =
    | 'HEADERS_INVALID'
    | 'TIMESTAMP_OUT_OF_RANGE'
    | 'SIGNATURE_ENCODING_INVALID'
    | 'BODY_DIGEST_FAILED'
    | 'JWKS_UNAVAILABLE'
    | 'SIGNATURE_MISMATCH'

let cache: Readonly<{ keys: readonly Jwk[]; expiresAt: number; source: JwksSource }> | null = null

function hex(bytes: Uint8Array): string {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function hexBytes(value: string): Uint8Array<ArrayBuffer> | null {
    if (!/^[a-fA-F0-9]{128}$/.test(value)) return null
    const bytes = new Uint8Array(value.length / 2)
    for (let index = 0; index < bytes.length; index += 1)
        bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
    return bytes
}

function base64UrlBytes(value: string): Uint8Array<ArrayBuffer> | null {
    if (!/^[A-Za-z0-9_-]{43,44}$/.test(value)) return null
    try {
        const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
        const binary = atob(padded)
        return Uint8Array.from(binary, (entry) => entry.charCodeAt(0))
    } catch {
        return null
    }
}

function requiredHeader(headers: Headers, name: string): string | null {
    const value = headers.get(name)?.trim()
    return value && value.length <= 512 && !/[\r\n]/.test(value) ? value : null
}

function publicKeysFromPayload(payload: unknown): readonly Jwk[] {
    const keys =
        payload && typeof payload === 'object' && Array.isArray((payload as { keys?: unknown }).keys)
            ? (payload as { keys: unknown[] }).keys.flatMap((entry) => {
                  const key =
                      entry && typeof entry === 'object' && typeof (entry as { x?: unknown }).x === 'string'
                          ? { x: (entry as { x: string }).x }
                          : null
                  return key && base64UrlBytes(key.x)?.length === 32 ? [Object.freeze(key)] : []
              })
            : []
    return Object.freeze(keys)
}

function fallbackPublicKeys(fallbackJwksJson: string | undefined): readonly Jwk[] {
    if (!fallbackJwksJson || fallbackJwksJson.length > MAX_FALLBACK_JWKS_JSON_LENGTH) return []
    try {
        return publicKeysFromPayload(JSON.parse(fallbackJwksJson))
    } catch {
        return []
    }
}

async function publicKeys(
    fetchImplementation: FetchLike,
    now: () => number,
    fallbackJwksJson: string | undefined,
): Promise<Readonly<{ keys: readonly Jwk[]; source: JwksSource }>> {
    const current = now()
    if (cache && cache.expiresAt > current) return cache
    try {
        const response = await fetchImplementation(FAL_JWKS_URL, { signal: AbortSignal.timeout(8_000) })
        if (!response.ok) throw new Error(`Fal JWKS non disponibile (${response.status}).`)
        const keys = publicKeysFromPayload(await response.json())
        if (!keys.length) throw new Error('Fal JWKS non contiene chiavi Ed25519 valide.')
        cache = Object.freeze({ keys, expiresAt: current + MAX_JWKS_CACHE_MS, source: 'remote' })
        return cache
    } catch (remoteError) {
        const keys = fallbackPublicKeys(fallbackJwksJson)
        if (!keys.length) throw remoteError
        // Do not let an emergency fallback hide recovery of Fal's JWKS endpoint for long.
        cache = Object.freeze({ keys, expiresAt: current + MAX_FALLBACK_JWKS_CACHE_MS, source: 'fallback' })
        return cache
    }
}

export function clearFalWebhookJwksCacheForTest() {
    cache = null
}

export async function verifyFalWebhookSignature(input: {
    headers: Headers
    rawBody: Uint8Array
    fetchImplementation?: FetchLike
    now?: () => number
    fallbackJwksJson?: string
}): Promise<
    | Readonly<{ valid: true; providerRequestId: string; jwksSource: JwksSource }>
    | Readonly<{ valid: false; reason: FalWebhookSignatureRejection }>
> {
    const providerRequestId = requiredHeader(input.headers, 'x-fal-webhook-request-id')
    const userId = requiredHeader(input.headers, 'x-fal-webhook-user-id')
    const timestamp = requiredHeader(input.headers, 'x-fal-webhook-timestamp')
    const signature = requiredHeader(input.headers, 'x-fal-webhook-signature')
    if (!providerRequestId || !userId || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp))
        return { valid: false, reason: 'HEADERS_INVALID' }
    const now = input.now ?? (() => Date.now())
    const timestampSeconds = Number(timestamp)
    if (
        !Number.isSafeInteger(timestampSeconds) ||
        Math.abs(Math.floor(now() / 1000) - timestampSeconds) > MAX_WEBHOOK_CLOCK_SKEW_SECONDS
    )
        return { valid: false, reason: 'TIMESTAMP_OUT_OF_RANGE' }
    const signatureBytes = hexBytes(signature)
    if (!signatureBytes) return { valid: false, reason: 'SIGNATURE_ENCODING_INVALID' }
    let digest: ArrayBuffer
    try {
        // Keep the body exactly as received without making a second copy of a potentially large
        // webhook payload. Some Web Crypto typings require an ArrayBuffer-backed view here.
        const rawBody = new Uint8Array(
            input.rawBody.buffer as ArrayBuffer,
            input.rawBody.byteOffset,
            input.rawBody.byteLength,
        )
        digest = await crypto.subtle.digest('SHA-256', rawBody)
    } catch {
        return { valid: false, reason: 'BODY_DIGEST_FAILED' }
    }
    const message = new TextEncoder().encode(
        [providerRequestId, userId, timestamp, hex(new Uint8Array(digest))].join('\n'),
    )
    let keySet: Readonly<{ keys: readonly Jwk[]; source: JwksSource }>
    try {
        keySet = await publicKeys(input.fetchImplementation ?? fetch, now, input.fallbackJwksJson)
    } catch {
        return { valid: false, reason: 'JWKS_UNAVAILABLE' }
    }
    for (const entry of keySet.keys) {
        const key = base64UrlBytes(entry.x)
        if (!key) continue
        try {
            const publicKey = await crypto.subtle.importKey('raw', key, { name: 'Ed25519' }, false, ['verify'])
            if (await crypto.subtle.verify({ name: 'Ed25519' }, publicKey, signatureBytes, message))
                return { valid: true, providerRequestId, jwksSource: keySet.source }
        } catch {
            // Try the next rotating Fal key.
        }
    }
    return { valid: false, reason: 'SIGNATURE_MISMATCH' }
}
