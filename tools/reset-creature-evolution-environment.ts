import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const EXPERIMENT_BUCKET = 'creature-transformation-experiments'
const SOURCE_BUCKET = 'creature-transformation-sources'
const CANONICAL_SOURCE_OBJECT = 'verdant-hatchling-v1.png'
const LIST_PAGE_SIZE = 100
const REMOVE_BATCH_SIZE = 100
const MAX_EMPTY_BUCKET_PASSES = 5

type StorageError = Readonly<{ message: string }> | null
type StorageEntry = Readonly<{ name: string; id: string | null }>

export interface StorageBucketClient {
    list(path?: string, options?: { limit?: number; offset?: number; sortBy?: { column: string; order: 'asc' | 'desc' }; search?: string }): Promise<{ data: readonly StorageEntry[] | null; error: StorageError }>
    remove(paths: readonly string[]): Promise<{ data: unknown; error: StorageError }>
}

type ResetSupabaseClient = Readonly<{
    rpc(name: string, args?: Record<string, never>): Promise<{ data: unknown; error: StorageError }>
    storage: Readonly<{ from(bucket: string): StorageBucketClient }>
}>

export type DestructiveResetReport = Readonly<{
    storageObjectsDeleted: number
    transformationRequestsDeleted: number
    visualVersionsDeleted: number
    visualTracksDeleted: number
    targetProgressDeleted: number
    evolutionEventsDeleted: number
    evolutionReviewsDeleted: number
    lineagesDeleted: number
    creaturesReset: number
    storageObjectsRemaining: number
}>

function record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function integer(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new Error(`Il report del reset non contiene un contatore valido per ${field}.`)
    }
    return value
}

function requireZero(value: unknown, field: string) {
    if (integer(value, field) !== 0) throw new Error(`Invariante DB non rispettato dopo il reset: ${field}.`)
}

export function parseResetArguments(argumentsList: readonly string[]) {
    if (argumentsList.length !== 1 || argumentsList[0] !== '--confirm-destructive-reset') {
        throw new Error('Operazione distruttiva bloccata. Riesegui con il solo flag --confirm-destructive-reset.')
    }
}

export function requireSupabaseUrl(value: string | undefined): string {
    if (!value) throw new Error('SUPABASE_URL deve essere impostata.')
    let url: URL
    try {
        url = new URL(value)
    } catch {
        throw new Error('SUPABASE_URL non e un URL API Supabase valido.')
    }
    const dashboardHost = url.hostname === 'supabase.com' || url.hostname === 'app.supabase.com'
    if (!['http:', 'https:'].includes(url.protocol) || dashboardHost || (url.pathname !== '' && url.pathname !== '/')) {
        throw new Error('SUPABASE_URL deve essere l URL API radice del progetto, non Dashboard o Studio.')
    }
    return url.origin
}

export function requireServiceRoleKey(value: string | undefined): string {
    if (!value) throw new Error('SUPABASE_SERVICE_ROLE_KEY deve essere impostata esclusivamente nell ambiente locale o CI protetto.')
    const key = value.trim()
    if (key.startsWith('sb_publishable_')) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY contiene una chiave sb_publishable_. Per questo reset usa una Secret key sb_secret_ dal progetto corretto, non una Publishable key.')
    }
    return key
}

function isModernSecretKey(key: string) {
    return key.startsWith('sb_secret_')
}

/**
 * `sb_secret_` keys are opaque API keys, not JWTs. supabase-js still gives
 * Storage its generic authenticated fetch, which adds the key as Bearer too;
 * strip only that fallback so Storage receives the required `apikey` header.
 */
export function serviceRoleFetch(serviceRoleKey: string, baseFetch: typeof fetch = globalThis.fetch): typeof fetch {
    if (!isModernSecretKey(serviceRoleKey)) return baseFetch
    return (input, init) => {
        const headers = new Headers(init?.headers)
        headers.delete('authorization')
        return baseFetch(input, { ...init, headers })
    }
}

