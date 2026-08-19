import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

import { parseFalWebhookEvent } from '../generate-creature-transformation/fal-flux-image-provider.ts'
import { hasFalWebhookCallbackToken } from '../generate-creature-transformation/fal-webhook-callback-token.ts'
import { verifyFalWebhookSignature } from '../generate-creature-transformation/fal-webhook-signature.ts'
import { redactErrorMessage } from '../generate-creature-transformation/secret-redaction.ts'
import { SupabaseCreatureTransformationRequestRepository, type CreatureTransformationRequestRepositoryClient } from '../generate-creature-transformation/creature-transformation-request-repository.ts'
import { SupabaseCreatureVisualProgressionRepository, type CreatureVisualProgressionRepositoryClient } from '../generate-creature-transformation/creature-visual-progression-repository.ts'

declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void }

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function json(status = 200): Response {
    return new Response(JSON.stringify({ ok: true }), { status, headers: JSON_HEADERS })
}

async function restoreTrack(visualRepository: SupabaseCreatureVisualProgressionRepository, record: { profileId: string, id: string, visualProgressTrackId: string | null }) {
    if (!record.visualProgressTrackId) return
    try {
        await visualRepository.completeGeneration({ profileId: record.profileId, trackId: record.visualProgressTrackId, requestId: record.id, finalAsset: false })
    } catch (error) {
        console.error('fal.webhook.track_restore_failed', { transformationRequestId: record.id, reason: redactErrorMessage(error) })
    }
}

async function invokeFinalizer(input: { supabaseUrl: string, secret: string, providerRequestId: string, image: { url: string, contentType: 'image/png' | 'image/jpeg' | null } }) {
    const response = await fetch(`${input.supabaseUrl}/functions/v1/fal-creature-transformation-finalizer`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-fal-finalizer-secret': input.secret,
        },
        body: JSON.stringify({ providerRequestId: input.providerRequestId, image: input.image }),
    })
    if (!response.ok) throw new Error(`Fal finalizer ha risposto ${response.status}.`)
}

Deno.serve(async (request) => {
    if (request.method !== 'POST') return json(405)
    const rawBody = new Uint8Array(await request.arrayBuffer())
    const callbackTokenAuthorized = hasFalWebhookCallbackToken({
        callbackUrl: request.url,
        expectedToken: Deno.env.get('FAL_WEBHOOK_CALLBACK_TOKEN'),
    })
    // New submissions carry the secret in the callback URL, avoiding a blocking remote JWKS
    // dependency. Legacy callbacks continue to require Fal's Ed25519 signature.
    const verified = callbackTokenAuthorized
        ? null
        : await verifyFalWebhookSignature({
            headers: request.headers,
            rawBody,
            fallbackJwksJson: Deno.env.get('FAL_WEBHOOK_JWKS_JSON'),
        })
    if (!callbackTokenAuthorized && !verified.valid) {
        const hintedRequestId = request.headers.get('x-fal-webhook-request-id')?.trim()
        console.warn('fal.webhook.signature_rejected', {
            reason: verified.reason,
            ...(hintedRequestId && /^[A-Za-z0-9-]{1,256}$/.test(hintedRequestId) ? { providerRequestId: hintedRequestId } : {}),
        })
        return json(401)
    }
    const hintedRequestId = request.headers.get('x-fal-webhook-request-id')?.trim()
    if (callbackTokenAuthorized) {
        console.warn('fal.webhook.callback_token_authorized', {
            ...(hintedRequestId && /^[A-Za-z0-9-]{1,256}$/.test(hintedRequestId) ? { providerRequestId: hintedRequestId } : {}),
        })
    } else if (verified.jwksSource === 'fallback') {
        console.warn('fal.webhook.jwks_fallback_used', { providerRequestId: verified.providerRequestId })
    }
    let payload: unknown
    try {
        payload = JSON.parse(new TextDecoder().decode(rawBody))
    } catch {
        return json(400)
    }
    const event = parseFalWebhookEvent(payload)
    if (!event || (verified && event.providerRequestId !== verified.providerRequestId)) return json(400)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const finalizerSecret = Deno.env.get('FAL_FINALIZER_SHARED_SECRET')?.trim()
    if (!supabaseUrl || !serviceRoleKey || !finalizerSecret) return json(503)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
    const repository = new SupabaseCreatureTransformationRequestRepository(supabaseAdmin as unknown as CreatureTransformationRequestRepositoryClient)
    const visualRepository = new SupabaseCreatureVisualProgressionRepository(supabaseAdmin as unknown as CreatureVisualProgressionRepositoryClient)
    const record = await repository.getByProviderRequestId({ providerRequestId: event.providerRequestId })
    if (!record || record.status === 'SUCCEEDED' || record.status === 'FAILED') return json(200)
    if (event.status === 'ERROR' || !event.image) {
        try {
            await repository.markFailed({
                requestId: record.id,
                profileId: record.profileId,
                errorCode: event.status === 'ERROR' ? 'FAL_FLUX_PROVIDER_ERROR' : 'FAL_FLUX_RESPONSE_INVALID',
                // Provider error text is external input. Do not persist or return it to the browser.
                errorMessage: event.status === 'ERROR' ? 'Fal ha segnalato un errore durante la generazione.' : 'Il webhook Fal non contiene un output immagine valido.',
            })
        } catch { return json(200) }
        await restoreTrack(visualRepository, record)
        return json(200)
    }
    // The finalizer acquires the durable claim. Claiming here would make a transient failure while
    // invoking it look like a permanently in-progress job; duplicate webhooks are instead safely
    // collapsed by the finalizer's atomic claim.
    EdgeRuntime.waitUntil(invokeFinalizer({
        supabaseUrl,
        secret: finalizerSecret,
        providerRequestId: event.providerRequestId,
        image: event.image,
    }).catch((error) => console.error('fal.webhook.finalizer_enqueue_failed', { providerRequestId: event.providerRequestId, reason: redactErrorMessage(error) })))
    return json(202)
})
