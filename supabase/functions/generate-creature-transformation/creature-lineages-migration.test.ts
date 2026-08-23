import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve('supabase/migrations/202608140002_creature_lineages.sql'), 'utf8')
const deletionMigration = readFileSync(resolve('supabase/migrations/202608150003_delete_creature_lineage.sql'), 'utf8')
const historicalPlayerFix = readFileSync(
    resolve('supabase/migrations/202608150005_allow_historical_player_creature_delete.sql'),
    'utf8',
)

describe('creature lineage migration', () => {
    it('backfills exactly one lineage relation per legacy creature without copying visual assets', () => {
        expect(migration).toMatch(/create table if not exists public\.creature_lineages/i)
        expect(migration).toMatch(/update public\.player_creatures c\s+set lineage_id/i)
        expect(migration).toMatch(/creature_visual_versions.*lineage_id/is)
        expect(migration).not.toMatch(
            /insert into public\.creature_visual_versions[\s\S]*select[\s\S]*creature_visual_versions/i,
        )
    })

    it('persists an owned active lineage and scopes battle rewards to the matched creature', () => {
        expect(migration).toMatch(/active_lineage_id uuid/i)
        expect(migration).toMatch(/set_my_active_creature_lineage/i)
        expect(migration).toMatch(/where id = v_player\.creature_id and profile_id = v_player\.profile_id/i)
        expect(migration).toMatch(/active_profile_creature/i)
    })

    it('contains owner-only lineage RLS and lineage-creature consistency guards', () => {
        expect(migration).toMatch(/lineages own read/i)
        expect(migration).toMatch(/LINEAGE_NOT_OWNED/i)
        expect(migration).toMatch(/LINEAGE_CREATURE_MISMATCH/i)
    })

    it('deletes only an owned non-final lineage and replaces it when active', () => {
        expect(deletionMigration).toMatch(/where id = p_lineage_id and profile_id = v_profile_id/i)
        expect(deletionMigration).toMatch(/CANNOT_DELETE_LAST_LINEAGE/i)
        expect(deletionMigration).toMatch(/set active_lineage_id = v_replacement_lineage_id/i)
        expect(deletionMigration).toMatch(/delete from public\.creature_lineages/i)
        expect(deletionMigration).toMatch(
            /grant execute on function public\.delete_my_creature_lineage\(uuid\) to authenticated/i,
        )
    })

    it('keeps historical match players when their deleted creature reference becomes null', () => {
        expect(historicalPlayerFix).toMatch(/create or replace function public\.validate_player_profile_link/i)
        expect(historicalPlayerFix).toMatch(/new\.creature_id is not null and not exists/i)
        expect(historicalPlayerFix).not.toMatch(/new\.creature_id is null or not exists/i)
        expect(historicalPlayerFix).toMatch(/new\.nickname := v_nickname/i)
    })
})
