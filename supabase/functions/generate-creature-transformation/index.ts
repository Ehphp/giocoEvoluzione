import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import type { CreatureTransformationErrorResponse } from '../../../shared/creature-transformations/api-contracts.ts'
import { readBodyPlanMutationId } from '../../../shared/creature-transformations/flux-evolution/micro-concept.ts'
import type { VisualTraitId } from '../../../shared/creature-transformations/visual-traits.ts'
import type { EvolutionFunctionId, EvolutionTargetId } from '../../../shared/creature-transformations/evolution-targets.ts'
import { SupabaseCreatureIdentityResolver, type PlayerCreatureRepository } from './supabase-creature-identity-resolver.ts'
import { readCreatureTransformationLabPolicy } from './lab-policy.ts'
import { getCreatureTransformationFailureStatus, orchestrateCreatureTransformation } from './edge-orchestration.ts'
import { getSafeDatabaseLookupCode } from './database-lookup-diagnostics.ts'
import {
    SupabaseCreatureTransformationStorageAdapter,
    type CreatureTransformationStorageClient,
} from './supabase-creature-transformation-storage.ts'
import {
    SupabaseCreatureTransformationRequestRepository,
    type CreatureTransformationRequestRepositoryClient,
} from './creature-transformation-request-repository.ts'
import { FalFluxImageProvider } from './fal-flux-image-provider.ts'
import { appendFalWebhookCallbackToken } from './fal-webhook-callback-token.ts'
import { FluxMicroConceptGenerator } from './flux-micro-concept-generator.ts'
import { SupabaseCreatureVisualProgressionRepository, type CreatureVisualProgressionRepositoryClient } from './creature-visual-progression-repository.ts'

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS })
}

function errorResponse(requestId: string, code: string, message: string, status: number, problems?: CreatureTransformationErrorResponse['problems']): Response {
    return json({
        success: false,
        requestId,
        code,
        message,
        ...(problems?.length ? { problems } : {}),
    } satisfies CreatureTransformationErrorResponse, status)
}

function createRepository(supabaseAdmin: ReturnType<typeof createClient>, requestId: string): PlayerCreatureRepository {
    return {
        async findByCreatureId(creatureId) {
            const { data, error } = await supabaseAdmin
                .from('player_creatures')
                .select('id, profile_id, base_creature_key, current_visual_version_id')
                .eq('id', creatureId)
                .maybeSingle()
            if (error) {
                console.error('Creature transformation player_creatures lookup failed', {
                    requestId,
                    databaseCode: getSafeDatabaseLookupCode(error),
                })
                throw error
            }
            if (!data) return null
            return {
                id: String(data.id),
                profileId: String(data.profile_id),
                baseCreatureKey: String(data.base_creature_key),
                currentVisualVersionId: typeof data.current_visual_version_id === 'string' ? data.current_visual_version_id : null,
            }
        },
        async findCurrentVisualVersion({ creatureId, versionId }) {
            const { data, error } = await supabaseAdmin
                .from('creature_visual_versions')
                .select('id, creature_id, asset_path, asset_sha256, version_number, visual_trait_id')
                .eq('id', versionId)
                .eq('creature_id', creatureId)
                .eq('status', 'ACTIVE')
                .maybeSingle()
            if (error) throw error
            if (!data) return null
            return {
                id: String(data.id), creatureId: String(data.creature_id), assetPath: String(data.asset_path),
                assetSha256: String(data.asset_sha256), versionNumber: Number(data.version_number), isBaseVersion: !/^(?:[A-Za-z0-9-]{1,128}\/[a-f0-9]{64}|experiments\/raw\/[A-Za-z0-9-]{1,128}\/[a-f0-9]{64}|candidates\/[A-Za-z0-9-]{1,128}\/[a-f0-9]{64}|cleanup\/[a-f0-9]{64})\.png$/.test(String(data.asset_path)),
            }
        },
        async listPreviousTransformations(creatureId) {
            const { data, error } = await supabaseAdmin
                .from('creature_visual_versions')
                .select('version_number, visual_trait_id, evolution_target_id, evolution_function, concept_name, concept_snapshot')
                .eq('creature_id', creatureId)
                .not('visual_trait_id', 'is', null)
                .in('status', ['ACTIVE', 'SUPERSEDED'])
                .order('version_number', { ascending: false })
            if (error) throw error
            return [...(data ?? [])].reverse().flatMap((entry) => {
                if (typeof entry.visual_trait_id !== 'string' || typeof entry.concept_name !== 'string') return []
                const snapshot = entry.concept_snapshot && typeof entry.concept_snapshot === 'object' ? entry.concept_snapshot as Record<string, unknown> : null
                const bodyPlanMutationId = readBodyPlanMutationId(snapshot)
                return [{
                    versionNumber: Number(entry.version_number),
                    visualTraitId: entry.visual_trait_id as VisualTraitId,
                    conceptName: entry.concept_name,
                    evolutionTargetId: typeof entry.evolution_target_id === 'string' ? entry.evolution_target_id as EvolutionTargetId : null,
                    evolutionFunction: typeof entry.evolution_function === 'string' ? entry.evolution_function as EvolutionFunctionId : null,
                    ...(snapshot && typeof snapshot.mutationIdea === 'string' ? { mutationIdea: snapshot.mutationIdea } : {}),
                    ...(bodyPlanMutationId ? { bodyPlanMutationId } : {}),
                }]
            })
        },
    }
}

