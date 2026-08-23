import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve('supabase/migrations/202608050009_anatomical_evolution_targets.sql'), 'utf8')

describe('anatomical evolution targets migration', () => {
    it('keeps legacy trait tracks while persisting target metadata across tracks, requests and versions', () => {
        expect(migration).toMatch(/add column if not exists evolution_target_id text/gi)
        expect(migration).toMatch(/alter column visual_trait_id drop not null/i)
        expect(migration).toMatch(/creature_visual_progress_tracks_selection_check/i)
        expect(migration).toMatch(/sync_creature_transformation_anatomy_metadata/i)
        expect(migration).toMatch(/resolve_creature_visual_progress_track_trait/i)
        expect(migration).toMatch(/insert into public\.creature_visual_versions\(.*evolution_target_id/is)
    })
})
