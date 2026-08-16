import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearFalWebhookJwksCacheForTest, verifyFalWebhookSignature } from './fal-webhook-signature.ts'

function base64Url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function hex(bytes: Uint8Array): string {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

afterEach(() => clearFalWebhookJwksCacheForTest())

describe('Fal webhook signatures', () => {
    it('accepts the official raw-body ED25519 signature format and rejects a modified body', async () => {
        const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
        const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
        const rawBody = new TextEncoder().encode('{"request_id":"queue-1","status":"OK"}')
        const timestamp = '1000'
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', rawBody))
        const message = new TextEncoder().encode(['queue-1', 'fal-user', timestamp, hex(digest)].join('\n'))
        const signature = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, message))
        const headers = new Headers({
            'x-fal-webhook-request-id': 'queue-1',
            'x-fal-webhook-user-id': 'fal-user',
            'x-fal-webhook-timestamp': timestamp,
            'x-fal-webhook-signature': hex(signature),
        })
        const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({ keys: [{ x: base64Url(publicKey) }] })))

        await expect(verifyFalWebhookSignature({ headers, rawBody, fetchImplementation, now: () => 1_000_000 }))
            .resolves.toEqual({ valid: true, providerRequestId: 'queue-1', jwksSource: 'remote' })
        await expect(verifyFalWebhookSignature({ headers, rawBody: new TextEncoder().encode('{"request_id":"queue-1","status":"ERROR"}'), fetchImplementation, now: () => 1_000_000 }))
            .resolves.toEqual({ valid: false, reason: 'SIGNATURE_MISMATCH' })
    })

    it('uses only a configured fallback JWKS when Fal JWKS is temporarily unreachable', async () => {
        const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
        const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
        const rawBody = new TextEncoder().encode('{"request_id":"queue-fallback","status":"OK"}')
        const timestamp = '1000'
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', rawBody))
        const message = new TextEncoder().encode(['queue-fallback', 'fal-user', timestamp, hex(digest)].join('\n'))
        const signature = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, message))
        const headers = new Headers({
            'x-fal-webhook-request-id': 'queue-fallback',
            'x-fal-webhook-user-id': 'fal-user',
            'x-fal-webhook-timestamp': timestamp,
            'x-fal-webhook-signature': hex(signature),
        })
        const fetchImplementation = vi.fn(async () => { throw new Error('network unavailable') })

        await expect(verifyFalWebhookSignature({
            headers,
            rawBody,
            fetchImplementation,
            now: () => 1_000_000,
            fallbackJwksJson: JSON.stringify({ keys: [{ x: base64Url(publicKey) }] }),
        })).resolves.toEqual({ valid: true, providerRequestId: 'queue-fallback', jwksSource: 'fallback' })
    })

    it('rejects stale timestamps before making a JWKS request', async () => {
        const fetchImplementation = vi.fn()
        const headers = new Headers({
            'x-fal-webhook-request-id': 'queue-1',
            'x-fal-webhook-user-id': 'fal-user',
            'x-fal-webhook-timestamp': '1',
            'x-fal-webhook-signature': 'a'.repeat(128),
        })
        await expect(verifyFalWebhookSignature({ headers, rawBody: new Uint8Array([1]), fetchImplementation, now: () => 1_000_000 }))
            .resolves.toEqual({ valid: false, reason: 'TIMESTAMP_OUT_OF_RANGE' })
        expect(fetchImplementation).not.toHaveBeenCalled()
    })
})
