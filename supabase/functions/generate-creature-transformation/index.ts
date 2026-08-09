import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import {
    AiCreatureConceptGenerator,
    type CreatureConceptGenerator,
    type CreatureTransformationErrorResponse,
    type GenerateConceptRequest,
    MockCreatureImageProvider,
    MockCreatureConceptGenerator,
} from '../../../shared/creature-transformations/index.ts'
import { SupabaseCreatureIdentityResolver, type PlayerCreatureRepository } from './supabase-creature-identity-resolver.ts'
import { readCreatureTransformationLabPolicy } from './lab-policy.ts'
import { OpenAiStructuredConceptModel } from './openai-structured-concept-model.ts'
import { getGenerateConceptFailureStatus, orchestrateCreatureTransformation } from './edge-orchestration.ts'
import { getSafeDatabaseLookupCode } from './database-lookup-diagnostics.ts'
import {
    SupabaseCreatureTransformationStorageAdapter,
    type CreatureTransformationStorageClient,
} from './supabase-creature-transformation-storage.ts'
import {
    SupabaseCreatureTransformationRequestRepository,
    type CreatureTransformationRequestRepositoryClient,
} from './creature-transformation-request-repository.ts'
import {
    SupabaseExperimentReviewRepository,
    type ExperimentReviewRepositoryClient,
} from './experiment-review-repository.ts'
import { OpenAiCreatureImageProvider } from './openai-creature-image-provider.ts'
import { SupabaseCreatureVisualProgressionRepository, type CreatureVisualProgressionRepositoryClient } from './creature-visual-progression-repository.ts'

declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void }

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
                .select('version_number, visual_trait_id, evolution_target_id, evolution_function, mutation_archetype, primary_body_area, supporting_body_areas, concept_name')
                .eq('creature_id', creatureId)
                .not('visual_trait_id', 'is', null)
                .in('status', ['ACTIVE', 'SUPERSEDED'])
                .order('version_number', { ascending: true })
                .limit(8)
            if (error) throw error
            return (data ?? []).flatMap((entry) => (
                typeof entry.visual_trait_id === 'string' && typeof entry.concept_name === 'string'
                    ? [{
                        versionNumber: Number(entry.version_number),
                        visualTraitId: entry.visual_trait_id as import('../../../shared/creature-transformations/visual-traits.ts').VisualTraitId,
                        conceptName: entry.concept_name,
                        evolutionTargetId: typeof entry.evolution_target_id === 'string' ? entry.evolution_target_id as import('../../../shared/creature-transformations/evolution-targets.ts').EvolutionTargetId : null,
                        evolutionFunction: typeof entry.evolution_function === 'string' ? entry.evolution_function as import('../../../shared/creature-transformations/evolution-targets.ts').EvolutionFunctionId : null,
                        mutationArchetype: typeof entry.mutation_archetype === 'string' ? entry.mutation_archetype as import('../../../shared/creature-transformations/mutation-archetypes.ts').MutationArchetype : null,
                        primaryBodyArea: typeof entry.primary_body_area === 'string' ? entry.primary_body_area as import('../../../shared/creature-transformations/body-areas.ts').BodyArea : null,
                        supportingBodyAreas: Array.isArray(entry.supporting_body_areas) ? entry.supporting_body_areas.filter((area): area is import('../../../shared/creature-transformations/body-areas.ts').BodyArea => typeof area === 'string') : [],
                    }]
                    : []
            ))
        },
    }
}

function createGenerator(conceptMode: GenerateConceptRequest['conceptMode']): CreatureConceptGenerator {
    if (conceptMode === 'MOCK') return new MockCreatureConceptGenerator()

    const apiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
    const model = Deno.env.get('OPENAI_CONCEPT_MODEL') ?? ''
    const structuredModel = new OpenAiStructuredConceptModel({ apiKey, model })
    return new AiCreatureConceptGenerator(structuredModel, {
        generatorName: 'openai-structured-concept-generator',
        modelName: model,
    })
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
    const reviewRepository = new SupabaseExperimentReviewRepository(supabaseAdmin as unknown as ExperimentReviewRepositoryClient)
    const visualRepository = new SupabaseCreatureVisualProgressionRepository(supabaseAdmin as unknown as CreatureVisualProgressionRepositoryClient)
    const result = await orchestrateCreatureTransformation({
        profileId: authData.user.id,
        canGenerateImages: authorizationProfile?.can_generate_images === true,
        requestId,
        body,
        policy,
        resolver,
        createGenerator,
        storage,
        createImageProvider: () => new MockCreatureImageProvider(),
        createRealImageProvider: (configuration) => new OpenAiCreatureImageProvider({
            apiKey: policy.realImage.apiKey!, model: configuration?.model ?? policy.realImage.model!, quality: configuration?.quality ?? policy.realImage.quality,
            timeoutMs: policy.realImage.timeoutMs, estimatedCostUsd: configuration?.estimatedCostUsd ?? policy.realImage.estimatedCostUsd!,
        }),
        deferBackgroundTask: (task) => EdgeRuntime.waitUntil(task),
        repository: requestRepository,
        reviewRepository,
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
        return json(result, getGenerateConceptFailureStatus(result.code))
    }
    if ('accepted' in result && result.accepted) {
        console.info('Creature transformation real image accepted', {
            requestId,
            transformationRequestId: result.requestPersistence.transformationRequestId,
            operation: 'GENERATE_IMAGE',
            status: result.requestPersistence.status,
        })
        return json(result, 202)
    }
    console.info('Creature transformation request completed', {
        requestId,
        transformationRequestId: 'requestPersistence' in result ? result.requestPersistence.transformationRequestId : undefined,
        operation: (body && typeof body === 'object' ? (body as { operation?: unknown }).operation : undefined),
        status: 'requestPersistence' in result ? result.requestPersistence.status : undefined,
        ...('generation' in result ? {
            provider: 'provider' in result.generation ? result.generation.provider : result.generation.generator,
            model: result.generation.model,
            latencyMs: result.generation.latencyMs,
        } : {}),
    })
    return json(result)
})
