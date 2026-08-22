import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

import { ImageValidator, sha256Hex } from '../../../shared/creature-transformations/image-validator.ts'
import { buildFluxEvolutionPlan } from '../../../shared/creature-transformations/flux-evolution/evolution-plan.ts'
import { getBodyPlan, resolveCanonicalBodyPlan } from '../../../shared/creature-transformations/flux-evolution/body-plan-registry.ts'
import { SupabaseCreatureIdentityResolver, type PlayerCreatureRepository } from '../generate-creature-transformation/supabase-creature-identity-resolver.ts'
import { SupabaseCreatureTransformationStorageAdapter, type CreatureTransformationStorageClient } from '../generate-creature-transformation/supabase-creature-transformation-storage.ts'
import { SupabaseCreatureTransformationRequestRepository, type CreatureTransformationRequestRepositoryClient, type CreatureTransformationRequestRecord } from '../generate-creature-transformation/creature-transformation-request-repository.ts'
import { SupabaseCreatureVisualProgressionRepository, type CreatureVisualProgressionRepositoryClient } from '../generate-creature-transformation/creature-visual-progression-repository.ts'
import { FalFluxImageProvider, type FalQueuedImage } from '../generate-creature-transformation/fal-flux-image-provider.ts'
import { appendFalWebhookCallbackToken } from '../generate-creature-transformation/fal-webhook-callback-token.ts'
import { FLUX_MAX_CROP_RETRIES, FLUX_SUBJECT_MARGIN_RATIO, FluxImageGenerationServiceError } from '../generate-creature-transformation/flux-image-generation-service.ts'
import { composeSeedreamQueuePrompt, fluxMicroConceptFromSnapshot } from '../generate-creature-transformation/fal-queue-submission-service.ts'
import { parseFalQueueWorkflow } from '../generate-creature-transformation/fal-queue-workflow.ts'
import { readCreatureEvolutionPolicy } from '../generate-creature-transformation/evolution-policy.ts'
import { redactErrorMessage, redactSensitiveText } from '../generate-creature-transformation/secret-redaction.ts'
import { isFluxEvolutionSnapshot, readBodyPlanMutationId, readFluxSnapshotCapability } from '../../../shared/creature-transformations/flux-evolution/micro-concept.ts'
import type { VisualTraitId } from '../../../shared/creature-transformations/visual-traits.ts'
import type { EvolutionFunctionId, EvolutionTargetId } from '../../../shared/creature-transformations/evolution-targets.ts'
import { applyHorizontalMirrorCorrection, decideHorizontalMirrorCorrection, parseVisualInspection, shouldRejectSeedreamCenterFacing, type VisualInspection, visualRepairBrief } from '../../../shared/creature-transformations/visual-inspection.ts'
import { GeminiVisualInspectionService, readGeminiVisualInspectionConfiguration } from './gemini-visual-inspection-service.ts'
import { flipImageHorizontallyToPng } from '../generate-creature-transformation/edge-image-codec.ts'

/**
 * This function deliberately carries no generated database types: every row that crosses a
 * boundary is narrowed by hand in `createPlayerRepository` and in the repositories it delegates
 * to. Declaring the schema as `any` states that intent, and keeps the type checker seeing row
 * objects rather than `never`.
 */
type SupabaseAdminClient = ReturnType<typeof createClient<any>>

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

