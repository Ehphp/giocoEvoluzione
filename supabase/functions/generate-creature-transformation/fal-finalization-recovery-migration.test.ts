import migration from '../../migrations/202608280001_recover_stale_fal_finalization_claims.sql?raw'
import { describe, expect, it } from 'vitest'

describe('Fal finalization stale-claim recovery migration', () => {
    it('reclaims only a stale claim for the same running provider request', () => {
        expect(migration).toContain("v_request.status <> 'RUNNING'")
        expect(migration).toContain('v_request.fal_finalization_request_id <> p_provider_request_id')
        expect(migration).toContain("interval '10 minutes'")
        expect(migration).toContain('set fal_finalization_request_id = null')
        expect(migration).toContain("jsonb_build_object('outcome', 'CLAIMED'")
    })

    it('keeps the recovery service-only and never submits a new provider request', () => {
        expect(migration).toContain('grant execute on function public.claim_fal_transformation_finalization(text) to service_role')
        expect(migration).not.toMatch(/insert into|submitSeedreamEvolution/i)
    })
})
