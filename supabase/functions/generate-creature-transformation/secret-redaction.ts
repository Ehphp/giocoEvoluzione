const URL_SECRET_PARAMETER = /([?&](?:access_token|api[_-]?key|token|key|secret|password|fal_callback_token)=)[^&#\s]+/gi
const LABELLED_SECRET = /(\b(?:authorization|api[_-]?key|token|secret|password|client_secret|private_key)\b["']?\s*[:=]\s*)(?:(?:Bearer|Key)\s+)?(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi
const PROVIDER_SECRET = /\b(?:sk-[A-Za-z0-9_-]{12,}|sb_secret_[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|nfp_[A-Za-z0-9]{16,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{32,})\b/gi

/**
 * Provider and infrastructure errors are untrusted input. Keep them usable for diagnostics
 * while ensuring logs and persisted failures cannot disclose credentials from URLs or headers.
 */
export function redactSensitiveText(value: string, maximumLength = 300): string {
    return value
        .slice(0, maximumLength)
        .replace(URL_SECRET_PARAMETER, '$1[redacted]')
        .replace(LABELLED_SECRET, '$1[redacted]')
        .replace(PROVIDER_SECRET, '[redacted]')
}

export function redactErrorMessage(error: unknown, maximumLength = 300): string {
    return error instanceof Error ? redactSensitiveText(error.message, maximumLength) : 'unknown'
}