function createPlayerRepository(supabaseAdmin: SupabaseAdminClient): PlayerCreatureRepository {
    // Annotated rather than cast at the end: the interface then supplies the parameter types, so
    // a signature drifting from `PlayerCreatureRepository` is a compile error instead of an `any`.
    const repository: PlayerCreatureRepository = {
        async findByCreatureId(creatureId) {
            const { data, error } = await supabaseAdmin.from('player_creatures').select('id, profile_id, base_creature_key, current_visual_version_id').eq('id', creatureId).maybeSingle()
            if (error) throw error
            return data ? {
                id: String(data.id), profileId: String(data.profile_id), baseCreatureKey: String(data.base_creature_key),
                currentVisualVersionId: typeof data.current_visual_version_id === 'string' ? data.current_visual_version_id : null,
            } : null
        },
        async findCurrentVisualVersion({ creatureId, versionId }) {
            const { data, error } = await supabaseAdmin.from('creature_visual_versions').select('id, creature_id, asset_path, asset_sha256, version_number, visual_trait_id, visual_inspection').eq('id', versionId).eq('creature_id', creatureId).eq('status', 'ACTIVE').maybeSingle()
            if (error) throw error
            return data ? {
                id: String(data.id), creatureId: String(data.creature_id), assetPath: String(data.asset_path), assetSha256: String(data.asset_sha256), versionNumber: Number(data.version_number),
                isBaseVersion: !/^(?:[A-Za-z0-9-]{1,128}\/[a-f0-9]{64}|experiments\/raw\/[A-Za-z0-9-]{1,128}\/[a-f0-9]{64}|candidates\/[A-Za-z0-9-]{1,128}\/[a-f0-9]{64}|cleanup\/[a-f0-9]{64})\.png$/.test(String(data.asset_path)),
                visualInspection: parseVisualInspection(data.visual_inspection),
            } : null
        },
        async listPreviousTransformations(creatureId) {
            const { data, error } = await supabaseAdmin.from('creature_visual_versions').select('version_number, visual_trait_id, evolution_target_id, evolution_function, concept_name, concept_snapshot').eq('creature_id', creatureId).not('visual_trait_id', 'is', null).in('status', ['ACTIVE', 'SUPERSEDED']).order('version_number', { ascending: false })
            if (error) throw error
            // The identifier columns are constrained database-side; the casts mirror the sibling
            // repository in generate-creature-transformation/index.ts.
            return [...(data ?? [])].reverse().flatMap((entry) => typeof entry.visual_trait_id === 'string' && typeof entry.concept_name === 'string'
                ? [{ versionNumber: Number(entry.version_number), visualTraitId: entry.visual_trait_id as VisualTraitId, conceptName: entry.concept_name, evolutionTargetId: typeof entry.evolution_target_id === 'string' ? entry.evolution_target_id as EvolutionTargetId : null, evolutionFunction: typeof entry.evolution_function === 'string' ? entry.evolution_function as EvolutionFunctionId : null, ...(entry.concept_snapshot && typeof entry.concept_snapshot === 'object' && typeof (entry.concept_snapshot as { mutationIdea?: unknown }).mutationIdea === 'string' ? { mutationIdea: (entry.concept_snapshot as { mutationIdea: string }).mutationIdea } : {}) }]
                : [])
        },
    }
    return repository
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
        console.error('fal.finalizer.track_restore_failed', { transformationRequestId: record.id, reason: redactErrorMessage(error) })
    }
}

