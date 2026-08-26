import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
    resolve('supabase/migrations/202608260001_discard_creature_visual_generation.sql'),
    'utf8',
)

describe('discard creature visual generation migration', () => {
    it('closes the track so a new evolution path can be opened', () => {
        expect(migration).toMatch(/create or replace function public\.discard_creature_visual_generation/i)
        expect(migration).toContain("set status = 'CANCELLED', cancelled_at = timezone('utc', now())")
        // The partial unique index that blocks a second path covers ACTIVE..GENERATED but not
        // CANCELLED: closing the track is exactly what frees the slot.
        expect(migration).not.toMatch(/set status = 'COMPLETED'/i)
    })

    it('leaves the wins spent: discarding is an outcome of the path, not a free retry', () => {
        // Adopting and discarding both end a path that opening already paid for. Touching the
        // counter here would hand a second attempt to whoever dislikes the first image.
        expect(migration).not.toMatch(/insert into public\.creature_evolution_target_progress/i)
        expect(migration).not.toMatch(/update public\.creature_evolution_target_progress/i)
        expect(migration).not.toContain('wins')
    })

    it('only discards the generated proposal it was told to discard', () => {
        expect(migration).toContain("if v_track.status <> 'GENERATED' or v_track.generated_request_id is distinct from p_request_id then")
        expect(migration).toContain("raise exception 'VISUAL_TRACK_STATE_CONFLICT'")
        expect(migration).toContain("raise exception 'VISUAL_TRACK_NOT_FOUND'")
    })

    it('is idempotent, so a double submit reports the same closed track', () => {
        const guard = migration.indexOf("if v_track.status = 'CANCELLED'")
        const update = migration.indexOf("set status = 'CANCELLED', cancelled_at")
        expect(guard).toBeGreaterThan(-1)
        // The early return has to precede the update, or the second call would raise a conflict.
        expect(guard).toBeLessThan(update)
    })

    it('serialises against the routine that opens a path on the same creature', () => {
        expect(migration).toContain("pg_advisory_xact_lock(hashtextextended('visual-track:' || p_creature_id::text, 0))")
    })

    it('stays reachable only through the service role', () => {
        expect(migration).toContain(
            'revoke all on function public.discard_creature_visual_generation(uuid, uuid, uuid, uuid)',
        )
        expect(migration).toContain(
            'grant execute on function public.discard_creature_visual_generation(uuid, uuid, uuid, uuid)\n  to service_role;',
        )
    })
})
