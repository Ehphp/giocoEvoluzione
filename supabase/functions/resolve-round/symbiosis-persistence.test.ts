import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
    RULE_VERSION,
    buildPersistedRoundResolution,
    createInitialAdaptations,
    createInitialCombatMutationState,
    getRoundEventById,
    type CombatMutationLoadout,
    type SymbiosisLink,
} from '../../../shared/game-rules/index.ts'

const migration = readFileSync(resolve('supabase/migrations/202608210003_combat_mutations_symbiosis.sql'), 'utf8')
const loadout: CombatMutationLoadout = ['SYMBIOSIS', 'ADAPTIVE_CORE']
const link: SymbiosisLink = {
    ownerPlayerId: 'p1',
    sourceTrait: 'FEROCITY',
    targetPlayerId: 'p2',
    targetTrait: 'ARMOR',
    activatedRound: 1,
}

describe('SYMBIOSIS persistence contract', () => {
    it('persists readable activation data plus before/after match links for reconnect', () => {
        const result = buildPersistedRoundResolution({
            roundNumber: 1,
            roundEvent: getRoundEventById('HEAT_SPIKE'),
            player1Id: 'p1',
            player2Id: 'p2',
            player1Score: 0,
            player2Score: 0,
            player1Traits: createInitialAdaptations(),
            player2Traits: createInitialAdaptations(),
            ruleVersion: RULE_VERSION,
            player1CombatMutationLoadout: loadout,
            player2CombatMutationLoadout: loadout,
            player1CombatMutationState: createInitialCombatMutationState(),
            player2CombatMutationState: createInitialCombatMutationState(),
            player1Action: {
                playerId: 'p1',
                actionType: 'ACTIVATE_MUTATION',
                mutationId: 'SYMBIOSIS',
                sourceTrait: 'FEROCITY',
                targetTrait: 'ARMOR',
            },
            player2Action: { playerId: 'p2', trait: 'SENSES', actionType: 'USE' },
            priorRoundValues: [],
            startedAt: null,
        })
        expect(result.resolution_data.symbiosisLinksBefore).toEqual([])
        expect(result.resolution_data.symbiosisLinksAfter).toEqual([link])
        expect(result.resolution_data.player1Action).toMatchObject({
            actionType: 'ACTIVATE_MUTATION',
            mutationId: 'SYMBIOSIS',
            sourceTrait: 'FEROCITY',
            targetTrait: 'ARMOR',
        })
        expect(result.player_1_value).toBe(0)
    })

    it('makes the database own validation, secrecy-compatible payload storage, and atomic link commit', () => {
        expect(migration).toContain('add column if not exists symbiosis_links jsonb not null default')
        expect(migration).toContain("'ACTIVATE_MUTATION'")
        expect(migration).toContain("p_mutation_id <> 'SYMBIOSIS'")
        expect(migration).toContain('SYMBIOSIS_NOT_EQUIPPED')
        expect(migration).toContain('SYMBIOSIS_ALREADY_CONSUMED')
        expect(migration).toContain('p_symbiosis_links jsonb')
        expect(migration).toContain('symbiosis_links=p_symbiosis_links')
        expect(migration).toContain('on conflict(game_id, round_number, player_id) do nothing')
        // get_game_snapshot already exposes only the caller's current action while CHOOSING;
        // mutation_id/target_trait remain inside that same row until resolution/reveal.
        expect(readFileSync(resolve('supabase/migrations/202608080001_game_snapshot_sync.sql'), 'utf8')).toContain(
            "'myCurrentAction', case when v_my_action.id is null",
        )
    })
})
