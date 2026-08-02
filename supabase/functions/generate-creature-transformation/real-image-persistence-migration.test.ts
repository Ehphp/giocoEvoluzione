import migration from '../../migrations/202608020004_creature_transformation_real_image_pilot.sql?raw'
import { describe, expect, it } from 'vitest'

describe('real image pilot persistence migration', () => {
    it('adds only asset readiness and validation warnings to the request ledger', () => {
        expect(migration).toContain("add column asset_readiness text check (asset_readiness is null or asset_readiness in ('FINAL_ASSET', 'EXPERIMENT_ONLY'))")
        expect(migration).toContain("add column validation_warnings jsonb not null default '[]'::jsonb")
        expect(migration).not.toMatch(/prompt\s+text|bytea|signed_url|api_key|authorization/i)
    })

    it('keeps the transition RPC server-only and validates readiness/warnings centrally', () => {
        expect(migration).toContain('drop function public.transition_creature_transformation_request')
        expect(migration).toContain('p_asset_readiness text default null')
        expect(migration).toContain('p_validation_warnings jsonb default null')
        expect(migration).toContain("p_asset_readiness not in ('FINAL_ASSET', 'EXPERIMENT_ONLY')")
        expect(migration).toContain("jsonb_typeof(p_validation_warnings) <> 'array'")
        expect(migration).toContain('revoke all on function public.transition_creature_transformation_request')
        expect(migration).toContain('to service_role')
    })
})
