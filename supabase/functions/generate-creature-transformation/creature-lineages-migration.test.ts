import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve('supabase/migrations/202608140002_creature_lineages.sql'), 'utf8')

describe('creature lineage migration', () => {
    it('backfills exactly one lineage relation per legacy creature without copying visual assets', () => {
        expect(migration).toMatch(/create table if not exists public\.creature_lineages/i)
        expect(migration).toMatch(/update public\.player_creatures c\s+set lineage_id/i)
        expect(migration).toMatch(/creature_visual_versions.*lineage_id/is)
        expect(migration).not.toMatch(/insert into public\.creature_visual_versions[\s\S]*select[\s\S]*creature_visual_versions/i)
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
})
