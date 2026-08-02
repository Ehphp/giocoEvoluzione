import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import {
    AiCreatureConceptGenerator,
    type CreatureConceptGenerator,
    type CreatureTransformationErrorResponse,
    type GenerateConceptRequest,
    MockCreatureImageProvider,
    MockCreatureConceptGenerator,
    NoopImagePostProcessor,
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
import { OpenAiCreatureImageProvider } from './openai-creature-image-provider.ts'

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
                .select('id, profile_id, base_creature_key')
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
            }
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
    const resolver = new SupabaseCreatureIdentityResolver(createRepository(supabaseAdmin, requestId))
    const storage = new SupabaseCreatureTransformationStorageAdapter(
        supabaseAdmin.storage as unknown as CreatureTransformationStorageClient,
        { signedUrlTtlSeconds: policy.signedUrlTtlSeconds },
    )
    const requestRepository = new SupabaseCreatureTransformationRequestRepository(supabaseAdmin as unknown as CreatureTransformationRequestRepositoryClient)
    const result = await orchestrateCreatureTransformation({
        profileId: authData.user.id,
        requestId,
        body,
        policy,
        resolver,
        createGenerator,
        storage,
        createImageProvider: () => new MockCreatureImageProvider(),
        createRealImageProvider: () => new OpenAiCreatureImageProvider({
            apiKey: policy.realImage.apiKey!, model: policy.realImage.model!, quality: policy.realImage.quality,
            timeoutMs: policy.realImage.timeoutMs, estimatedCostUsd: policy.realImage.estimatedCostUsd!,
        }),
        deferBackgroundTask: (task) => EdgeRuntime.waitUntil(task),
        postProcessor: new NoopImagePostProcessor(),
        repository: requestRepository,
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
        transformationRequestId: result.requestPersistence.transformationRequestId,
        operation: (body && typeof body === 'object' ? (body as { operation?: unknown }).operation : undefined),
        status: result.requestPersistence.status,
        ...('generation' in result ? {
            provider: 'provider' in result.generation ? result.generation.provider : result.generation.generator,
            model: result.generation.model,
            latencyMs: result.generation.latencyMs,
        } : {}),
    })
    return json(result)
})
