import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
    resolve('supabase/migrations/202609010002_adopt_relative_creature_height.sql'),
    'utf8',
)

describe('relative-height adoption migration', () => {
    it('copies accepted comparison metadata to the adopted version and atomically updates canonical height', () => {
        expect(migration).toContain('v_request.visual_inspection')
        expect(migration).toContain("v_request.visual_inspection->'heightComparison'")
        expect(migration).toContain("v_comparison->>'sourceVersionId' = v_current.id::text")
        expect(migration).toContain("v_comparison->>'resultHeightMeters'")
        expect(migration).toContain('height_meters = coalesce(v_next_height_meters, height_meters)')
    })

    it('uses the persisted absolute result once, only within the service-only adoption RPC', () => {
        expect(migration).toContain("v_result_height_meters between 0.45 and 4.5")
        expect(migration).toContain('Never reapply its relative')
        expect(migration).toContain('security definer')
        expect(migration).toContain('grant execute on function public.adopt_creature_transformation')
    })

    it('restores the selected form height on a visual rollback, with a legacy-safe fallback', () => {
        expect(migration).toContain('create or replace function public.rollback_creature_visual_version')
        expect(migration).toContain('height_meters = coalesce(v_target_height_meters, 1.4)')
    })
})
