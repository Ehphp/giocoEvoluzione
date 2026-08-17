import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

import { ImageValidator, sha256Hex } from '../../../shared/creature-transformations/image-validator.ts'
import { buildFluxEvolutionPlan } from '../../../shared/creature-transformations/flux-evolution/evolution-plan.ts'
import { resolveCanonicalBodyPlan } from '../../../shared/creature-transformations/flux-evolution/body-plan-registry.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from '../../../shared/creature-transformations/render-specifications.ts'
import { SupabaseCreatureIdentityResolver, type PlayerCreatureRepository } from '../generate-creature-transformation/supabase-creature-identity-resolver.ts'
import { SupabaseCreatureTransformationStorageAdapter, type CreatureTransformationStorageClient } from '../generate-creature-transformation/supabase-creature-transformation-storage.ts'
import { SupabaseCreatureTransformationRequestRepository, type CreatureTransformationRequestRepositoryClient, type CreatureTransformationRequestRecord } from '../generate-creature-transformation/creature-transformation-request-repository.ts'
import { SupabaseCreatureVisualProgressionRepository, type CreatureVisualProgressionRepositoryClient } from '../generate-creature-transformation/creature-visual-progression-repository.ts'
import { FalFluxImageProvider, FAL_SEEDREAM_MODEL, type FalQueuedImage } from '../generate-creature-transformation/fal-flux-image-provider.ts'
import { appendFalWebhookCallbackToken } from '../generate-creature-transformation/fal-webhook-callback-token.ts'
import { FLUX_MAX_CROP_RETRIES, FLUX_SUBJECT_MARGIN_RATIO, FluxImageGenerationServiceError } from '../generate-creature-transformation/flux-image-generation-service.ts'
import { composeFluxQueuePrompt, composeSeedreamQueuePrompt, fluxMicroConceptFromSnapshot } from '../generate-creature-transformation/fal-queue-submission-service.ts'
import { parseFalQueueWorkflow } from '../generate-creature-transformation/fal-queue-workflow.ts'
import { readCreatureTransformationLabPolicy } from '../generate-creature-transformation/lab-policy.ts'
import { FluxMicroConceptGenerator } from '../generate-creature-transformation/flux-micro-concept-generator.ts'
import { prepareSeedreamDiagnosticPrompt } from '../generate-creature-transformation/seedream-diagnostic-service.ts'
import { isFluxEvolutionSnapshot, readBodyPlanMutationId, readFluxSnapshotCapability } from '../../../shared/creature-transformations/flux-evolution/micro-concept.ts'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function json(status = 200): Response {
    return new Response(JSON.stringify({ ok: true }), { status, headers: JSON_HEADERS })
}

function safeText(value: unknown, maximum = 4096): string | null {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximum ? value.trim() : null
}

function readImage(value: unknown): FalQueuedImage | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const item = value as { url?: unknown, contentType?: unknown }
    const url = safeText(item.url)
    if (!url || !/^https:\/\//.test(url)) return null
    const contentType = item.contentType === 'image/png' || item.contentType === 'image/jpeg' ? item.contentType : null
    return Object.freeze({ url, contentType })
}

function imageDimensions(bytes: Uint8Array): { width: number, height: number } | null {
    if (bytes.length < 24 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) return null
    const width = ((bytes[16] * 0x1000000) + (bytes[17] << 16) + (bytes[18] << 8) + bytes[19]) >>> 0
    const height = ((bytes[20] * 0x1000000) + (bytes[21] << 16) + (bytes[22] << 8) + bytes[23]) >>> 0
    return width > 0 && height > 0 ? { width, height } : null
}

