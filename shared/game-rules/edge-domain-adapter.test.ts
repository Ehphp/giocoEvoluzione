import { describe, expect, it } from 'vitest'

import { resolveEdgeRound } from '../../supabase/functions/resolve-round/round-domain.ts'
import { createInitialAdaptations, getRoundEventById } from './index.ts'

describe('resolve-round pure domain adapter', () => {
    it('delegates the persisted resolution to the shared domain', () => {
        const result = resolveEdgeRound({
            roundNumber: 1,
            roundEvent: getRoundEventById('HEAT_SPIKE'),
            player1Id: 'p1',
            player2Id: 'p2',
            player1Score: 0,
            player2Score: 0,
            player1Traits: createInitialAdaptations(),
            player2Traits: createInitialAdaptations(),
            player1Action: { playerId: 'p1', trait: 'FEROCITY', actionType: 'EVOLVE' },
            player2Action: { playerId: 'p2', trait: 'ARMOR', actionType: 'EVOLVE' },
            startedAt: null,
        })

        expect([result.player_1_value, result.player_2_value, result.winner_id]).toEqual([1, 1, null])
    })
})
