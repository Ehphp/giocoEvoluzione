import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import {
    collectLineageExperimentObjectPaths,
    CREATURE_TRANSFORMATION_EXPERIMENTS_BUCKET,
    splitStorageRemovalBatches,
} from '../../../shared/creature-transformations/lineage-storage-cleanup.ts'

type SupabaseAdminClient = ReturnType<typeof createClient<any>>

type StorageCleanupStatus = 'COMPLETED' | 'NO_OBJECTS' | 'PENDING_RETRY'

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const STORAGE_REFERENCE_QUERY_BATCH_SIZE = 100

const STORAGE_REFERENCE_COLUMNS = [
    { table: 'creature_visual_versions', column: 'asset_path' },
    { table: 'creature_visual_versions', column: 'display_asset_path' },
    { table: 'creature_transformation_requests', column: 'result_path' },
    { table: 'creature_transformation_requests', column: 'raw_result_path' },
    { table: 'creature_transformation_requests', column: 'display_asset_path' },
] as const

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS })
}

function readLineageId(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null
    const lineageId = (body as Record<string, unknown>).lineageId
    return typeof lineageId === 'string' && UUID_PATTERN.test(lineageId) ? lineageId : null
}

function normalizeRows(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) return []
    return value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
}

async function readLineageAssetRows(supabaseAdmin: SupabaseAdminClient, lineageId: string) {
    const [requestsResult, versionsResult] = await Promise.all([
        supabaseAdmin
            .from('creature_transformation_requests')
            .select('result_path, raw_result_path, display_asset_path')
            .eq('lineage_id', lineageId),
        supabaseAdmin
            .from('creature_visual_versions')
            .select('asset_path, display_asset_path')
            .eq('lineage_id', lineageId),
    ])

    if (requestsResult.error) throw requestsResult.error
    if (versionsResult.error) throw versionsResult.error

    return [...normalizeRows(requestsResult.data), ...normalizeRows(versionsResult.data)]
}

async function findRemainingStorageReferences(supabaseAdmin: SupabaseAdminClient, paths: readonly string[]) {
    const referencedPaths = new Set<string>()

    for (const batch of splitStorageRemovalBatches(paths, STORAGE_REFERENCE_QUERY_BATCH_SIZE)) {
        const queryResults = await Promise.all(
            STORAGE_REFERENCE_COLUMNS.map(async ({ table, column }) => {
                const { data, error } = await supabaseAdmin.from(table).select(column).in(column, batch)
                if (error) throw error
                return normalizeRows(data)
            }),
        )

        for (const rows of queryResults) {
            for (const row of rows) {
                for (const value of Object.values(row)) {
                    if (typeof value === 'string') referencedPaths.add(value)
                }
            }
        }
    }

    return referencedPaths
}

async function removeStorageObjects(supabaseAdmin: SupabaseAdminClient, paths: readonly string[]) {
    let removedObjectCount = 0

    for (const batch of splitStorageRemovalBatches(paths)) {
        const { error } = await supabaseAdmin.storage
            .from(CREATURE_TRANSFORMATION_EXPERIMENTS_BUCKET)
            .remove(batch)
        if (error) throw error
        removedObjectCount += batch.length
    }

    return removedObjectCount
}

function storageCleanupResponse(
    status: StorageCleanupStatus,
    requestedObjectCount: number,
    removedObjectCount: number,
    skippedSharedObjectCount: number,
) {
    return {
        status,
        requestedObjectCount,
        removedObjectCount,
        skippedSharedObjectCount,
    }
}

Deno.serve(async (request) => {
    const requestId = crypto.randomUUID()
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
    if (request.method !== 'POST') return json({ success: false, code: 'METHOD_NOT_ALLOWED' }, 405)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
        console.error('Creature lineage deletion configuration error', { requestId })
        return json({ success: false, code: 'INTERNAL_ERROR' }, 500)
    }

    const authorization = request.headers.get('authorization') ?? ''
    if (!authorization) return json({ success: false, code: 'UNAUTHENTICATED' }, 401)

    const authenticatedClient = createClient<any>(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authorization } },
    })
    const { data: authData, error: authError } = await authenticatedClient.auth.getUser()
    if (authError || !authData.user) return json({ success: false, code: 'UNAUTHENTICATED' }, 401)

    let body: unknown
    try {
        body = await request.json()
    } catch {
        return json({ success: false, code: 'INVALID_REQUEST' }, 400)
    }

    const lineageId = readLineageId(body)
    if (!lineageId) return json({ success: false, code: 'INVALID_LINEAGE_ID' }, 400)

    const supabaseAdmin = createClient<any>(supabaseUrl, supabaseServiceRoleKey)
    const { data: lineage, error: lineageError } = await supabaseAdmin
        .from('creature_lineages')
        .select('id')
        .eq('id', lineageId)
        .eq('profile_id', authData.user.id)
        .maybeSingle()
    if (lineageError) {
        console.error('Creature lineage deletion ownership lookup failed', { requestId, lineageId })
        return json({ success: false, code: 'INTERNAL_ERROR' }, 500)
    }
    if (!lineage) return json({ success: false, code: 'LINEAGE_NOT_OWNED' }, 404)

    let targetPaths: string[]
    try {
        targetPaths = collectLineageExperimentObjectPaths(await readLineageAssetRows(supabaseAdmin, lineageId))
    } catch {
        console.error('Creature lineage deletion asset lookup failed', { requestId, lineageId })
        return json({ success: false, code: 'ASSET_LOOKUP_FAILED' }, 503)
    }

    const { data: activeLineageId, error: deletionError } = await authenticatedClient.rpc(
        'delete_my_creature_lineage',
        { p_lineage_id: lineageId },
    )
    if (deletionError) {
        console.error('Creature lineage database deletion failed', { requestId, lineageId, databaseCode: deletionError.code })
        return json({ success: false, code: 'LINEAGE_DELETE_FAILED' }, 409)
    }

    try {
        const retainedPaths = await findRemainingStorageReferences(supabaseAdmin, targetPaths)
        const removablePaths = targetPaths.filter((path) => !retainedPaths.has(path))
        const skippedSharedObjectCount = targetPaths.length - removablePaths.length

        if (!removablePaths.length) {
            return json({
                success: true,
                lineageId,
                activeLineageId: typeof activeLineageId === 'string' ? activeLineageId : null,
                storageCleanup: storageCleanupResponse('NO_OBJECTS', targetPaths.length, 0, skippedSharedObjectCount),
            })
        }

        const removedObjectCount = await removeStorageObjects(supabaseAdmin, removablePaths)
        return json({
            success: true,
            lineageId,
            activeLineageId: typeof activeLineageId === 'string' ? activeLineageId : null,
            storageCleanup: storageCleanupResponse(
                'COMPLETED',
                targetPaths.length,
                removedObjectCount,
                skippedSharedObjectCount,
            ),
        })
    } catch {
        // The database has already removed the lineage. Leaving unreferenced objects is safer than
        // failing the player-visible deletion or deleting an object whose remaining references could
        // not be checked. The response lets the client refresh normally and logs retain the request ID.
        console.error('Creature lineage Storage cleanup needs retry', { requestId, lineageId })
        return json({
            success: true,
            lineageId,
            activeLineageId: typeof activeLineageId === 'string' ? activeLineageId : null,
            storageCleanup: storageCleanupResponse('PENDING_RETRY', targetPaths.length, 0, 0),
        })
    }
})
