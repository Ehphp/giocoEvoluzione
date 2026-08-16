import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const webhook = readFileSync(resolve('supabase/functions/fal-creature-transformation-webhook/index.ts'), 'utf8')
const finalizer = readFileSync(resolve('supabase/functions/fal-creature-transformation-finalizer/index.ts'), 'utf8')
const submission = readFileSync(resolve('supabase/functions/generate-creature-transformation/index.ts'), 'utf8')

describe('Fal webhook and finalization boundary', () => {
    it('verifies the raw signed webhook before any persistence client is created', () => {
        expect(webhook.indexOf('verifyFalWebhookSignature')).toBeGreaterThan(-1)
        expect(webhook.indexOf('verifyFalWebhookSignature')).toBeLessThan(webhook.indexOf('createClient('))
        expect(webhook).toContain('hasFalWebhookCallbackToken')
        expect(webhook).toContain("fal.webhook.callback_token_authorized")
        expect(webhook).toContain('new Uint8Array(await request.arrayBuffer())')
        expect(webhook).toContain('EdgeRuntime.waitUntil')
    })

    it('leaves result download, validation, crop retry and storage to the second invocation', () => {
        expect(finalizer).toContain('repository.claimFalFinalization')
        expect(finalizer).toContain('provider.downloadQueuedImage')
        expect(finalizer).toContain('new ImageValidator().validate')
        expect(finalizer).toContain('retryCroppedFlux')
        expect(finalizer).toContain('markBackgroundRemovalPending')
        expect(finalizer).not.toContain('readCanonicalSource(')
        expect(finalizer).not.toContain('readExperimentalSource(')
        expect(finalizer).toContain("mimeType: downloaded.mimeType")
        expect(finalizer).not.toContain('edge-image-codec')
        expect(submission).not.toContain('edge-image-codec')
    })
})
