import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
    resolve('supabase/migrations/20260902175808_grant_service_role_creature_height.sql'),
    'utf8',
)

describe('service-role creature-height grant migration', () => {
    it('extends the restricted server-side read grant with height only', () => {
        expect(migration).toContain('grant select (height_meters)')
        expect(migration).toContain('on table public.player_creatures')
        expect(migration).toContain('to service_role')
        expect(migration).not.toContain('to anon')
        expect(migration).not.toContain('to authenticated')
    })
})