function createPlayerRepository(supabaseAdmin: ReturnType<typeof createClient>): PlayerCreatureRepository {
    const repository = {
        async findByCreatureId(creatureId) {
            const { data, error } = await supabaseAdmin.from('player_creatures').select('id, profile_id, base_creature_key, current_visual_version_id').eq('id', creatureId).maybeSingle()
            if (error) throw error
            return data ? {
                id: String(data.id), profileId: String(data.profile_id), baseCreatureKey: String(data.base_creature_key),
                currentVisualVersionId: typeof data.current_visual_version_id === 'string' ? data.current_visual_version_id : null,
            } : null
        },
        async findCurrentVisualVersion({ creatureId, versionId }) {
            const { data, error } = await supabaseAdmin.from('creature_visual_versions').select('id, creature_id, asset_path, asset_sha256, version_number, visual_trait_id').eq('id', versionId).eq('creature_id', creatureId).eq('status', 'ACTIVE').maybeSingle()
            if (error) throw error
            return data ? {
                id: String(data.id), creatureId: String(data.creature_id), assetPath: String(data.asset_path), assetSha256: String(data.asset_sha256), versionNumber: Number(data.version_number),
                isBaseVersion: !/^(?:[A-Za-z0-9-]{1,128}\/[a-f0-9]{64}|experiments\/raw\/[A-Za-z0-9-]{1,128}\/[a-f0-9]{64}|candidates\/[A-Za-z0-9-]{1,128}\/[a-f0-9]{64}|cleanup\/[a-f0-9]{64})\.png$/.test(String(data.asset_path)),
            } : null
        },
        async listPreviousTransformations(creatureId) {
            const { data, error } = await supabaseAdmin.from('creature_visual_versions').select('version_number, visual_trait_id, evolution_target_id, evolution_function, concept_name, concept_snapshot').eq('creature_id', creatureId).not('visual_trait_id', 'is', null).in('status', ['ACTIVE', 'SUPERSEDED']).order('version_number', { ascending: false })
            if (error) throw error
            return [...(data ?? [])].reverse().flatMap((entry) => typeof entry.visual_trait_id === 'string' && typeof entry.concept_name === 'string'
                ? [{ versionNumber: Number(entry.version_number), visualTraitId: entry.visual_trait_id, conceptName: entry.concept_name, evolutionTargetId: typeof entry.evolution_target_id === 'string' ? entry.evolution_target_id : null, evolutionFunction: typeof entry.evolution_function === 'string' ? entry.evolution_function : null, ...(entry.concept_snapshot && typeof entry.concept_snapshot === 'object' && typeof (entry.concept_snapshot as { mutationIdea?: unknown }).mutationIdea === 'string' ? { mutationIdea: (entry.concept_snapshot as { mutationIdea: string }).mutationIdea } : {}) }]
                : [])
        },
    }
    // Database rows are narrowed inside each method. The Supabase generated client is intentionally
    // untyped in an Edge Function, so retain the resolver's stricter boundary here.
    return repository as unknown as PlayerCreatureRepository
}

