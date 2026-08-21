import { describe, expect, it } from 'vitest'

import { BOT_COMBAT_MUTATION_LOADOUT, RULE_VERSION, canonicalCombatMutationLoadoutCacheKey, createInitialAdaptations, createInitialCombatMutationState, getRoundEventById, parseCombatMutationLoadout, parseCombatMutationState, resolveRound } from './index.ts'

describe('Combat Mutations production contracts', () => {
    it.each([
        {},
        { elasticLimbsUsed: false, adaptiveCoreStatus: 'DORMANT', armoredMemoryUsed: false },
        { elasticLimbsUsed: 'false', adaptiveCoreStatus: 'DORMANT', armoredMemoryUsed: false, recoverySurgeUsed: false },
        { elasticLimbsUsed: false, adaptiveCoreStatus: 'INVALID', armoredMemoryUsed: false, recoverySurgeUsed: false },
        { elasticLimbsUsed: false, adaptiveCoreStatus: 'DORMANT', armoredMemoryUsed: false, recoverySurgeUsed: false, extra: true },
        null,
        [],
        'state',
    ])('rejects malformed runtime state %#', (state) => {
        expect(() => parseCombatMutationState(state)).toThrow('INVALID_COMBAT_MUTATION_STATE')
    })

    it.each([
        undefined,
        ['ELASTIC_LIMBS'],
        ['ELASTIC_LIMBS', 'ADAPTIVE_CORE', 'ARMORED_MEMORY'],
        ['ELASTIC_LIMBS', 'ELASTIC_LIMBS'],
        ['ELASTIC_LIMBS', 'UNKNOWN'],
    ])('rejects malformed ordered loadout %#', (loadout) => {
        expect(() => parseCombatMutationLoadout(loadout)).toThrow('INVALID_COMBAT_MUTATION_LOADOUT')
    })

    it('keeps an explicitly selected slot order while gameplay uses membership', () => {
        const selected = parseCombatMutationLoadout(['ADAPTIVE_CORE', 'ELASTIC_LIMBS'])
        expect(selected).toEqual(['ADAPTIVE_CORE', 'ELASTIC_LIMBS'])
        expect(canonicalCombatMutationLoadoutCacheKey(selected)).toBe(canonicalCombatMutationLoadoutCacheKey(['ELASTIC_LIMBS', 'ADAPTIVE_CORE']))
        expect(selected).toEqual(['ADAPTIVE_CORE', 'ELASTIC_LIMBS'])
    })

    it('rejects a non-frozen rule version before resolving any action', () => {
        expect(() => resolveRound({
            roundNumber: 1,
            roundEvent: getRoundEventById('HEAT_SPIKE'),
            player1Id: 'p1', player2Id: 'p2',
            player1Traits: createInitialAdaptations(), player2Traits: createInitialAdaptations(),
            ruleVersion: 'unknown-ruleset',
            player1CombatMutationState: createInitialCombatMutationState(), player2CombatMutationState: createInitialCombatMutationState(),
            player1CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT, player2CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT,
            player1Action: { playerId: 'p1', trait: 'FEROCITY', actionType: 'USE' }, player2Action: { playerId: 'p2', trait: 'ARMOR', actionType: 'EVOLVE' },
        })).toThrow('UNSUPPORTED_RULE_VERSION')
        expect(RULE_VERSION).toBe('combat-mutations-symbiosis-v1')
    })
})
