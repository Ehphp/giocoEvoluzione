import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve('supabase/migrations/202608150001_admin_destructive_creature_evolution_environment_reset.sql'), 'utf8')
const safeDeleteFix = readFileSync(resolve('supabase/migrations/202608150002_fix_destructive_creature_evolution_reset_safe_deletes.sql'), 'utf8')
const tool = readFileSync(resolve('tools/reset-creature-evolution-environment.ts'), 'utf8')

describe('destructive creature evolution environment reset', () => {
    it('is a service-role-only, explicitly confirmed administration path', () => {
        expect(migration).toMatch(/create or replace function public\.admin_destructive_reset_creature_evolution_environment\(\)/i)
        expect(migration).toMatch(/auth\.role\(\) <> 'service_role'/i)
        expect(migration).toMatch(/grant execute on function public\.admin_destructive_reset_creature_evolution_environment\(\) to service_role/i)
        expect(migration).toMatch(/revoke all on function public\.admin_destructive_reset_creature_evolution_environment\(\) from public, anon, authenticated/i)
        expect(tool).toContain('--confirm-destructive-reset')
        expect(tool).toContain('SUPABASE_SERVICE_ROLE_KEY')
        expect(tool).toContain("key.startsWith('sb_secret_')")
        expect(tool).toContain("headers.delete('authorization')")
    })

    it('removes the entire derived evolution domain while preserving and rebuilding canonical creatures', () => {
        for (const table of [
            'creature_transformation_experiment_reviews',
            'creature_transformation_lineage_comparison_reviews',
            'creature_visual_progress_events',
            'creature_evolution_target_progress_events',
            'creature_evolution_target_progress',
            'creature_visual_version_rollbacks',
            'creature_visual_progress_tracks',
            'creature_visual_versions',
            'creature_transformation_requests',
        ]) expect(migration).toMatch(new RegExp(`delete from public\\.${table} where id is not null`, 'i'))
        expect(migration).toMatch(/insert into public\.creature_lineages[\s\S]*'VERDANT_HATCHLING'/i)
        expect(migration).toMatch(/update public\.player_creatures c[\s\S]*base_creature_key = 'VERDANT_HATCHLING'/i)
        expect(migration).toMatch(/insert into public\.creature_visual_versions[\s\S]*version_number[\s\S]*'ACTIVE'/i)
        expect(migration).toContain("asset_path = 'verdant-hatchling-v1.png'")
        expect(migration).toMatch(/delete from public\.creature_lineages l[\s\S]*reset_lineage_id/i)
        expect(migration).not.toMatch(/delete from public\.(profiles|games|players|match_rewards|competitive_rating_events)\b/i)
    })

    it('uses explicit primary-key scopes when a development project enables safe DELETE mode', () => {
        expect(safeDeleteFix).toContain('pg_get_functiondef')
        expect(safeDeleteFix).toContain('execute v_definition')
        expect(safeDeleteFix).toContain('delete from public.creature_transformation_requests where id is not null;')
    })

    it('requires a fresh active base v1 with no tracks before Flux can start again', () => {
        expect(migration).toContain("'flux_start_violations'")
        expect(migration).toMatch(/v\.version_number = 1[\s\S]*v\.status = 'ACTIVE'[\s\S]*v\.base_creature_key = 'VERDANT_HATCHLING'/i)
        expect(migration).toMatch(/from public\.creature_visual_progress_tracks t[\s\S]*where t\.creature_id = c\.id/i)
        expect(tool).toContain("'flux_start_violations'")
    })

    it('clears every physical object under the experiments bucket via paginated recursive Storage API calls', () => {
        expect(tool).toContain("const EXPERIMENT_BUCKET = 'creature-transformation-experiments'")
        expect(tool).toContain('entry.id === null')
        expect(tool).toContain('offset += page.length')
        expect(tool).toContain('bucket.remove(batch)')
        expect(tool).toContain('MAX_EMPTY_BUCKET_PASSES')
        expect(tool).toContain('storageObjectsRemaining: storage.remaining')
        expect(tool).toContain("CANONICAL_SOURCE_OBJECT = 'verdant-hatchling-v1.png'")
    })
})
