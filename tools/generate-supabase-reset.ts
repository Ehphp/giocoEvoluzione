import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const rules = readFileSync(resolve(root, 'supabase/generated/game-rules.sql'), 'utf8').trim()
const outputPath = resolve(root, 'supabase/migrations/202607300001_exhaustion_adaptations.sql')
const output = `-- Generated migration for adaptations-exhaustion-dynamic-duration-v2. Do not edit manually.\n-- Development games are intentionally invalidated; structural tables remain intact.\nbegin;\ndelete from public.games;\n\n${rules}\n\ncommit;\n`
if (process.argv.includes('--check')) {
    if (readFileSync(outputPath, 'utf8') !== output) throw new Error('Supabase reset migration is stale. Run npm run rules:generate.')
} else {
    writeFileSync(outputPath, output)
}
