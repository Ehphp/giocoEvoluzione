import { describe, expect, it } from 'vitest'

import { resolveEdgeRound } from '../../supabase/functions/resolve-round/round-domain.ts'
import { createInitialAdaptations, createInitialCombatMutationState, getRoundEventById } from './index.ts'

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

    it('persists the shared Combat Mutations transition without Edge-specific rules', () => {
        const result = resolveEdgeRound({
            roundNumber: 1,
            roundEvent: getRoundEventById('HEAT_SPIKE'),
            player1Id: 'p1',
            player2Id: 'p2',
            player1Score: 0, player2Score: 0,
            player1Traits: createInitialAdaptations(),
            player2Traits: createInitialAdaptations(),
            player1CombatMutationState: { elasticLimbsUsed: false, adaptiveCoreStatus: 'ARMED' },
            player2CombatMutationState: createInitialCombatMutationState(),
            player1Action: { playerId: 'p1', trait: 'AGILITY', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'ARMOR', actionType: 'EVOLVE' },
            startedAt: null,
        })

        expect(result.resolution_data.player1CombatMutationStateAfter).toEqual({ elasticLimbsUsed: true, adaptiveCoreStatus: 'CONSUMED' })
        expect(result.resolution_data.player1MutationEffects).toEqual([
            { id: 'ADAPTIVE_CORE', effect: 'ROUND_VALUE_BONUS', value: 1 },
            { id: 'ELASTIC_LIMBS', effect: 'AGILITY_PRESERVED' },
        ])
    })
})
