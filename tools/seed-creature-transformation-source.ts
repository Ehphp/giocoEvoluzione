import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const SOURCE_BUCKET = 'creature-transformation-sources'
const SOURCE_OBJECT = 'verdant-hatchling-v1.png'
const sourceAssetPath = resolve(import.meta.dirname, '../public/assets/battle/creatures/verdant-hatchling.png')
const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devono essere impostati solo nell ambiente locale o CI protetto.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey)
const bucket = supabase.storage.from(SOURCE_BUCKET)
const { data: existing, error: listError } = await bucket.list('', { limit: 100, search: SOURCE_OBJECT })
if (listError) throw new Error(`Impossibile verificare il bucket sorgente: ${listError.message}`)

if (existing.some((entry) => entry.name === SOURCE_OBJECT)) {
    console.log(`Sorgente gia presente: ${SOURCE_BUCKET}/${SOURCE_OBJECT}`)
} else {
    const sourceBytes = await readFile(sourceAssetPath)
    const { error: uploadError } = await bucket.upload(SOURCE_OBJECT, sourceBytes, {
        contentType: 'image/png',
        upsert: false,
    })
    if (uploadError) throw new Error(`Upload sorgente non riuscito: ${uploadError.message}`)
    console.log(`Sorgente caricata: ${SOURCE_BUCKET}/${SOURCE_OBJECT}`)
}