function falWebhookUrl(): string {
    const configured = Deno.env.get('FAL_CREATURE_TRANSFORMATION_WEBHOOK_URL')?.trim()
    const webhookUrl = configured && /^https:\/\//.test(configured)
        ? configured
        : (() => {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
            if (!supabaseUrl || !/^https:\/\//.test(supabaseUrl)) {
                throw new FluxImageGenerationServiceError('FAL_FLUX_NOT_CONFIGURED', 'L URL del webhook Fal non e configurato.')
            }
            return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/fal-creature-transformation-webhook`
        })()
    const token = Deno.env.get('FAL_WEBHOOK_CALLBACK_TOKEN')?.trim()
    try {
        return appendFalWebhookCallbackToken({ webhookUrl, token: token ?? '' })
    } catch {
        throw new FluxImageGenerationServiceError('FAL_FLUX_NOT_CONFIGURED', 'Il token callback Fal non e configurato.')
    }
}

function jpegDimensions(bytes: Uint8Array): { width: number, height: number } | null {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
    let offset = 2
    while (offset + 8 <= bytes.length) {
        while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
        const marker = bytes[offset++]
        if (marker === undefined || marker === 0xd9 || marker === 0xda) return null
        if (marker >= 0xd0 && marker <= 0xd7) continue
        if (offset + 1 >= bytes.length) return null
        const length = (bytes[offset] << 8) + bytes[offset + 1]
        if (length < 7 || offset + length > bytes.length) return null
        if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
            const height = (bytes[offset + 3] << 8) + bytes[offset + 4]
            const width = (bytes[offset + 5] << 8) + bytes[offset + 6]
            return width > 0 && height > 0 ? { width, height } : null
        }
        offset += length
    }
    return null
}

function seedreamImageDimensions(input: { bytes: Uint8Array, mimeType: 'image/png' | 'image/jpeg' }): { width: number, height: number } {
    const dimensions = input.mimeType === 'image/png' ? imageDimensions(input.bytes) : jpegDimensions(input.bytes)
    if (!dimensions || input.bytes.length > 30 * 1024 * 1024 || dimensions.width > 8192 || dimensions.height > 8192 || dimensions.width * dimensions.height > 20_000_000) {
        throw new FluxImageGenerationServiceError('FLUX_RESULT_IMAGE_INVALID', 'L output Seedream non ha dimensioni o peso accettabili.')
    }
    return dimensions
}

function seedreamProductionDimensions(input: { bytes: Uint8Array, mimeType: 'image/png' | 'image/jpeg', expected: Readonly<{ width: number, height: number }> }): { width: number, height: number } {
    const dimensions = seedreamImageDimensions(input)
    if (dimensions.width !== input.expected.width || dimensions.height !== input.expected.height) {
        throw new FluxImageGenerationServiceError('FLUX_RESULT_IMAGE_INVALID', 'L output Seedream non rispetta il formato portrait persistito per questa richiesta.')
    }
    return dimensions
}

async function restoreTrack(visualRepository: SupabaseCreatureVisualProgressionRepository, record: CreatureTransformationRequestRecord) {
    if (!record.visualProgressTrackId) return
    try {
        await visualRepository.completeGeneration({ profileId: record.profileId, trackId: record.visualProgressTrackId, requestId: record.id, finalAsset: false })
    } catch (error) {
        console.error('fal.finalizer.track_restore_failed', { transformationRequestId: record.id, reason: error instanceof Error ? error.message : 'unknown' })
    }
}

async function failRequest(repository: SupabaseCreatureTransformationRequestRepository, visualRepository: SupabaseCreatureVisualProgressionRepository, record: CreatureTransformationRequestRecord, error: unknown) {
    const code = error instanceof FluxImageGenerationServiceError ? error.code : error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : 'FAL_FINALIZATION_FAILED'
    const message = error instanceof Error ? error.message : 'La finalizzazione Fal non e riuscita.'
    try { await repository.markFailed({ requestId: record.id, profileId: record.profileId, errorCode: code, errorMessage: message }) } catch { /* terminal/duplicate requests are already safe */ }
    await restoreTrack(visualRepository, record)
}

async function retryCroppedFlux(input: {
    record: CreatureTransformationRequestRecord
    provider: FalFluxImageProvider
    storage: SupabaseCreatureTransformationStorageAdapter
    repository: SupabaseCreatureTransformationRequestRepository
    resolver: SupabaseCreatureIdentityResolver
    webhookUrl: string
    sourceUrlTtlSeconds: number
    bodyPlanMutationEnabled: boolean
}) {
    const workflow = parseFalQueueWorkflow(input.record.falWorkflow)
    const concept = fluxMicroConceptFromSnapshot(input.record.conceptSnapshot)
    if (!workflow || workflow.kind !== 'FLUX' || !concept || !input.record.providerRequestId || !input.record.promptTemplateVersion) {
        throw new FluxImageGenerationServiceError('FLUX_RESULT_IMAGE_INVALID', 'I metadati della submission FLUX non sono disponibili per il retry di framing.')
    }
    const source = await input.resolver.resolve({ profileId: input.record.profileId, creatureId: input.record.creatureId })
    const bodyPlan = source.bodyPlan ?? resolveCanonicalBodyPlan({ baseCreatureKey: source.identity.baseCreatureKey, adoptedBodyPlanMutationIds: source.adoptedBodyPlanMutationIds })
    if (!bodyPlan || !input.record.evolutionTargetId) throw new FluxImageGenerationServiceError('FLUX_BODY_PLAN_UNSUPPORTED', 'La topologia della richiesta FLUX non e disponibile per il retry.')
    const plan = buildFluxEvolutionPlan({
        bodyPlan,
        evolutionTargetId: input.record.evolutionTargetId,
        previousTransformations: source.previousTransformations,
        seed: input.record.idempotencyKey,
        bodyPlanMutationEnabled: input.bodyPlanMutationEnabled,
        adoptedBodyPlanMutationIds: source.adoptedBodyPlanMutationIds,
    })
    const sourceUrl = (await input.storage.createVisualVersionSignedUrl({ assetPath: workflow.source.path, isBaseVersion: workflow.source.isBaseVersion, expiresInSeconds: input.sourceUrlTtlSeconds })).signedUrl
    const nextAttempt = input.record.attemptCount
    const prompt = await composeFluxQueuePrompt({ identity: source.identity, plan, concept, promptTemplateVersion: input.record.promptTemplateVersion as never, framingAttempt: nextAttempt })
    const submission = await input.provider.submitFlux({ prompt: prompt.prompt, sourceUrl, webhookUrl: input.webhookUrl })
    await input.repository.updateRunningFalSubmission({
        requestId: input.record.id,
        profileId: input.record.profileId,
        data: {
            provider: submission.provider,
            model: submission.model,
            providerRequestId: submission.providerRequestId,
            promptTemplateVersion: input.record.promptTemplateVersion,
            promptSha256: prompt.promptSha256,
            promptText: prompt.prompt,
            expectedProviderRequestId: input.record.providerRequestId,
            incrementAttempt: true,
        },
    })
}

async function finalizeFlux(input: {
    record: CreatureTransformationRequestRecord
    image: FalQueuedImage
    provider: FalFluxImageProvider
    repository: SupabaseCreatureTransformationRequestRepository
    storage: SupabaseCreatureTransformationStorageAdapter
    visualRepository: SupabaseCreatureVisualProgressionRepository
    resolver: SupabaseCreatureIdentityResolver
    policy: ReturnType<typeof readCreatureTransformationLabPolicy>
}) {
    if (!input.record.providerRequestId || !input.record.sourceSha256) throw new FluxImageGenerationServiceError('FLUX_RESULT_IMAGE_INVALID', 'Metadati FLUX incompleti per la finalizzazione.')
    const downloaded = await input.provider.downloadQueuedImage(input.image)
    const png = await input.provider.normalizeQueuedImage(downloaded)
    const validation = await new ImageValidator().validate({
        bytes: png,
        mimeType: 'image/png',
        renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
        maxBytes: 10 * 1024 * 1024,
        sourceSha256: input.record.sourceSha256,
        requireAlpha: false,
        requireSubjectMargin: FLUX_SUBJECT_MARGIN_RATIO,
    })
    if (!validation.valid) {
        const cropFailure = validation.problems.some((problem) => problem.code === 'FLUX_SUBJECT_CROPPED' || problem.code === 'PNG_FOREGROUND_DETECTION_FAILED')
        if (cropFailure && input.record.attemptCount <= FLUX_MAX_CROP_RETRIES) {
            await retryCroppedFlux({
                record: input.record,
                provider: input.provider,
                storage: input.storage,
                repository: input.repository,
                resolver: input.resolver,
                webhookUrl: falWebhookUrl(),
                sourceUrlTtlSeconds: input.policy.flux.submissionSourceUrlTtlSeconds,
                bodyPlanMutationEnabled: input.policy.bodyPlanMutation.enabled,
            })
            return
        }
        const cropped = validation.problems.some((problem) => problem.code === 'FLUX_SUBJECT_CROPPED')
        throw new FluxImageGenerationServiceError(cropped ? 'FLUX_SUBJECT_CROPPED' : 'FLUX_RESULT_IMAGE_INVALID', cropped ? 'Il soggetto FLUX resta troppo vicino al bordo dopo i retry di framing.' : 'Il PNG raw FLUX non ha superato i controlli tecnici.', validation.problems)
    }
    await input.storage.saveRawResult({ profileId: input.record.profileId, idempotencyKey: input.record.idempotencyKey, image: png })
    const completed = await input.repository.markSucceeded({
        requestId: input.record.id,
        profileId: input.record.profileId,
        data: {
            provider: 'fal.ai',
            model: input.record.model ?? input.policy.flux.model,
            providerRequestId: input.record.providerRequestId,
            sourceSha256: input.record.sourceSha256,
            resultSha256: validation.metadata.sha256,
            resultPath: await input.storage.createRawResultObjectPath(input.record.profileId, input.record.idempotencyKey),
            resultMimeType: 'image/png',
            resultWidth: validation.metadata.width,
            resultHeight: validation.metadata.height,
            generationLatencyMs: 0,
            assetReadiness: 'EXPERIMENT_ONLY',
            validationWarnings: ['BACKGROUND_REMOVAL_PENDING_CLIENT'],
        },
    })
    if (completed.visualProgressTrackId) await input.visualRepository.markBackgroundRemovalPending({ profileId: completed.profileId, trackId: completed.visualProgressTrackId, requestId: completed.id })
}

async function retryCroppedSeedream(input: {
    record: CreatureTransformationRequestRecord
    provider: FalFluxImageProvider
    storage: SupabaseCreatureTransformationStorageAdapter
    repository: SupabaseCreatureTransformationRequestRepository
    resolver: SupabaseCreatureIdentityResolver
    webhookUrl: string
    sourceUrlTtlSeconds: number
}) {
    const workflow = parseFalQueueWorkflow(input.record.falWorkflow)
    const concept = fluxMicroConceptFromSnapshot(input.record.conceptSnapshot)
    const snapshot = isFluxEvolutionSnapshot(input.record.conceptSnapshot) ? input.record.conceptSnapshot : null
    const capability = snapshot ? readFluxSnapshotCapability(snapshot) : null
    const bodyPlanMutationId = snapshot ? readBodyPlanMutationId(snapshot) : null
    if (!workflow || workflow.kind !== 'SEEDREAM_PRODUCTION' || !concept || !snapshot || !capability || !input.record.providerRequestId || !input.record.promptTemplateVersion
        || (capability === 'BODY_PLAN_MUTATION' && !bodyPlanMutationId)) {
        throw new FluxImageGenerationServiceError('FLUX_RESULT_IMAGE_INVALID', 'I metadati della submission Seedream non sono disponibili per il retry di framing.')
    }
    const source = await input.resolver.resolve({ profileId: input.record.profileId, creatureId: input.record.creatureId })
    const bodyPlan = source.bodyPlan ?? resolveCanonicalBodyPlan({ baseCreatureKey: source.identity.baseCreatureKey, adoptedBodyPlanMutationIds: source.adoptedBodyPlanMutationIds })
    if (!bodyPlan || !input.record.evolutionTargetId) throw new FluxImageGenerationServiceError('FLUX_BODY_PLAN_UNSUPPORTED', 'La topologia della richiesta Seedream non e disponibile per il retry.')
    const plan = buildFluxEvolutionPlan({
        bodyPlan,
        evolutionTargetId: input.record.evolutionTargetId,
        previousTransformations: source.previousTransformations,
        seed: input.record.idempotencyKey,
        bodyPlanMutationEnabled: capability === 'BODY_PLAN_MUTATION',
        ...(bodyPlanMutationId ? { requestedBodyPlanMutationId: bodyPlanMutationId } : {}),
        adoptedBodyPlanMutationIds: source.adoptedBodyPlanMutationIds,
    })
    const sourceUrl = (await input.storage.createVisualVersionSignedUrl({ assetPath: workflow.source.path, isBaseVersion: workflow.source.isBaseVersion, expiresInSeconds: input.sourceUrlTtlSeconds })).signedUrl
    const prompt = await composeSeedreamQueuePrompt({ identity: source.identity, plan, concept, framingAttempt: input.record.attemptCount })
    const submission = await input.provider.submitSeedreamEvolution({ prompt: prompt.prompt, sourceUrl, imageSize: workflow.parameters.imageSize, webhookUrl: input.webhookUrl })
    await input.repository.updateRunningFalSubmission({
        requestId: input.record.id,
        profileId: input.record.profileId,
        data: {
            provider: submission.provider,
            model: submission.model,
            providerRequestId: submission.providerRequestId,
            promptTemplateVersion: input.record.promptTemplateVersion,
            promptSha256: prompt.promptSha256,
            promptText: prompt.prompt,
            expectedProviderRequestId: input.record.providerRequestId,
            incrementAttempt: true,
        },
    })
}

async function finalizeSeedreamProduction(input: {
    record: CreatureTransformationRequestRecord
    image: FalQueuedImage
    provider: FalFluxImageProvider
    repository: SupabaseCreatureTransformationRequestRepository
    storage: SupabaseCreatureTransformationStorageAdapter
    visualRepository: SupabaseCreatureVisualProgressionRepository
    resolver: SupabaseCreatureIdentityResolver
    sourceUrlTtlSeconds: number
}) {
    const workflow = parseFalQueueWorkflow(input.record.falWorkflow)
    if (!workflow || workflow.kind !== 'SEEDREAM_PRODUCTION' || !input.record.providerRequestId || !input.record.sourceSha256) {
        throw new FluxImageGenerationServiceError('FLUX_RESULT_IMAGE_INVALID', 'Metadati Seedream incompleti per la finalizzazione.')
    }
    const downloaded = await input.provider.downloadQueuedImage(input.image)
    console.info('fal.finalizer.seedream_production_downloaded', { providerRequestId: input.record.providerRequestId, mimeType: downloaded.mimeType, bytes: downloaded.bytes.byteLength })
    const dimensions = seedreamProductionDimensions({ ...downloaded, expected: workflow.parameters.imageSize })
    let resultSha256: string
    if (downloaded.mimeType === 'image/png') {
        // PNG raw can be checked before it is stored. JPEG deliberately skips this decode: the
        // browser background-removal stage owns its conversion to the final 1024x1536 PNG.
        const validation = await new ImageValidator().validate({
            bytes: downloaded.bytes,
            mimeType: 'image/png',
            renderSpecification: workflow.parameters.imageSize as Parameters<ImageValidator['validate']>[0]['renderSpecification'],
            maxBytes: 30 * 1024 * 1024,
            sourceSha256: input.record.sourceSha256,
            requireAlpha: false,
            requireSubjectMargin: FLUX_SUBJECT_MARGIN_RATIO,
        })
        if (!validation.valid) {
            const cropFailure = validation.problems.some((problem) => problem.code === 'FLUX_SUBJECT_CROPPED' || problem.code === 'PNG_FOREGROUND_DETECTION_FAILED')
            if (cropFailure && input.record.attemptCount <= FLUX_MAX_CROP_RETRIES) {
                await retryCroppedSeedream({
                    record: input.record,
                    provider: input.provider,
                    storage: input.storage,
                    repository: input.repository,
                    resolver: input.resolver,
                    webhookUrl: falWebhookUrl(),
                    sourceUrlTtlSeconds: input.sourceUrlTtlSeconds,
                })
                return
            }
            const cropped = validation.problems.some((problem) => problem.code === 'FLUX_SUBJECT_CROPPED')
            throw new FluxImageGenerationServiceError(cropped ? 'FLUX_SUBJECT_CROPPED' : 'FLUX_RESULT_IMAGE_INVALID', cropped ? 'Il soggetto Seedream resta troppo vicino al bordo dopo i retry di framing.' : 'Il PNG raw Seedream non ha superato i controlli tecnici.', validation.problems)
        }
        resultSha256 = validation.metadata.sha256
    } else {
        resultSha256 = await sha256Hex(downloaded.bytes)
    }
    await input.storage.saveRawResult({ profileId: input.record.profileId, idempotencyKey: input.record.idempotencyKey, image: downloaded.bytes, mimeType: downloaded.mimeType })
    const completed = await input.repository.markSucceeded({
        requestId: input.record.id,
        profileId: input.record.profileId,
        data: {
            provider: 'fal.ai',
            model: input.record.model,
            providerRequestId: input.record.providerRequestId,
            sourceSha256: input.record.sourceSha256,
            resultSha256,
            resultPath: await input.storage.createRawResultObjectPath(input.record.profileId, input.record.idempotencyKey, downloaded.mimeType),
            resultMimeType: downloaded.mimeType,
            resultWidth: dimensions.width,
            resultHeight: dimensions.height,
            generationLatencyMs: 0,
            assetReadiness: 'EXPERIMENT_ONLY',
            validationWarnings: ['BACKGROUND_REMOVAL_PENDING_CLIENT', ...(downloaded.mimeType === 'image/jpeg' ? ['SEEDREAM_PROVIDER_JPEG'] : [])],
        },
    })
    if (completed.visualProgressTrackId) await input.visualRepository.markBackgroundRemovalPending({ profileId: completed.profileId, trackId: completed.visualProgressTrackId, requestId: completed.id })
}

async function finalizeSeedream(input: {
    record: CreatureTransformationRequestRecord
    image: FalQueuedImage
    provider: FalFluxImageProvider
    repository: SupabaseCreatureTransformationRequestRepository
    storage: SupabaseCreatureTransformationStorageAdapter
    resolver: SupabaseCreatureIdentityResolver
    microConceptGenerator: FluxMicroConceptGenerator | null
    sourceUrlTtlSeconds: number
}) {
    const workflow = parseFalQueueWorkflow(input.record.falWorkflow)
    if (!workflow || workflow.kind !== 'SEEDREAM_DIAGNOSTIC' || !input.record.providerRequestId) throw new FluxImageGenerationServiceError('FLUX_RESULT_IMAGE_INVALID', 'Metadati Seedream incompleti per la finalizzazione.')
    console.info('fal.finalizer.seedream_started', { providerRequestId: input.record.providerRequestId, chainStep: workflow.chainStep, chainMode: workflow.chainMode })
    if (workflow.chainStep === 1 && workflow.chainMode !== 'NONE') {
        let sourceUrl = input.image.url
        if (workflow.chainMode === 'NORMALIZED_PROJECT_CHAIN') {
            const downloaded = await input.provider.downloadQueuedImage(input.image)
            console.info('fal.finalizer.image_downloaded', { providerRequestId: input.record.providerRequestId, mimeType: downloaded.mimeType, bytes: downloaded.bytes.byteLength })
            seedreamImageDimensions(downloaded)
            await input.storage.saveRawResult({ profileId: input.record.profileId, idempotencyKey: input.record.idempotencyKey, image: downloaded.bytes, mimeType: downloaded.mimeType })
            sourceUrl = (await input.storage.createResultSignedUrl(await input.storage.createRawResultObjectPath(input.record.profileId, input.record.idempotencyKey, downloaded.mimeType), input.sourceUrlTtlSeconds)).signedUrl
        }
        let prompt = input.record.promptText
        let refreshedPrompt: { promptTemplateVersion: string, promptSha256: string, conceptSnapshot?: NonNullable<CreatureTransformationRequestRecord['conceptSnapshot']> } | null = null
        if (workflow.conceptSource === 'dynamic') {
            if (!input.microConceptGenerator || !input.record.evolutionTargetId) throw new FluxImageGenerationServiceError('FLUX_CONCEPT_NOT_CONFIGURED', 'Il generatore del micro-concept Seedream non e configurato.')
            const source = await input.resolver.resolve({ profileId: input.record.profileId, creatureId: input.record.creatureId })
            const bodyPlan = source.bodyPlan ?? resolveCanonicalBodyPlan({ baseCreatureKey: source.identity.baseCreatureKey, adoptedBodyPlanMutationIds: source.adoptedBodyPlanMutationIds })
            if (!bodyPlan) throw new FluxImageGenerationServiceError('FLUX_BODY_PLAN_UNSUPPORTED', 'La topologia Seedream non e disponibile.')
            const plan = buildFluxEvolutionPlan({
                bodyPlan,
                evolutionTargetId: input.record.evolutionTargetId,
                previousTransformations: source.previousTransformations,
                seed: input.record.idempotencyKey,
                bodyPlanMutationEnabled: false,
                adoptedBodyPlanMutationIds: source.adoptedBodyPlanMutationIds,
            })
            const prepared = await prepareSeedreamDiagnosticPrompt({
                experimentMode: workflow.experimentMode,
                identity: source.identity,
                plan,
                microConceptGenerator: input.microConceptGenerator,
            })
            prompt = prepared.prompt
            refreshedPrompt = {
                promptTemplateVersion: prepared.promptTemplateVersion,
                promptSha256: prepared.promptSha256,
                ...(prepared.conceptSnapshot ? { conceptSnapshot: prepared.conceptSnapshot } : {}),
            }
        }
        if (!prompt) throw new FluxImageGenerationServiceError('FLUX_RESULT_IMAGE_INVALID', 'Il prompt Seedream non e disponibile per il secondo passaggio.')
        const submission = await input.provider.submitSeedreamDiagnostic({
            prompt,
            sourceUrl,
            parameters: workflow.parameters,
            webhookUrl: falWebhookUrl(),
        })
        await input.repository.updateRunningFalSubmission({
            requestId: input.record.id,
            profileId: input.record.profileId,
            data: {
                provider: submission.provider,
                model: submission.model,
                providerRequestId: submission.providerRequestId,
                falWorkflow: { ...workflow, chainStep: 2 },
                expectedProviderRequestId: input.record.providerRequestId,
                incrementAttempt: true,
                ...(refreshedPrompt ? refreshedPrompt : {}),
            },
        })
        return
    }
    const downloaded = await input.provider.downloadQueuedImage(input.image)
    console.info('fal.finalizer.image_downloaded', { providerRequestId: input.record.providerRequestId, mimeType: downloaded.mimeType, bytes: downloaded.bytes.byteLength })
    const dimensions = seedreamImageDimensions(downloaded)
    await input.storage.saveRawResult({ profileId: input.record.profileId, idempotencyKey: input.record.idempotencyKey, image: downloaded.bytes, mimeType: downloaded.mimeType })
    await input.repository.markSucceeded({
        requestId: input.record.id,
        profileId: input.record.profileId,
        data: {
            provider: 'fal.ai',
            model: FAL_SEEDREAM_MODEL,
            providerRequestId: input.record.providerRequestId,
            sourceSha256: input.record.sourceSha256 ?? undefined,
            resultSha256: await sha256Hex(downloaded.bytes),
            resultPath: await input.storage.createRawResultObjectPath(input.record.profileId, input.record.idempotencyKey, downloaded.mimeType),
            resultMimeType: downloaded.mimeType,
            resultWidth: dimensions.width,
            resultHeight: dimensions.height,
            generationLatencyMs: 0,
            assetReadiness: 'EXPERIMENT_ONLY',
            validationWarnings: ['SEEDREAM_DIAGNOSTIC', `chain:${workflow.chainMode}`, ...(downloaded.mimeType === 'image/jpeg' ? ['SEEDREAM_PROVIDER_JPEG'] : [])],
        },
    })
}

Deno.serve(async (request) => {
    if (request.method !== 'POST') return json(405)
    const requiredSecret = Deno.env.get('FAL_FINALIZER_SHARED_SECRET')?.trim()
    if (!requiredSecret || request.headers.get('x-fal-finalizer-secret') !== requiredSecret) return json(401)
    const body = await request.json().catch(() => null) as { providerRequestId?: unknown, image?: unknown } | null
    const providerRequestId = safeText(body?.providerRequestId, 256)
    const image = readImage(body?.image)
    if (!providerRequestId || !image) return json(400)
    console.info('fal.finalizer.received', { providerRequestId })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) return json(500)
    const policy = readCreatureTransformationLabPolicy((name) => Deno.env.get(name))
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
    const repository = new SupabaseCreatureTransformationRequestRepository(supabaseAdmin as unknown as CreatureTransformationRequestRepositoryClient)
    const visualRepository = new SupabaseCreatureVisualProgressionRepository(supabaseAdmin as unknown as CreatureVisualProgressionRepositoryClient)
    const storage = new SupabaseCreatureTransformationStorageAdapter(supabaseAdmin.storage as unknown as CreatureTransformationStorageClient, { signedUrlTtlSeconds: policy.signedUrlTtlSeconds })
    const claim = await repository.claimFalFinalization({ providerRequestId })
    if (claim.outcome !== 'CLAIMED') return json(202)
    const record = claim.record
    const workflow = parseFalQueueWorkflow(record.falWorkflow)
    if (!workflow || !record.model) {
        await failRequest(repository, visualRepository, record, new FluxImageGenerationServiceError('FLUX_RESULT_IMAGE_INVALID', 'Il workflow Fal persistito non e valido.'))
        return json(202)
    }
    console.info('fal.finalizer.claimed', { providerRequestId, kind: workflow.kind })
    const providerPolicy = workflow.kind === 'FLUX' ? policy.flux : policy.seedream
    if (!providerPolicy.apiKey) {
        await failRequest(repository, visualRepository, record, new FluxImageGenerationServiceError('FAL_FLUX_NOT_CONFIGURED', 'La chiave del provider persistito non e configurata.'))
        return json(202)
    }
    const provider = new FalFluxImageProvider({
        apiKey: providerPolicy.apiKey,
        model: record.model,
        timeoutMs: providerPolicy.timeoutMs,
        estimatedCostUsd: providerPolicy.estimatedCostUsd ?? undefined,
    })
    try {
        const resolver = new SupabaseCreatureIdentityResolver(createPlayerRepository(supabaseAdmin))
        if (workflow.kind === 'FLUX') {
            await finalizeFlux({ record, image, provider, repository, storage, visualRepository, resolver, policy })
        } else if (workflow.kind === 'SEEDREAM_PRODUCTION') {
            await finalizeSeedreamProduction({
                record,
                image,
                provider,
                repository,
                storage,
                visualRepository,
                resolver,
                sourceUrlTtlSeconds: policy.seedream.submissionSourceUrlTtlSeconds,
            })
        } else {
            const microConceptGenerator = workflow.conceptSource === 'dynamic'
                ? new FluxMicroConceptGenerator({ apiKey: policy.flux.microConceptApiKey ?? '', model: policy.flux.microConceptModel ?? '' })
                : null
            await finalizeSeedream({ record, image, provider, repository, storage, resolver, microConceptGenerator, sourceUrlTtlSeconds: policy.seedream.submissionSourceUrlTtlSeconds })
        }
    } catch (error) {
        console.error('fal.finalizer.failed', {
            providerRequestId,
            reason: error instanceof Error ? error.message.slice(0, 300) : 'unknown',
            cause: error instanceof Error && error.cause instanceof Error ? error.cause.message.slice(0, 300) : undefined,
        })
        await failRequest(repository, visualRepository, record, error)
    }
    return json(202)
})
