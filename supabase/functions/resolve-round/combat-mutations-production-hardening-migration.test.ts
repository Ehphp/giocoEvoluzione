import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve('supabase/migrations/202608210002_combat_mutations_production_hardening.sql'), 'utf8')

describe('combat mutations production hardening migration contract', () => {
    it('uses total validators and rejects permissive CHECK NULL semantics', () => {
        expect(migration).toContain("jsonb_typeof(value) is distinct from 'object'")
        expect(migration).toContain("value ?& array['elasticLimbsUsed', 'adaptiveCoreStatus', 'armoredMemoryUsed', 'recoverySurgeUsed']")
        expect(migration).toContain('key <> all')
        expect(migration).toContain('is true)')
    })

    it('freezes the match ruleset and verifies it at the atomic commit boundary', () => {
        expect(migration).toContain('add column if not exists rule_version text')
        expect(migration).toContain("'combat-mutations-loadout-mvp-v1'")
        expect(migration).toContain('UNSUPPORTED_GAME_RULE_VERSION')
        expect(migration).toContain('RESOLUTION_RULE_VERSION_MISMATCH')
    })

    it('keeps slots ordered and preserves server authority over match state', () => {
        expect(migration).toContain('select value;')
        expect(migration).toContain('set combat_mutation_loadout = p_combat_mutation_loadout')
        expect(migration).toContain('where id = p_creature_id and profile_id = v_profile_id')
        expect(migration).toContain('to service_role')
    })
})
