import { describe, expect, it } from 'vitest'

import type { PlayerRecord } from '../../../lib/game-api'
import { buildBattleParticipants } from './battleParticipants'

function player(id: string, slot: 1 | 2): PlayerRecord {
    return {
        id,
        game_id: 'game-1',
        nickname: id,
        slot,
        player_type: 'HUMAN',
        traits: {} as PlayerRecord['traits'],
        combat_mutation_state: { elasticLimbsUsed: false, adaptiveCoreStatus: 'DORMANT' },
        connected: true,
        evolution_draft_options: [], chosen_evolution_target_id: null, created_at: '2026-08-03T00:00:00.000Z',
    }
}

const players = [player('host', 1), player('guest', 2)]

describe('buildBattleParticipants', () => {
    it('keeps the host local when their participant id is active', () => {
        const participants = buildBattleParticipants(players, 'host')

        expect(participants.localPlayer?.id).toBe('host')
        expect(participants.remotePlayer?.id).toBe('guest')
    })

    it('keeps the guest local rather than assuming player 1 is local', () => {
        const participants = buildBattleParticipants(players, 'guest')

        expect(participants.localPlayer?.id).toBe('guest')
        expect(participants.remotePlayer?.id).toBe('host')
    })
})
