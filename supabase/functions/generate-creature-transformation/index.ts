import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import {
    AiCreatureConceptGenerator,
    type CreatureConceptGenerator,
    type GenerateConceptErrorResponse,
    type GenerateConceptRequest,
    MockCreatureConceptGenerator,
} from '../../../shared/creature-transformations/index.ts'
import { SupabaseCreatureIdentityResolver, type PlayerCreatureRepository } from './supabase-creature-identity-resolver.ts'
import { readCreatureTransformationLabPolicy } from './lab-policy.ts'
import { OpenAiStructuredConceptModel } from './openai-structured-concept-model.ts'
import { getGenerateConceptFailureStatus, orchestrateGenerateConcept } from './edge-orchestration.ts'

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS })
}

function errorResponse(requestId: string, code: string, message: string, status: number, problems?: GenerateConceptErrorResponse['problems']): Response {
    return json({
        success: false,
        requestId,
        code,
        message,
        ...(problems?.length ? { problems } : {}),
    } satisfies GenerateConceptErrorResponse, status)
}

function createRepository(supabaseAdmin: ReturnType<typeof createClient>): PlayerCreatureRepository {
    return {
        async findByCreatureId(creatureId) {
            const { data, error } = await supabaseAdmin
                .from('player_creatures')
                .select('id, profile_id, base_creature_key')
                .eq('id', creatureId)
                .maybeSingle()
            if (error) throw error
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
    const resolver = new SupabaseCreatureIdentityResolver(createRepository(supabaseAdmin))
    const result = await orchestrateGenerateConcept({
        profileId: authData.user.id,
        requestId,
        body,
        policy,
        resolver,
        createGenerator,
    })
    if (!result.success) {
        console.error('Creature transformation request failed', { requestId, code: result.code })
        return json(result, getGenerateConceptFailureStatus(result.code))
    }
    return json(result)
})
