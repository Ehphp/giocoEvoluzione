import { describe, expect, it } from 'vitest'

import { appendFalWebhookCallbackToken, hasFalWebhookCallbackToken } from './fal-webhook-callback-token.ts'

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-ab'

describe('Fal callback URL token', () => {
    it('adds a purpose-limited token and accepts only the exact value', () => {
        const callbackUrl = appendFalWebhookCallbackToken({
            webhookUrl: 'https://project.supabase.co/functions/v1/fal-creature-transformation-webhook?trace=1',
            token: TOKEN,
        })

        expect(new URL(callbackUrl).searchParams.get('fal_callback_token')).toBe(TOKEN)
        expect(new URL(callbackUrl).searchParams.get('trace')).toBe('1')
        expect(hasFalWebhookCallbackToken({ callbackUrl, expectedToken: TOKEN })).toBe(true)
        expect(hasFalWebhookCallbackToken({ callbackUrl, expectedToken: TOKEN.replace('A', 'B') })).toBe(false)
        expect(
            hasFalWebhookCallbackToken({
                callbackUrl: 'https://project.supabase.co/functions/v1/fal-creature-transformation-webhook',
                expectedToken: TOKEN,
            }),
        ).toBe(false)
    })

    it('rejects an undersized token before it can reach Fal', () => {
        expect(() =>
            appendFalWebhookCallbackToken({
                webhookUrl: 'https://project.supabase.co/functions/v1/fal-creature-transformation-webhook',
                token: 'too-short',
            }),
        ).toThrow('token callback Fal non e valido')
    })
})
