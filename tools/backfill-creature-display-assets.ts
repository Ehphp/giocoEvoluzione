import { createHash } from 'node:crypto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'

import { backfillCreatureDisplayAssets, hasPersistedCreatureDisplayAsset, type LegacyCreatureVisualVersion } from '../shared/creature-transformations/display-asset-backfill.ts'
import { CREATURE_DISPLAY_WEBP_QUALITY, getCreatureDisplayDimensions } from '../shared/creature-transformations/display-asset-spec.ts'

const SOURCE_BUCKET = 'creature-transformation-sources'
const EXPERIMENT_BUCKET = 'creature-transformation-experiments'
const PAGE_SIZE = 100

type StoredVisualVersion = LegacyCreatureVisualVersion & Readonly<{
    visualTraitId: string | null
}>

function parseOptions(argumentsList: readonly string[]) {
    const unsupported = argumentsList.filter((argument) => argument !== '--dry-run' && argument !== '--force')
    if (unsupported.length) throw new Error(`Opzioni non supportate: ${unsupported.join(', ')}`)
    return { dryRun: argumentsList.includes('--dry-run'), force: argumentsList.includes('--force') }
}

function mapStoredVisualVersion(row: Record<string, unknown>): StoredVisualVersion {
    const id = typeof row.id === 'string' ? row.id : null
    const assetPath = typeof row.asset_path === 'string' ? row.asset_path : null
    if (!id || !assetPath) throw new Error('Una visual version non contiene id o asset_path validi.')
    return {
        id,
        assetPath,
        visualTraitId: typeof row.visual_trait_id === 'string' ? row.visual_trait_id : null,
        displayAssetPath: typeof row.display_asset_path === 'string' ? row.display_asset_path : null,
        displayAssetSha256: typeof row.display_asset_sha256 === 'string' ? row.display_asset_sha256 : null,
        displayMimeType: typeof row.display_mime_type === 'string' ? row.display_mime_type : null,
        displayWidth: typeof row.display_width === 'number' ? row.display_width : null,
        displayHeight: typeof row.display_height === 'number' ? row.display_height : null,
    }
}

function displayObjectPath(visualVersionId: string) {
    return `display/${createHash('sha256').update(visualVersionId).digest('hex')}.webp`
}

function usesSourceBucket(version: StoredVisualVersion) {
    return version.visualTraitId === null && !version.assetPath.startsWith('cleanup/')
}

async function listVisualVersions(supabase: SupabaseClient<any, 'public', 'public', any, any>): Promise<StoredVisualVersion[]> {
    const versions: StoredVisualVersion[] = []
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await supabase
            .from('creature_visual_versions')
            .select('id, visual_trait_id, asset_path, display_asset_path, display_asset_sha256, display_mime_type, display_width, display_height')
            .order('created_at', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1)
        if (error) throw new Error(`Impossibile leggere le visual version: ${error.message}`)
        const page = (data ?? []).map((row) => mapStoredVisualVersion(row as Record<string, unknown>))
        versions.push(...page)
        if (page.length < PAGE_SIZE) return versions
    }
}

async function listDisplayAssetPaths(supabase: SupabaseClient<any, 'public', 'public', any, any>): Promise<Set<string>> {
    const paths = new Set<string>()
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await supabase.storage.from(EXPERIMENT_BUCKET).list('display', { limit: PAGE_SIZE, offset })
        if (error) throw new Error(`Impossibile verificare i display asset esistenti: ${error.message}`)
        for (const entry of data ?? []) paths.add(`display/${entry.name}`)
        if ((data ?? []).length < PAGE_SIZE) return paths
    }
}

const options = parseOptions(process.argv.slice(2))
const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devono essere impostati esclusivamente nell ambiente locale o CI protetto.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey)
const versions = await listVisualVersions(supabase)
const displayAssetPaths = await listDisplayAssetPaths(supabase)
const counts = await backfillCreatureDisplayAssets({
    versions,
    dryRun: options.dryRun,
    force: options.force,
    isComplete(version) {
        return hasPersistedCreatureDisplayAsset(version)
            && version.displayAssetPath === displayObjectPath(version.id)
            && displayAssetPaths.has(version.displayAssetPath)
    },
    async process(version, dryRun) {
        const storedVersion = version as StoredVisualVersion
        const targetPath = displayObjectPath(storedVersion.id)
        if (dryRun) {
            console.log(`DRY RUN ${storedVersion.id}: ${storedVersion.assetPath} -> ${targetPath}`)
            return
        }

        const bucketName = usesSourceBucket(storedVersion) ? SOURCE_BUCKET : EXPERIMENT_BUCKET
        const { data: master, error: downloadError } = await supabase.storage.from(bucketName).download(storedVersion.assetPath)
        if (downloadError || !master) throw new Error(`Download ${bucketName}/${storedVersion.assetPath} non riuscito: ${downloadError?.message ?? 'asset assente'}`)

        const masterBytes = Buffer.from(await master.arrayBuffer())
        const metadata = await sharp(masterBytes).metadata()
        if (metadata.format !== 'png' || !metadata.width || !metadata.height) throw new Error(`Il master ${storedVersion.assetPath} non e un PNG con dimensioni valide.`)
        const dimensions = getCreatureDisplayDimensions(metadata.width, metadata.height)
        const displayBytes = await sharp(masterBytes)
            .resize(dimensions.width, dimensions.height, { fit: 'fill' })
            .webp({ quality: Math.round(CREATURE_DISPLAY_WEBP_QUALITY * 100) })
            .toBuffer()
        const displaySha256 = createHash('sha256').update(displayBytes).digest('hex')

        const { error: uploadError } = await supabase.storage.from(EXPERIMENT_BUCKET).upload(targetPath, displayBytes, {
            contentType: 'image/webp',
            cacheControl: '31536000',
            upsert: true,
        })
        if (uploadError) throw new Error(`Upload ${EXPERIMENT_BUCKET}/${targetPath} non riuscito: ${uploadError.message}`)
        displayAssetPaths.add(targetPath)

        const { error: updateError } = await supabase.from('creature_visual_versions').update({
            display_asset_path: targetPath,
            display_asset_sha256: displaySha256,
            display_mime_type: 'image/webp',
            display_width: dimensions.width,
            display_height: dimensions.height,
        }).eq('id', storedVersion.id)
        if (updateError) throw new Error(`Persistenza display asset per ${storedVersion.id} non riuscita: ${updateError.message}`)
        console.log(`PROCESSATO ${storedVersion.id}: ${storedVersion.assetPath} -> ${targetPath}`)
    },
    onFailure(version, error) {
        console.error(`FALLITO ${version.id}: ${error instanceof Error ? error.message : String(error)}`)
    },
})

console.log(`${options.dryRun ? 'DRY RUN' : 'BACKFILL'} completato: processed=${counts.processed} skipped=${counts.skipped} failed=${counts.failed}`)
if (counts.failed) process.exitCode = 1