import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve('supabase/migrations/202608170001_creature_visual_inspection.sql'), 'utf8')

describe('creature visual inspection migration', () => {
    it('adds bounded JSONB inspection metadata and records it only through a server-side RPC', () => {
        expect(migration).toContain('add column if not exists visual_inspection jsonb')
        expect(migration).toContain('pg_column_size(visual_inspection) <= 16384')
        expect(migration).toContain('record_creature_transformation_visual_inspection')
        expect(migration).toContain("v_request.status <> 'SUCCEEDED'")
    })

    it('copies inspection through adoption and preserves it through cleanup promotion', () => {
        expect(migration).toContain('v_request.visual_inspection')
        expect(migration).toContain('v_current.visual_inspection')
        expect(migration).toContain('or new.visual_inspection is distinct from old.visual_inspection')
    })
})
