import { describe, expect, it } from 'vitest'

import migration from '../../migrations/202608070001_creature_transformation_reservation_evolution_metadata.sql?raw'

describe('request reservation evolution metadata migration', () => {
    it('persists a paired target and function before concept generation', () => {
        expect(migration).toContain('p_evolution_target_id text default null, p_evolution_function text default null')
        expect(migration).toContain(
            "if (p_evolution_target_id is null) <> (p_evolution_function is null) then raise exception 'evolution target and function must be paired'; end if;",
        )
        expect(migration).toContain('evolution_target_id, evolution_function, request_fingerprint')
        expect(migration).toContain('p_evolution_target_id, p_evolution_function, p_request_fingerprint, v_day')
    })

    it('replaces the exact previous signature without regressing failed real-image retry behaviour', () => {
        expect(migration).toContain('drop function if exists public.reserve_creature_transformation_request(')
        expect(migration).toContain(
            "and image_provider_mode = 'REAL' and status in ('RESERVED', 'RUNNING', 'SUCCEEDED')",
        )
        expect(migration).toContain('grant execute on function public.reserve_creature_transformation_request(')
    })
})