function joinStoragePath(parent: string, child: string) {
    return parent ? `${parent}/${child}` : child
}

/** Lists actual objects, recursing through Supabase's virtual folders and every page. */
export async function listAllStorageObjectPaths(bucket: StorageBucketClient, path = ''): Promise<string[]> {
    const objects = new Set<string>()
    const visitedFolders = new Set<string>()

    async function visit(folder: string): Promise<void> {
        if (visitedFolders.has(folder)) return
        visitedFolders.add(folder)
        const nestedFolders: string[] = []

        for (let offset = 0; ; ) {
            const { data, error } = await bucket.list(folder, {
                limit: LIST_PAGE_SIZE,
                offset,
                sortBy: { column: 'name', order: 'asc' },
            })
            if (error) throw new Error(`Impossibile elencare ${EXPERIMENT_BUCKET}/${folder || '.'}: ${error.message}`)
            const page = data ?? []
            for (const entry of page) {
                if (!entry.name) throw new Error(`Il listing di ${EXPERIMENT_BUCKET}/${folder || '.'} contiene un oggetto senza nome.`)
                const childPath = joinStoragePath(folder, entry.name)
                if (entry.id === null) nestedFolders.push(childPath)
                else objects.add(childPath)
            }
            if (page.length < LIST_PAGE_SIZE) break
            offset += page.length
        }

        for (const nestedFolder of nestedFolders) await visit(nestedFolder)
    }

    await visit(path)
    return [...objects].sort()
}

function batches<T>(items: readonly T[], size: number): T[][] {
    const result: T[][] = []
    for (let index = 0; index < items.length; index += size) result.push([...items.slice(index, index + size)])
    return result
}

/** Removes all physical bucket objects and verifies an empty recursive listing. */
export async function emptyExperimentBucket(bucket: StorageBucketClient): Promise<{ deleted: number; remaining: number }> {
    let deleted = 0
    for (let pass = 0; pass < MAX_EMPTY_BUCKET_PASSES; pass += 1) {
        const paths = await listAllStorageObjectPaths(bucket)
        if (paths.length === 0) return { deleted, remaining: 0 }
        for (const batch of batches(paths, REMOVE_BATCH_SIZE)) {
            const { error } = await bucket.remove(batch)
            if (error) throw new Error(`Impossibile eliminare oggetti da ${EXPERIMENT_BUCKET}: ${error.message}`)
            deleted += batch.length
        }
    }
    const remaining = await listAllStorageObjectPaths(bucket)
    if (remaining.length !== 0) {
        throw new Error(`Il bucket ${EXPERIMENT_BUCKET} non e vuoto dopo ${MAX_EMPTY_BUCKET_PASSES} passaggi (${remaining.length} oggetti residui).`)
    }
    return { deleted, remaining: 0 }
}

async function verifyCanonicalSource(bucket: StorageBucketClient): Promise<void> {
    const { data, error } = await bucket.list('', { limit: LIST_PAGE_SIZE, search: CANONICAL_SOURCE_OBJECT })
    if (error) throw new Error(`Impossibile verificare il bucket canonico ${SOURCE_BUCKET}: ${error.message}`)
    if (!(data ?? []).some((entry) => entry.id !== null && entry.name === CANONICAL_SOURCE_OBJECT)) {
        throw new Error(`Il source asset canonico ${SOURCE_BUCKET}/${CANONICAL_SOURCE_OBJECT} non e presente: reset bloccato.`)
    }
}

function verificationFrom(value: unknown): Record<string, unknown> {
    const verification = record(value)
    if (!verification) throw new Error('La verifica DB del reset non ha restituito un oggetto valido.')
    for (const field of [
        'canonical_creature_violations',
        'profiles_without_creature',
        'active_lineage_violations',
        'active_visual_violations',
        'extra_visual_versions',
        'transformation_requests_remaining',
        'visual_tracks_remaining',
        'target_progress_remaining',
        'evolution_events_remaining',
        'evolution_reviews_remaining',
        'orphan_lineages',
        'noncanonical_lineages',
        'evolution_drafts_remaining',
        'flux_start_violations',
    ]) requireZero(verification[field], field)
    return verification
}

