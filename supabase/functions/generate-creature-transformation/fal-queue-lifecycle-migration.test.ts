import migration from '../../migrations/202608160001_fal_queue_lifecycle.sql?raw'
import { describe, expect, it } from 'vitest'

describe('Fal Queue lifecycle migration', () => {
    it('stores only queue metadata and makes the provider request id unique', () => {
        expect(migration).toContain('add column if not exists fal_workflow jsonb')
        expect(migration).toContain('add column if not exists fal_finalization_request_id text')
        expect(migration).toContain('creature_transformation_requests_provider_request_id_key')
        expect(migration).not.toMatch(/bytea|signed_url|api_key/i)
    })

    it('atomically replaces retry ids and claims finalization through service-only RPCs', () => {
        expect(migration).toContain('create or replace function public.update_running_fal_submission')
        expect(migration).toContain('p_expected_provider_request_id')
        expect(migration).toContain('fal_finalization_request_id = null')
        expect(migration).toContain('create or replace function public.claim_fal_transformation_finalization')
        expect(migration).toContain("jsonb_build_object('outcome', 'CLAIMED'")
        expect(migration).toContain('revoke all on function public.update_running_fal_submission')
        expect(migration).toContain('grant execute on function public.claim_fal_transformation_finalization')
    })
})
