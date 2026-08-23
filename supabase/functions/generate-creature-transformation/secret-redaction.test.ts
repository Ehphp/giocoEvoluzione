import { describe, expect, it } from 'vitest'

import { redactErrorMessage, redactSensitiveText } from './secret-redaction.ts'

describe('secret redaction', () => {
    it('redacts credential-like query parameters and headers before telemetry or persistence', () => {
        const message =
            'request failed at https://example.test/callback?fal_callback_token=private-callback-token-value&trace=1; Authorization: Bearer private-access-token'
        const redacted = redactSensitiveText(message)

        expect(redacted).toContain('fal_callback_token=[redacted]')
        expect(redacted).toContain('Authorization: [redacted]')
        expect(redacted).not.toContain('private-callback-token-value')
        expect(redacted).not.toContain('private-access-token')
    })

    it('applies the same redaction to Error messages', () => {
        expect(redactErrorMessage(new Error('api_key=provider-secret-value'))).toBe('api_key=[redacted]')
    })
})