function resetReportFrom(value: unknown): Record<string, unknown> {
    const reset = record(value)
    if (!reset) throw new Error('La RPC di reset non ha restituito un report valido.')
    verificationFrom(reset.verification)
    return reset
}

export async function resetCreatureEvolutionEnvironment(supabase: ResetSupabaseClient): Promise<DestructiveResetReport> {
    // Verify the protected canonical source before making the DB reset irreversible.
    await verifyCanonicalSource(supabase.storage.from(SOURCE_BUCKET))

    const { data: resetData, error: resetError } = await supabase.rpc('admin_destructive_reset_creature_evolution_environment')
    if (resetError) throw new Error(`Reset DB non riuscito: ${resetError.message}`)
    const reset = resetReportFrom(resetData)

    // Storage is deliberately outside Postgres, so this is immediately followed
    // by a recursive listing-based wipe and a second DB invariant verification.
    const storage = await emptyExperimentBucket(supabase.storage.from(EXPERIMENT_BUCKET))
    const { data: verificationData, error: verificationError } = await supabase.rpc('admin_verify_creature_evolution_environment_reset')
    if (verificationError) throw new Error(`Verifica DB finale non riuscita: ${verificationError.message}`)
    verificationFrom(verificationData)

    return {
        storageObjectsDeleted: storage.deleted,
        transformationRequestsDeleted: integer(reset.transformation_requests_deleted, 'transformation_requests_deleted'),
        visualVersionsDeleted: integer(reset.visual_versions_deleted, 'visual_versions_deleted'),
        visualTracksDeleted: integer(reset.visual_tracks_deleted, 'visual_tracks_deleted'),
        targetProgressDeleted: integer(reset.target_progress_deleted, 'target_progress_deleted'),
        evolutionEventsDeleted: integer(reset.evolution_events_deleted, 'evolution_events_deleted'),
        evolutionReviewsDeleted: integer(reset.evolution_reviews_deleted, 'evolution_reviews_deleted'),
        lineagesDeleted: integer(reset.lineages_deleted, 'lineages_deleted'),
        creaturesReset: integer(reset.creatures_reset, 'creatures_reset'),
        storageObjectsRemaining: storage.remaining,
    }
}

function printReport(report: DestructiveResetReport) {
    console.log('Reset distruttivo completato.')
    console.log(`Oggetti Storage eliminati: ${report.storageObjectsDeleted}`)
    console.log(`Transformation request eliminate: ${report.transformationRequestsDeleted}`)
    console.log(`Visual version eliminate: ${report.visualVersionsDeleted}`)
    console.log(`Visual track eliminate: ${report.visualTracksDeleted}`)
    console.log(`Target progress eliminati: ${report.targetProgressDeleted}`)
    console.log(`Eventi evolutivi eliminati: ${report.evolutionEventsDeleted}`)
    console.log(`Review evolutive eliminate: ${report.evolutionReviewsDeleted}`)
    console.log(`Lineage eliminate: ${report.lineagesDeleted}`)
    console.log(`Creature riportate alla base: ${report.creaturesReset}`)
    console.log(`Oggetti Storage residui: ${report.storageObjectsRemaining}`)
}

export async function main(argumentsList = process.argv.slice(2), environment = process.env): Promise<void> {
    parseResetArguments(argumentsList)
    const supabaseUrl = requireSupabaseUrl(environment.SUPABASE_URL)
    const serviceRoleKey = requireServiceRoleKey(environment.SUPABASE_SERVICE_ROLE_KEY)
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        global: { fetch: serviceRoleFetch(serviceRoleKey) },
    })
    printReport(await resetCreatureEvolutionEnvironment(supabase))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    await main()
}
