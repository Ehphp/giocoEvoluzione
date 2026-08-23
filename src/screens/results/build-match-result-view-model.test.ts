import { describe, expect, it } from 'vitest'

import type { GameSnapshot, RoundResultRecord } from '../../lib/game-api'
import { buildMatchResultViewModel } from './build-match-result-view-model'

function makeResult(roundNumber: number, overrides: Partial<RoundResultRecord> = {}): RoundResultRecord {
    return {
        id: `result-${roundNumber}`,
        game_id: 'game',
        round_number: roundNumber,
        player_1_value: roundNumber + 2,
        player_2_value: roundNumber,
        winner_id: 'player-1',
        resolution_data: {
            player1PointsAwarded: 1,
            player2PointsAwarded: 0,
            player1Action: { trait: 'AGILITY', actionType: 'USE' },
            player2Action: { trait: 'ARMOR', actionType: 'EVOLVE' },
        },
        created_at: '2026-01-01T10:00:00.000Z',
        ...overrides,
    }
}

function makeSnapshot(roundResults: RoundResultRecord[]): GameSnapshot {
    const player = {
        id: 'player-1', game_id: 'game', nickname: 'Naturalista', slot: 1 as const, player_type: 'HUMAN' as const,
        traits: {} as GameSnapshot['me'] extends { traits: infer Traits } ? Traits : never,
        combat_mutation_state: { elasticLimbsUsed: false, adaptiveCoreStatus: 'DORMANT' as const, armoredMemoryUsed: false, recoverySurgeUsed: false },
        combat_mutation_loadout: ['ELASTIC_LIMBS', 'ADAPTIVE_CORE'] as const,
        connected: true, evolution_draft_options: [], chosen_evolution_target_id: null, created_at: '2026-01-01T10:00:00.000Z',
    }
    const opponent = {
        id: 'player-2', game_id: 'game', nickname: 'Bot', slot: 2 as const, player_type: 'BOT' as const,
        traits: {} as GameSnapshot['opponent'] extends { traits: infer Traits } ? Traits : never,
        combat_mutation_state: { elasticLimbsUsed: false, adaptiveCoreStatus: 'DORMANT' as const, armoredMemoryUsed: false, recoverySurgeUsed: false },
        combat_mutation_loadout: ['ELASTIC_LIMBS', 'ADAPTIVE_CORE'] as const,
        connected: true, evolution_draft_options: [], chosen_evolution_target_id: null, created_at: '2026-01-01T10:00:00.000Z',
    }

    return {
        game: {
            id: 'game', room_code: 'ABCDE', game_mode: 'VS_BOT', bot_difficulty: 'NORMAL', status: 'FINISHED', current_round: 2,
            world_id: 'world', round_event_sequence: ['missing-event-1', 'missing-event-2'], player_1_id: player.id, player_2_id: opponent.id,
            player_1_score: 2, player_2_score: 0, winner_id: player.id, started_at: '2026-01-01T10:00:00.000Z',
            finished_at: '2026-01-01T10:02:00.000Z', rematch_count: 0, rule_version: 'combat-mutations-loadout-mvp-v1', symbiosis_links: [], scheduled_rounds: 7, fine_del_mondo_activations: [], created_at: '2026-01-01T10:00:00.000Z', updated_at: '2026-01-01T10:02:00.000Z', state_revision: 0,
        },
        players: [player, opponent],
        me: player,
        opponent,
        world: { id: 'world', name: 'Mondo', planetName: 'Pianeta', backgroundArtKey: 'forest', paletteKey: 'green' },
        currentRoundEvent: null,
        nextRoundEvent: null,
        actionsSubmitted: 2,
        myCurrentAction: null,
        currentRoundResult: null,
        roundResults,
        stateRevision: 0,
    }
}

describe('buildMatchResultViewModel', () => {
    it('maps and orders only persisted rounds, including USE and EVOLVE data', () => {
        const model = buildMatchResultViewModel(makeSnapshot([makeResult(2), makeResult(1)]), 2, 0)

        expect(model?.rounds.map((round) => round.number)).toEqual([1, 2])
        expect(model?.lastRound?.player.action).toEqual({ trait: 'AGILITY', actionType: 'USE' })
        expect(model?.lastRound?.opponent.action).toEqual({ trait: 'ARMOR', actionType: 'EVOLVE' })
        expect(model?.metrics).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'round-values', value: '7 – 3' }),
            expect.objectContaining({ id: 'duration', value: '2 min' }),
        ]))
    })

    it('uses only persisted tiebreak totals and keeps legacy breakdowns unavailable', () => {
        const finalRound = makeResult(2, {
            resolution_data: {
                matchEndReason: 'ROUND_VALUE_TIEBREAK',
                player1RoundValueTotal: 9,
                player2RoundValueTotal: 7,
                player1Action: { trait: 'SENSES', actionType: 'USE' },
                player2Action: { trait: 'CAMOUFLAGE', actionType: 'USE' },
            },
        })
        const model = buildMatchResultViewModel(makeSnapshot([finalRound]), 1, 1)

        expect(model?.player.tiebreakTotal).toBe(9)
        expect(model?.opponent.tiebreakTotal).toBe(7)
        expect(model?.metrics).toContainEqual({ id: 'tiebreak', label: 'Tiebreak', value: '9 – 7' })
        expect(model?.lastRound?.player.breakdown).toBeNull()
    })
})