Deno.serve(async (request) => {
    const requestId = crypto.randomUUID()
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
    if (request.method !== 'POST') return errorResponse(requestId, 'METHOD_NOT_ALLOWED', 'Sono consentiti solo POST e OPTIONS.', 405)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
        console.error('Creature transformation configuration error', { requestId, code: 'INTERNAL_ERROR' })
        return errorResponse(requestId, 'INTERNAL_ERROR', 'Configurazione server non disponibile.', 500)
    }

    const authorization = request.headers.get('authorization') ?? ''
    if (!authorization) return errorResponse(requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.', 401)

    const authenticatedClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authorization } },
    })
    const { data: authData, error: authError } = await authenticatedClient.auth.getUser()
    if (authError || !authData.user) return errorResponse(requestId, 'UNAUTHENTICATED', 'Autenticazione richiesta.', 401)

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return errorResponse(requestId, 'INVALID_REQUEST', 'Il body deve essere JSON valido.', 400)
    }
    const policy = readCreatureTransformationLabPolicy((name) => Deno.env.get(name))
    const falWebhookBaseUrl = Deno.env.get('FAL_CREATURE_TRANSFORMATION_WEBHOOK_URL')?.trim()
        || `${supabaseUrl}/functions/v1/fal-creature-transformation-webhook`
    const falWebhookCallbackToken = Deno.env.get('FAL_WEBHOOK_CALLBACK_TOKEN')?.trim()
    let falWebhookUrl: string
    try {
        falWebhookUrl = appendFalWebhookCallbackToken({ webhookUrl: falWebhookBaseUrl, token: falWebhookCallbackToken ?? '' })
    } catch {
        console.error('Creature transformation configuration error', { requestId, code: 'FAL_WEBHOOK_CALLBACK_TOKEN_INVALID' })
        return errorResponse(requestId, 'INTERNAL_ERROR', 'Configurazione callback Fal non disponibile.', 500)
    }
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)
    const { data: authorizationProfile, error: authorizationProfileError } = await supabaseAdmin
        .from('profiles')
        .select('can_generate_images')
        .eq('id', authData.user.id)
        .maybeSingle()
    if (authorizationProfileError) {
        const databaseCode = getSafeDatabaseLookupCode(authorizationProfileError)
        console.error('Creature transformation authorization lookup failed', { requestId, code: 'INTERNAL_ERROR' })
        return errorResponse(requestId, `AUTHORIZATION_PROFILE_LOOKUP_FAILED_${databaseCode}`, 'Autorizzazione server non disponibile.', 500)
    }
    const resolver = new SupabaseCreatureIdentityResolver(createRepository(supabaseAdmin, requestId))
    const storage = new SupabaseCreatureTransformationStorageAdapter(
        supabaseAdmin.storage as unknown as CreatureTransformationStorageClient,
        { signedUrlTtlSeconds: policy.signedUrlTtlSeconds },
    )
    const requestRepository = new SupabaseCreatureTransformationRequestRepository(supabaseAdmin as unknown as CreatureTransformationRequestRepositoryClient)
    const visualRepository = new SupabaseCreatureVisualProgressionRepository(supabaseAdmin as unknown as CreatureVisualProgressionRepositoryClient)
    const result = await orchestrateCreatureTransformation({
        profileId: authData.user.id,
        canGenerateImages: authorizationProfile?.can_generate_images === true,
        requestId,
        body,
        policy,
        resolver,
        storage,
        createFluxMicroConceptGenerator: () => new FluxMicroConceptGenerator({
            apiKey: policy.flux.microConceptApiKey ?? '',
            model: policy.flux.microConceptModel ?? '',
        }),
        createFalFluxImageProvider: () => new FalFluxImageProvider({
            apiKey: policy.flux.apiKey ?? '', model: policy.flux.model,
            timeoutMs: policy.flux.timeoutMs,
            estimatedCostUsd: policy.flux.estimatedCostUsd ?? undefined,
        }),
        createSeedreamEvolutionProvider: () => new FalFluxImageProvider({
            apiKey: policy.seedream.apiKey ?? '', model: policy.seedream.model,
            timeoutMs: policy.seedream.timeoutMs,
            estimatedCostUsd: policy.seedream.estimatedCostUsd ?? undefined,
        }),
        createSeedreamDiagnosticProvider: () => new FalFluxImageProvider({
            apiKey: policy.seedream.apiKey ?? '',
            model: policy.seedream.model,
            timeoutMs: policy.seedream.timeoutMs,
            estimatedCostUsd: policy.seedream.estimatedCostUsd ?? undefined,
        }),
        falWebhookUrl,
        repository: requestRepository,
        visualRepository,
    })
    if (!result.success) {
        console.error('Creature transformation request failed', {
            requestId,
            transformationRequestId: result.requestPersistence?.transformationRequestId,
            operation: (body && typeof body === 'object' ? (body as { operation?: unknown }).operation : undefined),
            status: result.requestPersistence?.status,
            errorCode: result.code,
        })
        return json(result, getCreatureTransformationFailureStatus(result.code))
    }
    const operation = body && typeof body === 'object' ? (body as { operation?: unknown }).operation : undefined
    if ('accepted' in result && result.accepted) {
        console.info('Creature transformation generation accepted', {
            requestId,
            transformationRequestId: result.requestPersistence.transformationRequestId,
            operation,
            status: result.requestPersistence.status,
        })
        return json(result, 202)
    }
    console.info('Creature transformation request completed', {
        requestId,
        transformationRequestId: 'requestPersistence' in result ? result.requestPersistence.transformationRequestId : undefined,
        operation,
        status: 'requestPersistence' in result ? result.requestPersistence.status : undefined,
        ...('generation' in result && result.generation ? {
            provider: result.generation.provider,
            model: result.generation.model,
            latencyMs: result.generation.latencyMs,
        } : {}),
    })
    return json(result)
})
