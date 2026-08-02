import migration from '../../migrations/202608020003_creature_transformation_request_persistence.sql?raw'
import { describe, expect, it } from 'vitest'

describe('creature transformation request persistence migration', () => {
    it('defines an RLS-protected request ledger with strong per-profile idempotency', () => {
        expect(migration).toContain('create table public.creature_transformation_requests')
        expect(migration).toContain('unique (profile_id, idempotency_key)')
        expect(migration).toContain('alter table public.creature_transformation_requests enable row level security')
        expect(migration).toContain('for select to authenticated')
        expect(migration).toContain('using (profile_id = auth.uid())')
        expect(migration).toContain('grant select on public.creature_transformation_requests to authenticated')
        expect(migration).not.toMatch(/for\s+(insert|update|delete)\s+to\s+authenticated/i)
        expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+public\.creature_transformation_requests\s+to\s+authenticated/i)
    })

    it('uses advisory locking, UTC quota checks and constrained state transitions inside server-only RPCs', () => {
        expect(migration).toContain('pg_advisory_xact_lock')
        expect(migration).toContain("v_day_start::date::text, 1")
        expect(migration).toContain("'DAILY_LIMIT_REACHED'")
        expect(migration).toContain("'DAILY_BUDGET_REACHED'")
        expect(migration).toContain("status in ('RESERVED', 'RUNNING', 'SUCCEEDED', 'FAILED')")
        expect(migration).toContain("v_request.status = 'RESERVED' and p_target_status in ('RUNNING', 'FAILED')")
        expect(migration).toContain("v_request.status = 'RUNNING' and p_target_status in ('SUCCEEDED', 'FAILED')")
        expect(migration).toContain('revoke all on function public.reserve_creature_transformation_request')
        expect(migration).toContain('grant execute on function public.reserve_creature_transformation_request')
    })

    it('does not persist prompts, image bytes, signed URLs or API keys', () => {
        expect(migration).not.toMatch(/prompt\s+text/i)
        expect(migration).not.toMatch(/bytea|signed_url|api_key/i)
    })
})
