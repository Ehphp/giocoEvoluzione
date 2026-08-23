import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve('supabase/migrations/202608040001_creature_visual_progression.sql'), 'utf8')

describe('visual progression migration', () => {
    it('persists immutable versions, a current pointer, tracks and idempotent events', () => {
        expect(migration).toMatch(/create table if not exists public\.creature_visual_versions/i)
        expect(migration).toMatch(/current_visual_version_id uuid/i)
        expect(migration).toMatch(/create table if not exists public\.creature_visual_progress_tracks/i)
        expect(migration).toMatch(/unique \(profile_id, game_id\)/i)
        expect(migration).toMatch(/protect_creature_visual_version_immutability/i)
    })

    it('uses service-only RPCs for adoption and direct tables remain RLS protected', () => {
        expect(migration).toMatch(/adopt_creature_transformation/i)
        expect(migration).toMatch(/rollback_creature_visual_version/i)
        expect(migration).toMatch(/alter table public\.creature_visual_versions enable row level security/i)
        expect(migration).toMatch(/revoke all on public\.creature_visual_versions.*authenticated/is)
        expect(migration).not.toMatch(
            /grant (insert|update|delete) on public\.creature_visual_versions to authenticated/i,
        )
    })
})
