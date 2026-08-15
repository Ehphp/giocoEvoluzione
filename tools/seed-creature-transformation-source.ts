import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { requireServiceRoleKey, requireSupabaseUrl, serviceRoleFetch } from './reset-creature-evolution-environment.ts'

const SOURCE_BUCKET = 'creature-transformation-sources'
const SOURCE_OBJECT = 'verdant-hatchling-v1.png'
const sourceAssetPath = resolve(import.meta.dirname, '../public/assets/battle/creatures/verdant-hatchling.png')
const supabaseUrl = requireSupabaseUrl(process.env.SUPABASE_URL)
const serviceRoleKey = requireServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)
const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: serviceRoleFetch(serviceRoleKey) },
})
const bucket = supabase.storage.from(SOURCE_BUCKET)
const sourceBytes = await readFile(sourceAssetPath)
const { error: uploadError } = await bucket.upload(SOURCE_OBJECT, sourceBytes, {
    contentType: 'image/png',
    upsert: true,
})
if (uploadError) throw new Error(`Aggiornamento sorgente non riuscito: ${uploadError.message}`)
console.log(`Sorgente canonica aggiornata: ${SOURCE_BUCKET}/${SOURCE_OBJECT}`)
