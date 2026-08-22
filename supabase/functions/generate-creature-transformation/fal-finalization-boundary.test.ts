import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const webhook = readFileSync(resolve('supabase/functions/fal-creature-transformation-webhook/index.ts'), 'utf8')
const finalizer = readFileSync(resolve('supabase/functions/fal-creature-transformation-finalizer/index.ts'), 'utf8')
const submission = readFileSync(resolve('supabase/functions/generate-creature-transformation/index.ts'), 'utf8')

/**
 * `finalizeSeedreamProduction` is the last named function before `Deno.serve`, so that is the
 * slice boundary. Anchoring on a following function would silently widen to the whole file if
 * that function were ever removed.
 */
const seedreamFinalizer = finalizer.slice(
    finalizer.indexOf('async function finalizeSeedreamProduction'),
    finalizer.indexOf('Deno.serve('),
)

describe('Fal webhook and finalization boundary', () => {
    it('verifies the raw signed webhook before any persistence client is created', () => {
        // Matched with a regex, not `indexOf('createClient(')`: the call carries a type argument
        // (`createClient<any>(...)`), and a literal match would silently become -1 and pass.
        const clientConstruction = webhook.search(/createClient(?:<[^>]*>)?\(/)
        expect(clientConstruction).toBeGreaterThan(-1)
        expect(webhook.indexOf('verifyFalWebhookSignature')).toBeGreaterThan(-1)
        expect(webhook.indexOf('verifyFalWebhookSignature')).toBeLessThan(clientConstruction)
        expect(webhook).toContain('hasFalWebhookCallbackToken')
        expect(webhook).toContain("fal.webhook.callback_token_authorized")
        expect(webhook).toContain('new Uint8Array(await request.arrayBuffer())')
        expect(webhook).toContain('EdgeRuntime.waitUntil')
        expect(webhook).not.toContain('Authorization: `Bearer ${input.serviceRoleKey}`')
    })

    it('leaves result download, validation, crop retry and storage to the second invocation', () => {
        expect(finalizer).toContain('repository.claimFalFinalization')
        expect(finalizer).toContain('provider.downloadQueuedImage')
        expect(finalizer).toContain('new ImageValidator().validate')
        expect(finalizer).toContain('finalizeSeedreamProduction')
        expect(finalizer).toContain('retryCroppedSeedream')
        // Seedream production is the only workflow left; no provider branch remains to pick.
        expect(finalizer).not.toContain("workflow.kind === 'FLUX'")
        expect(finalizer).not.toContain('finalizeFlux')
        expect(finalizer).not.toContain('SEEDREAM_DIAGNOSTIC')
        expect(finalizer).toContain('markBackgroundRemovalPending')
        expect(finalizer).not.toContain('readCanonicalSource(')
        expect(finalizer).not.toContain('readExperimentalSource(')
        expect(finalizer).toContain("mimeType: downloaded.mimeType")
        expect(finalizer).toContain("downloaded.mimeType === 'image/png'")
        expect(finalizer).toContain("downloaded.mimeType === 'image/jpeg'")
        expect(finalizer).toContain('flipImageHorizontallyToPng')
        expect(submission).not.toContain('edge-image-codec')
    })

    it('inspects and corrects the Seedream raw before persistence and background removal, without entering retry flow', () => {
        expect(seedreamFinalizer.indexOf('inspectSeedreamVisual')).toBeLessThan(seedreamFinalizer.indexOf('flipImageHorizontallyToPng'))
        expect(seedreamFinalizer.indexOf('flipImageHorizontallyToPng')).toBeLessThan(seedreamFinalizer.indexOf('saveRawResult'))
        expect(seedreamFinalizer.indexOf('saveRawResult')).toBeLessThan(seedreamFinalizer.indexOf('markSucceeded'))
        expect(seedreamFinalizer.indexOf('recordVisualInspection')).toBeLessThan(seedreamFinalizer.indexOf('markBackgroundRemovalPending'))
        expect(seedreamFinalizer).toContain('dimensions = seedreamProductionDimensions({ ...mirrored')
        expect(seedreamFinalizer).toContain('resultMimeType: rawImage.mimeType')
        expect(finalizer).toContain('GeminiVisualInspectionService')
        expect(seedreamFinalizer.slice(seedreamFinalizer.indexOf('inspectSeedreamVisual'))).not.toContain('retryCroppedSeedream')
    })

    it('rejects a Vision-verified center-facing Seedream image before it can reach raw storage or background removal', () => {
        expect(seedreamFinalizer).toContain('shouldRejectSeedreamCenterFacing')
        expect(seedreamFinalizer).toContain("'SEEDREAM_CENTER_FACING'")
        expect(seedreamFinalizer.indexOf('seedream_orientation_rejected')).toBeLessThan(seedreamFinalizer.indexOf('saveRawResult'))
        expect(seedreamFinalizer.indexOf('seedream_orientation_rejected')).toBeLessThan(seedreamFinalizer.indexOf('markBackgroundRemovalPending'))
    })

    it('does not re-enter finalization for a duplicate callback after the first claim', () => {
        expect(finalizer).toContain("if (claim.outcome !== 'CLAIMED') return json(202)")
    })
})
