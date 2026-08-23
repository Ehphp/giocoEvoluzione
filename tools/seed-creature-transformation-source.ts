import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { requireServiceRoleKey, requireSupabaseUrl, serviceRoleFetch } from './reset-creature-evolution-environment.ts'

const SOURCE_BUCKET = 'creature-transformation-sources'
// The PNG master, not the shipped WebP: this uploads the canonical source the transformation
// pipeline generates from, and the object name is its own sha256. A re-encode would rename it.
const sourceAssetPath = resolve(import.meta.dirname, '../assets-source/battle/creatures/verdant-hatchling.png')
const supabaseUrl = requireSupabaseUrl(process.env.SUPABASE_URL)
const serviceRoleKey = requireServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)
const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: serviceRoleFetch(serviceRoleKey) },
})
const bucket = supabase.storage.from(SOURCE_BUCKET)
const sourceBytes = await readFile(sourceAssetPath)
const sourceMetadata = readPngMetadata(sourceBytes)
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex')
const sourceObject = `verdant-hatchling/${sourceSha256}.png`

function readPngMetadata(bytes: Uint8Array) {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10]

    if (bytes.length < 26 || !signature.every((value, index) => bytes[index] === value)) {
        throw new Error('La sorgente canonica deve essere un PNG valido.')
    }
    if (String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') {
        throw new Error('La sorgente canonica PNG non contiene un header IHDR valido.')
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const width = view.getUint32(16)
    const height = view.getUint32(20)
    const colourType = bytes[25]
    const hasAlpha = colourType === 4 || colourType === 6

    if (!width || !height || !hasAlpha) {
        throw new Error('La sorgente canonica deve avere dimensioni valide e un canale alpha.')
    }

    return { width, height, hasAlpha }
}

async function syncCanonicalManifest(dryRun: boolean) {
    const { data, error } = await supabase.rpc('sync_verdant_hatchling_canonical_source', {
        p_asset_sha256: sourceSha256,
        p_width: sourceMetadata.width,
        p_height: sourceMetadata.height,
        p_has_alpha: sourceMetadata.hasAlpha,
        p_dry_run: dryRun,
        p_asset_path: sourceObject,
    })

    if (error) {
        throw new Error(`Sincronizzazione del manifest canonico non riuscita: ${error.message}`)
    }

    return data
}

// Fail before Storage changes if the synchronisation RPC migration is not deployed yet.
await syncCanonicalManifest(true)
const { error: uploadError } = await bucket.upload(sourceObject, sourceBytes, {
    contentType: 'image/png',
    upsert: true,
})
if (uploadError) throw new Error(`Aggiornamento sorgente non riuscito: ${uploadError.message}`)
const manifest = await syncCanonicalManifest(false)
console.log(
    `Sorgente canonica aggiornata: ${SOURCE_BUCKET}/${sourceObject} (${sourceMetadata.width}x${sourceMetadata.height}, sha256 ${sourceSha256}).`,
)
console.log(`Manifest e versioni base sincronizzati: ${JSON.stringify(manifest)}`)
