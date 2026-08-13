import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve('supabase/migrations/202608130002_admin_global_creature_progression_reset.sql'), 'utf8')
const verification = readFileSync(resolve('supabase/verification/verify_global_creature_progression_reset.sql'), 'utf8')

describe('administrative global creature progression reset migration', () => {
    it('resets only creature progression and serializes concurrent workflow writes', () => {
        expect(migration).toMatch(/lock table[\s\S]*in access exclusive mode/i)
        expect(migration).toContain("base_creature_key = 'VERDANT_HATCHLING'")
        expect(migration).toContain('level = 1')
        expect(migration).toContain('experience = 0')
        expect(migration).toContain("progression_state = '{}'::jsonb")
        expect(migration).toContain("error_code = 'ADMIN_CREATURE_PROGRESSION_RESET'")
        expect(migration).toContain("status = 'CANCELLED'")
        expect(migration).not.toMatch(/\bupdate\s+public\.(profiles|games|players|match_rewards|competitive_rating_events)\b/i)
        expect(migration).not.toMatch(/\bdelete\s+from\b/i)
    })

    it('uses a transaction-scoped immutability exception and verifies all reset invariants', () => {
        expect(migration).toMatch(/begin;[\s\S]*disable trigger creature_visual_versions_immutable[\s\S]*enable trigger creature_visual_versions_immutable[\s\S]*commit;/i)
        expect(migration).toContain("where version_number <> 1 and status <> 'REVOKED'")
        expect(migration).toContain("where status in ('ACTIVE', 'READY', 'GENERATING', 'POST_PROCESSING', 'GENERATED')")
        expect(migration).toContain("where status in ('RESERVED', 'RUNNING')")
        expect(verification).toContain("'creatures_without_exactly_one_active_version'")
        expect(verification).toContain("'open_transformation_requests'")
        expect(verification).toContain("'public.competitive_rating_events'")
    })
})