async function failRequest(repository: SupabaseCreatureTransformationRequestRepository, visualRepository: SupabaseCreatureVisualProgressionRepository, record: CreatureTransformationRequestRecord, error: unknown) {
    const code = error instanceof FluxImageGenerationServiceError ? error.code : error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : 'FAL_FINALIZATION_FAILED'
    const message = error instanceof FluxImageGenerationServiceError
        ? redactSensitiveText(error.message)
        : 'La finalizzazione Fal non e riuscita.'
    try { await repository.markFailed({ requestId: record.id, profileId: record.profileId, errorCode: code, errorMessage: message }) } catch { /* terminal/duplicate requests are already safe */ }
    await restoreTrack(visualRepository, record)
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
    const prompt = await composeSeedreamQueuePrompt({ identity: source.identity, plan, concept, framingAttempt: input.record.attemptCount, repairBrief: visualRepairBrief(source.visualInspection) })
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

async function inspectSeedreamVisual(input: {
    record: CreatureTransformationRequestRecord
    image: Uint8Array<ArrayBuffer>
    mimeType: 'image/png' | 'image/jpeg'
    resolver: SupabaseCreatureIdentityResolver
}): Promise<Readonly<{
    inspection: VisualInspection
    generation: number
}> | null> {
    try {
        const source = await input.resolver.resolve({ profileId: input.record.profileId, creatureId: input.record.creatureId })
        const snapshot = isFluxEvolutionSnapshot(input.record.conceptSnapshot) ? input.record.conceptSnapshot : null
        const bodyPlan = snapshot?.resultBodyPlanId
            ? getBodyPlan(snapshot.resultBodyPlanId)
            : source.bodyPlan ?? resolveCanonicalBodyPlan({ baseCreatureKey: source.identity.baseCreatureKey, adoptedBodyPlanMutationIds: source.adoptedBodyPlanMutationIds })
        if (!bodyPlan) return null
        const orientation = source.visualInspection?.observedVisualState?.orientation
        const inspection = await new GeminiVisualInspectionService(readGeminiVisualInspectionConfiguration((name) => Deno.env.get(name))).inspect({
            image: input.image,
            mimeType: input.mimeType,
            bodyPlan,
            generation: source.currentVersionNumber + 1,
            previous: source.visualInspection,
            expectedOrientation: orientation ? `${orientation.viewpoint}/${orientation.facing}` : null,
        })
        console.info('fal.finalizer.seedream_visual_inspection', {
            providerRequestId: input.record.providerRequestId,
            detector: inspection.anomalyDetector.status,
            mapper: inspection.stateMapper.status,
            anomalies: inspection.visualAnomalies.filter((anomaly) => anomaly.status === 'UNRESOLVED').length,
        })
        return Object.freeze({ inspection, generation: source.currentVersionNumber + 1 })
    } catch (error) {
        console.warn('fal.finalizer.seedream_visual_inspection_unavailable', {
            providerRequestId: input.record.providerRequestId,
            reason: redactErrorMessage(error, 180),
        })
        return null
    }
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
    let dimensions = seedreamProductionDimensions({ ...downloaded, expected: workflow.parameters.imageSize })
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
    const visualInspection = await inspectSeedreamVisual({
        record: input.record,
        image: downloaded.bytes,
        mimeType: downloaded.mimeType,
        resolver: input.resolver,
    })
    // `shouldRejectSeedreamCenterFacing` is false for a missing inspection, so guarding on the
    // inspection itself keeps the same behaviour while making the reads below provably safe.
    if (visualInspection && shouldRejectSeedreamCenterFacing(visualInspection.inspection)) {
        console.warn('fal.finalizer.seedream_orientation_rejected', {
            providerRequestId: input.record.providerRequestId,
            facing: 'CENTER',
            detector: visualInspection.inspection.anomalyDetector.status,
            mapper: visualInspection.inspection.stateMapper.status,
        })
        throw new FluxImageGenerationServiceError('SEEDREAM_CENTER_FACING', 'Output Seedream scartato: Vision ha rilevato una posa frontale/centrale.')
    }
    let rawImage: Readonly<{ bytes: Uint8Array, mimeType: 'image/png' | 'image/jpeg' }> = downloaded
    let persistedInspection = visualInspection?.inspection ?? null
    let mirrorCorrectionApplied = false
    if (visualInspection) {
        const mirrorDecision = decideHorizontalMirrorCorrection({ inspection: visualInspection.inspection })
        if (mirrorDecision.action === 'FLIP') {
            const mirrored = await flipImageHorizontallyToPng({ bytes: downloaded.bytes, mimeType: downloaded.mimeType })
            dimensions = seedreamProductionDimensions({ ...mirrored, expected: workflow.parameters.imageSize })
            rawImage = mirrored
            resultSha256 = await sha256Hex(mirrored.bytes)
            persistedInspection = applyHorizontalMirrorCorrection({
                inspection: visualInspection.inspection,
                outputFacing: mirrorDecision.outputFacing!,
                correctedFacing: 'IMAGE_RIGHT',
                generation: visualInspection.generation,
                appliedAt: new Date().toISOString(),
            })
            mirrorCorrectionApplied = true
            console.info('fal.finalizer.seedream_horizontal_mirror_corrected', {
                providerRequestId: input.record.providerRequestId,
                outputFacing: mirrorDecision.outputFacing,
                sourceMimeType: downloaded.mimeType,
                persistedMimeType: mirrored.mimeType,
            })
        }
    }
    await input.storage.saveRawResult({ profileId: input.record.profileId, idempotencyKey: input.record.idempotencyKey, image: rawImage.bytes, mimeType: rawImage.mimeType })
    let completed = await input.repository.markSucceeded({
        requestId: input.record.id,
        profileId: input.record.profileId,
        data: {
            provider: 'fal.ai',
            // The transition payload uses optional fields; the record uses nullable columns.
            model: input.record.model ?? undefined,
            providerRequestId: input.record.providerRequestId,
            sourceSha256: input.record.sourceSha256,
            resultSha256,
            resultPath: await input.storage.createRawResultObjectPath(input.record.profileId, input.record.idempotencyKey, rawImage.mimeType),
            resultMimeType: rawImage.mimeType,
            resultWidth: dimensions.width,
            resultHeight: dimensions.height,
            generationLatencyMs: 0,
            assetReadiness: 'EXPERIMENT_ONLY',
            validationWarnings: [
                'BACKGROUND_REMOVAL_PENDING_CLIENT',
                ...(downloaded.mimeType === 'image/jpeg' ? ['SEEDREAM_PROVIDER_JPEG'] : []),
                ...(mirrorCorrectionApplied ? ['SEEDREAM_HORIZONTAL_MIRROR_CORRECTED'] : []),
            ],
        },
    })
    // Inspection is fail-open metadata. The visual-progress track remains pending until this
    // persistence attempt has completed, so browser background removal reads the corrected raw.
    if (persistedInspection) {
        try {
            completed = await input.repository.recordVisualInspection({ requestId: completed.id, profileId: completed.profileId, visualInspection: persistedInspection })
        } catch (error) {
            console.warn('fal.finalizer.seedream_visual_inspection_persistence_unavailable', {
                providerRequestId: input.record.providerRequestId,
                reason: redactErrorMessage(error, 180),
            })
        }
    }
    if (completed.visualProgressTrackId) await input.visualRepository.markBackgroundRemovalPending({ profileId: completed.profileId, trackId: completed.visualProgressTrackId, requestId: completed.id })
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
    const policy = readCreatureEvolutionPolicy((name) => Deno.env.get(name))
    const supabaseAdmin = createClient<any>(supabaseUrl, serviceRoleKey)
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
    const providerPolicy = policy.seedream
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
    } catch (error) {
        console.error('fal.finalizer.failed', {
            providerRequestId,
            reason: redactErrorMessage(error),
            cause: error instanceof Error && error.cause instanceof Error ? redactErrorMessage(error.cause) : undefined,
        })
        await failRequest(repository, visualRepository, record, error)
    }
    return json(202)
})
