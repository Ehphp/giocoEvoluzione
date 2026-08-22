import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
    resolve(import.meta.dirname, '../../migrations/202608120001_competitive_skill_rating.sql'),
    'utf8',
)

function expectedDelta(rating: number, opponentRating: number, score: 0 | 0.5 | 1) {
    const expected = 1 / (1 + 10 ** ((opponentRating - rating) / 400))

    return Math.round(32 * (score - expected))
}

describe('competitive skill rating migration contract', () => {
    it('uses the agreed Elo MVP values and preserves zero sum after integer rounding', () => {
        expect(expectedDelta(1000, 1000, 1)).toBe(16)
        expect(expectedDelta(1000, 1000, 0)).toBe(-16)
        expect(expectedDelta(1000, 1000, 0.5)).toBe(0)
        expect(expectedDelta(1000, 1200, 1)).toBe(24)
        expect(expectedDelta(1000, 1200, 0)).toBe(-8)
        expect(expectedDelta(1000, 1200, 0.5)).toBe(8)
        expect(-expectedDelta(1200, 1000, 0)).toBe(expectedDelta(1000, 1200, 1))
        expect(-expectedDelta(1200, 1000, 1)).toBe(expectedDelta(1000, 1200, 0))
        expect(-expectedDelta(1200, 1000, 0.5)).toBe(expectedDelta(1000, 1200, 0.5))
    })

    it('makes rating state server-owned, idempotent and exclusive to valid PvP matches', () => {
        expect(migration).toContain('add column if not exists skill_rating integer not null default 1000')
        expect(migration).toContain('primary key (game_id, profile_id)')
        expect(migration).toContain("if new.game_mode <> 'PVP' then")
        expect(migration).toContain("or v_player_1.player_type <> 'HUMAN'")
        expect(migration).toContain("or v_player_2.player_type <> 'HUMAN'")
        expect(migration).toContain('order by id\n    for update')
        expect(migration).toContain('if v_event_count > 0 then')
        expect(migration).toContain('v_delta_2 := -v_delta_1')
        expect(migration).toContain('revoke update (skill_rating) on table public.profiles from anon, authenticated')
        expect(migration).toContain(
            'revoke all on table public.competitive_rating_events from public, anon, authenticated',
        )
    })

    it('exposes a bounded authenticated leaderboard ordered by rating descending', () => {
        expect(migration).toContain('create or replace function public.get_competitive_leaderboard')
        expect(migration).toContain('v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100))')
        expect(migration).toContain('if auth.uid() is null then')
        expect(migration).toContain('order by profile.skill_rating desc, profile.nickname asc, profile.id asc')
        expect(migration).toContain(
            'grant execute on function public.get_competitive_leaderboard(integer) to authenticated, service_role',
        )
    })
})
