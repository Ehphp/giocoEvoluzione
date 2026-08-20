import { describe, expect, it } from 'vitest'

import { buildPersistedRoundResolution, createInitialAdaptations, createInitialCombatMutationState, getRoundEventById, resolveRound, type CombatMutationState, type ResolveRoundInput } from './index.ts'

const event = getRoundEventById('HEAT_SPIKE')
const action = (playerId: string, trait: 'FEROCITY' | 'ARMOR' | 'AGILITY' | 'SENSES' | 'CAMOUFLAGE', actionType: 'USE' | 'EVOLVE') => ({ playerId, trait, actionType })

function resolve(overrides: Partial<ResolveRoundInput> = {}) {
    return resolveRound({
        roundNumber: 1,
        roundEvent: event,
        player1Id: 'p1',
        player2Id: 'p2',
        player1Traits: createInitialAdaptations(),
        player2Traits: createInitialAdaptations(),
        player1CombatMutationState: createInitialCombatMutationState(),
        player2CombatMutationState: createInitialCombatMutationState(),
        player1Action: action('p1', 'AGILITY', 'USE'),
        player2Action: action('p2', 'ARMOR', 'EVOLVE'),
        ...overrides,
    })
}

describe('Combat Mutations MVP', () => {
    it('keeps AGILITY available on its first USE and records Elastic Limbs', () => {
        const result = resolve()

        expect(result.player1.traits.AGILITY.exhausted).toBe(false)
        expect(result.player1.combatMutationState).toEqual({ elasticLimbsUsed: true, adaptiveCoreStatus: 'DORMANT' })
        expect(result.player1.mutationEffects).toEqual([{ id: 'ELASTIC_LIMBS', effect: 'AGILITY_PRESERVED' }])
    })

    it('exhausts AGILITY normally on its second USE', () => {
        const first = resolve()
        const second = resolve({
            roundNumber: 2,
            player1Traits: first.player1.traits,
            player2Traits: first.player2.traits,
            player1CombatMutationState: first.player1.combatMutationState,
            player2CombatMutationState: first.player2.combatMutationState,
        })

        expect(second.player1.traits.AGILITY.exhausted).toBe(true)
        expect(second.player1.mutationEffects).toEqual([])
    })

    it('arms Adaptive Core on the first EVOLVE only', () => {
        const first = resolve({ player1Action: action('p1', 'FEROCITY', 'EVOLVE') })
        const second = resolve({
            roundNumber: 2,
            player1Traits: first.player1.traits,
            player2Traits: first.player2.traits,
            player1CombatMutationState: first.player1.combatMutationState,
            player2CombatMutationState: first.player2.combatMutationState,
            player1Action: action('p1', 'ARMOR', 'EVOLVE'),
        })

        expect(first.player1.combatMutationState.adaptiveCoreStatus).toBe('ARMED')
        expect(first.player1.mutationEffects).toEqual([{ id: 'ADAPTIVE_CORE', effect: 'CORE_ARMED' }])
        expect(second.player1.combatMutationState.adaptiveCoreStatus).toBe('ARMED')
        expect(second.player1.mutationEffects).toEqual([])
    })

    it('adds +1 exactly to the first USE after Adaptive Core is armed', () => {
        const armed: CombatMutationState = { elasticLimbsUsed: false, adaptiveCoreStatus: 'ARMED' }
        const firstUse = resolve({ player1CombatMutationState: armed, player1Action: action('p1', 'FEROCITY', 'USE') })
        const secondUse = resolve({
            roundNumber: 2,
            player1Traits: firstUse.player1.traits,
            player2Traits: firstUse.player2.traits,
            player1CombatMutationState: firstUse.player1.combatMutationState,
            player2CombatMutationState: firstUse.player2.combatMutationState,
            player1Action: action('p1', 'ARMOR', 'USE'),
        })

        expect(firstUse.player1.breakdown.mutationBonus).toBe(1)
        expect(firstUse.player1.combatMutationState.adaptiveCoreStatus).toBe('CONSUMED')
        expect(firstUse.player1.mutationEffects).toEqual([{ id: 'ADAPTIVE_CORE', effect: 'ROUND_VALUE_BONUS', value: 1 }])
        expect(secondUse.player1.breakdown.mutationBonus).toBe(0)
        expect(secondUse.player1.combatMutationState.adaptiveCoreStatus).toBe('CONSUMED')
    })

    it('resolves Elastic Limbs and Adaptive Core together on the same AGILITY USE', () => {
        const result = resolve({ player1CombatMutationState: { elasticLimbsUsed: false, adaptiveCoreStatus: 'ARMED' } })

        expect(result.player1.breakdown.mutationBonus).toBe(1)
        expect(result.player1.traits.AGILITY.exhausted).toBe(false)
        expect(result.player1.combatMutationState).toEqual({ elasticLimbsUsed: true, adaptiveCoreStatus: 'CONSUMED' })
        expect(result.player1.mutationEffects).toEqual([
            { id: 'ADAPTIVE_CORE', effect: 'ROUND_VALUE_BONUS', value: 1 },
            { id: 'ELASTIC_LIMBS', effect: 'AGILITY_PRESERVED' },
        ])
    })

    it('is symmetric when player inputs are swapped', () => {
        const leftState: CombatMutationState = { elasticLimbsUsed: false, adaptiveCoreStatus: 'ARMED' }
        const rightState: CombatMutationState = { elasticLimbsUsed: false, adaptiveCoreStatus: 'DORMANT' }
        const forward = resolve({
            player1CombatMutationState: leftState,
            player2CombatMutationState: rightState,
            player1Action: action('p1', 'AGILITY', 'USE'),
            player2Action: action('p2', 'FEROCITY', 'EVOLVE'),
        })
        const swapped = resolve({
            player1Id: 'p2', player2Id: 'p1',
            player1CombatMutationState: rightState,
            player2CombatMutationState: leftState,
            player1Action: action('p2', 'FEROCITY', 'EVOLVE'),
            player2Action: action('p1', 'AGILITY', 'USE'),
        })

        expect(swapped.player1.roundValue).toBe(forward.player2.roundValue)
        expect(swapped.player2.roundValue).toBe(forward.player1.roundValue)
        expect(swapped.player1.combatMutationState).toEqual(forward.player2.combatMutationState)
        expect(swapped.player2.combatMutationState).toEqual(forward.player1.combatMutationState)
        expect(swapped.player1.mutationEffects).toEqual(forward.player2.mutationEffects)
        expect(swapped.player2.mutationEffects).toEqual(forward.player1.mutationEffects)
    })

    it('persists mutation state and effects deterministically in resolution_data', () => {
        const input = {
            roundNumber: 1,
            roundEvent: event,
            player1Id: 'p1', player2Id: 'p2', player1Score: 0, player2Score: 0,
            player1Traits: createInitialAdaptations(), player2Traits: createInitialAdaptations(),
            player1CombatMutationState: { elasticLimbsUsed: false, adaptiveCoreStatus: 'ARMED' as const },
            player2CombatMutationState: createInitialCombatMutationState(),
            player1Action: action('p1', 'AGILITY', 'USE'), player2Action: action('p2', 'ARMOR', 'EVOLVE'),
            priorRoundValues: [], startedAt: null, now: () => '2026-08-20T00:00:00.000Z',
        }
        const persisted = buildPersistedRoundResolution(input)

        expect(buildPersistedRoundResolution(input)).toEqual(persisted)
        expect(persisted.resolution_data.player1CombatMutationStateAfter).toEqual({ elasticLimbsUsed: true, adaptiveCoreStatus: 'CONSUMED' })
        expect(persisted.resolution_data.player1MutationEffects).toEqual([
            { id: 'ADAPTIVE_CORE', effect: 'ROUND_VALUE_BONUS', value: 1 },
            { id: 'ELASTIC_LIMBS', effect: 'AGILITY_PRESERVED' },
        ])
    })
})
