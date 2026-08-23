import { describe, expect, it } from 'vitest'
import {
    BOT_COMBAT_MUTATION_LOADOUT,
    RULE_VERSION,
    createInitialAdaptations,
    createInitialCombatMutationState,
    getRoundEventById,
    resolveRound,
} from './index.ts'
describe('audit parity', () =>
    it('uses the production EVOLVE value', () => {
        const result = resolveRound({
            roundNumber: 1,
            roundEvent: getRoundEventById('HEAT_SPIKE'),
            player1Id: 'a',
            player2Id: 'b',
            player1Traits: createInitialAdaptations(),
            player2Traits: createInitialAdaptations(),
            ruleVersion: RULE_VERSION,
            player1CombatMutationState: createInitialCombatMutationState(),
            player2CombatMutationState: createInitialCombatMutationState(),
            player1CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT,
            player2CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT,
            player1Action: { playerId: 'a', trait: 'FEROCITY', actionType: 'EVOLVE' },
            player2Action: { playerId: 'b', trait: 'ARMOR', actionType: 'EVOLVE' },
        })
        expect(result.player1.roundValue).toBe(1)
    }))
