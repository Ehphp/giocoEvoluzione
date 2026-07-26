import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const schema = readFileSync(resolve(root, 'supabase/schema.sql'), 'utf8').trim()
const rules = readFileSync(resolve(root, 'supabase/generated/game-rules.sql'), 'utf8').trim()
const outputPath = resolve(root, 'supabase/migrations/202607260001_reset_mvp_5_genes.sql')
const output = `-- Generated development-only destructive reset. Do not edit manually.\n-- Sources: supabase/schema.sql and supabase/generated/game-rules.sql.\ndrop schema if exists public cascade;\ncreate schema public;\ngrant usage on schema public to postgres, anon, authenticated, service_role;\ngrant all on schema public to postgres, service_role;\n\n${schema}\n\n${rules}\n`
if (process.argv.includes('--check')) {
    if (readFileSync(outputPath, 'utf8') !== output) throw new Error('Supabase reset migration is stale. Run npm run rules:generate.')
} else {
    writeFileSync(outputPath, output)
}
