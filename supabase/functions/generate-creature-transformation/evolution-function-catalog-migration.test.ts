import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
    DEPRECATED_EVOLUTION_FUNCTION_IDS,
    EVOLUTION_FUNCTION_IDS,
} from '../../../shared/creature-transformations/evolution-targets.ts'

const migration = readFileSync(
    resolve('supabase/migrations/202608250001_expand_evolution_function_catalog.sql'),
    'utf8',
)

describe('evolution function catalogue migration', () => {
    it('accepts every current function while preserving historical read compatibility', () => {
        expect(migration).toMatch(/create or replace function public\.reserve_creature_transformation_request/i)
        for (const evolutionFunction of EVOLUTION_FUNCTION_IDS) expect(migration).toContain(`'${evolutionFunction}'`)
        for (const deprecatedFunction of DEPRECATED_EVOLUTION_FUNCTION_IDS)
            expect(migration).toContain(`'${deprecatedFunction}'`)
    })

    it('only extends the reservation validator and retains its persistence semantics', () => {
        expect(migration).toContain("if (p_evolution_target_id is null) <> (p_evolution_function is null)")
        expect(migration).toContain('evolution_target_id, evolution_function, request_fingerprint')
        expect(migration).toContain("return jsonb_build_object('outcome','IDEMPOTENCY_KEY_REUSED')")
        expect(migration).toContain("return jsonb_build_object('outcome','DAILY_BUDGET_REACHED')")
    })
})
