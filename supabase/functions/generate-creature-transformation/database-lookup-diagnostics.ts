export function getSafeDatabaseLookupCode(error: unknown): string {
    if (!error || typeof error !== 'object') return 'UNKNOWN'

    const candidate = (error as { code?: unknown }).code
    return typeof candidate === 'string' && /^[A-Za-z0-9_]{1,32}$/.test(candidate)
        ? candidate
        : 'UNKNOWN'
}
