const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/

function isToken(value: string | null | undefined): value is string {
    return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

/** Adds the private, purpose-limited callback credential before the URL is given to Fal. */
export function appendFalWebhookCallbackToken(input: { webhookUrl: string, token: string }): string {
    if (!isToken(input.token)) throw new Error('Il token callback Fal non e valido.')
    const url = new URL(input.webhookUrl)
    if (url.protocol !== 'https:') throw new Error('Il webhook Fal deve usare HTTPS.')
    url.searchParams.set('fal_callback_token', input.token)
    return url.toString()
}

/** Constant-work comparison for the token received in Fal's callback URL. */
export function hasFalWebhookCallbackToken(input: { callbackUrl: string, expectedToken: string | null | undefined }): boolean {
    if (!isToken(input.expectedToken)) return false
    let received: string | null
    try {
        received = new URL(input.callbackUrl).searchParams.get('fal_callback_token')
    } catch {
        return false
    }
    if (!isToken(received) || received.length !== input.expectedToken.length) return false
    let difference = 0
    for (let index = 0; index < received.length; index += 1) difference |= received.charCodeAt(index) ^ input.expectedToken.charCodeAt(index)
    return difference === 0
}
