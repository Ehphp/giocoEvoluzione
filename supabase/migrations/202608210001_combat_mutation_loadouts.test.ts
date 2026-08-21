import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('./202608210001_combat_mutation_loadouts.sql', import.meta.url), 'utf8')

describe('combat mutation loadout migration contract', () => {
    it('owns configuration on player creatures and snapshots it on match players', () => {
        expect(migration).toContain('player_creatures\n  add column if not exists combat_mutation_loadout text[]')
        expect(migration).toContain('players\n  add column if not exists combat_mutation_loadout text[]')
        expect(migration).toContain("array['ELASTIC_LIMBS', 'ADAPTIVE_CORE']::text[]")
        expect(migration).toContain('public.is_valid_combat_mutation_loadout')
        expect(migration).toContain('public.canonical_combat_mutation_loadout')
        expect(migration).toContain('cardinality(value) = 2')
        expect(migration).toContain('value[1] is distinct from value[2]')
        expect(migration).toContain("mutation not in ('ELASTIC_LIMBS', 'ADAPTIVE_CORE', 'ARMORED_MEMORY', 'RECOVERY_SURGE')")
    })

    it('protects the write RPC and snapshots every match creation path server-side', () => {
        expect(migration).toContain('set_my_creature_combat_mutation_loadout')
        expect(migration).toContain("where id = p_creature_id and profile_id = v_profile_id")
        expect(migration).toContain('create or replace function public.create_pvp_game')
        expect(migration).toContain('create or replace function public.join_pvp_game')
        expect(migration).toContain('create or replace function public.create_vs_bot_game')
        expect(migration).toContain("(v_bot_player_id, v_game_id, 'Bot'")
        expect(migration).toContain("if v_profile_id is null or p_profile_id is distinct from v_profile_id then raise exception 'AUTHENTICATION_REQUIRED'; end if;")
        expect(migration).toContain("(p_player_id, v_game_id, v_nickname, 1, 'HUMAN'")
    })

    it('backfills the expanded runtime state without granting new powers to open matches', () => {
        expect(migration).toContain("'armoredMemoryUsed', coalesce")
        expect(migration).toContain("'recoverySurgeUsed', coalesce")
        expect(migration).toContain('players_combat_mutation_state_check')
    })
})
