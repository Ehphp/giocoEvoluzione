import { describe, expect, it } from 'vitest'

import {
    BOT_COMBAT_MUTATION_LOADOUT,
    RULE_VERSION,
    buildPersistedRoundResolution,
    createInitialAdaptations,
    createInitialCombatMutationState,
    getLegalBotActions,
    getRoundEventById,
    resolveRound,
    type CombatMutationState,
    type ResolveRoundInput,
} from './index.ts'

const event = getRoundEventById('HEAT_SPIKE')
const action = (
    playerId: string,
    trait: 'FEROCITY' | 'ARMOR' | 'AGILITY' | 'SENSES' | 'CAMOUFLAGE',
    actionType: 'USE' | 'EVOLVE',
) => ({ playerId, trait, actionType })

function resolve(overrides: Partial<ResolveRoundInput> = {}) {
    return resolveRound({
        roundNumber: 1,
        roundEvent: event,
        player1Id: 'p1',
        player2Id: 'p2',
        player1Traits: createInitialAdaptations(),
        player2Traits: createInitialAdaptations(),
        ruleVersion: RULE_VERSION,
        player1CombatMutationState: createInitialCombatMutationState(),
        player2CombatMutationState: createInitialCombatMutationState(),
        player1CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT,
        player2CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT,
        player1Action: action('p1', 'AGILITY', 'USE'),
        player2Action: action('p2', 'ARMOR', 'EVOLVE'),
        ...overrides,
    })
}

describe('Combat Mutations MVP', () => {
    it('keeps AGILITY available on its first USE and records Elastic Limbs', () => {
        const result = resolve()

        expect(result.player1.traits.AGILITY.exhausted).toBe(false)
        expect(result.player1.combatMutationState).toMatchObject({
            elasticLimbsUsed: true,
            adaptiveCoreStatus: 'DORMANT',
        })
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
        const armed: CombatMutationState = { ...createInitialCombatMutationState(), adaptiveCoreStatus: 'ARMED' }
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
        expect(firstUse.player1.mutationEffects).toEqual([
            { id: 'ADAPTIVE_CORE', effect: 'ROUND_VALUE_BONUS', value: 1 },
        ])
        expect(secondUse.player1.breakdown.mutationBonus).toBe(0)
        expect(secondUse.player1.combatMutationState.adaptiveCoreStatus).toBe('CONSUMED')
    })

    it('resolves Elastic Limbs and Adaptive Core together on the same AGILITY USE', () => {
        const result = resolve({
            player1CombatMutationState: { ...createInitialCombatMutationState(), adaptiveCoreStatus: 'ARMED' },
        })

        expect(result.player1.breakdown.mutationBonus).toBe(1)
        expect(result.player1.traits.AGILITY.exhausted).toBe(false)
        expect(result.player1.combatMutationState).toMatchObject({
            elasticLimbsUsed: true,
            adaptiveCoreStatus: 'CONSUMED',
        })
        expect(result.player1.mutationEffects).toEqual([
            { id: 'ADAPTIVE_CORE', effect: 'ROUND_VALUE_BONUS', value: 1 },
            { id: 'ELASTIC_LIMBS', effect: 'AGILITY_PRESERVED' },
        ])
    })

    it('is symmetric when player inputs are swapped', () => {
        const leftState: CombatMutationState = { ...createInitialCombatMutationState(), adaptiveCoreStatus: 'ARMED' }
        const rightState: CombatMutationState = createInitialCombatMutationState()
        const forward = resolve({
            player1CombatMutationState: leftState,
            player2CombatMutationState: rightState,
            player1Action: action('p1', 'AGILITY', 'USE'),
            player2Action: action('p2', 'FEROCITY', 'EVOLVE'),
        })
        const swapped = resolve({
            player1Id: 'p2',
            player2Id: 'p1',
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
            player1Id: 'p1',
            player2Id: 'p2',
            player1Score: 0,
            player2Score: 0,
            player1Traits: createInitialAdaptations(),
            player2Traits: createInitialAdaptations(),
            ruleVersion: RULE_VERSION,
            player1CombatMutationState: { ...createInitialCombatMutationState(), adaptiveCoreStatus: 'ARMED' as const },
            player2CombatMutationState: createInitialCombatMutationState(),
            player1CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT,
            player2CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT,
            player1Action: action('p1', 'AGILITY', 'USE'),
            player2Action: action('p2', 'ARMOR', 'EVOLVE'),
            priorRoundValues: [],
            startedAt: null,
            now: () => '2026-08-20T00:00:00.000Z',
        }
        const persisted = buildPersistedRoundResolution(input)

        expect(buildPersistedRoundResolution(input)).toEqual(persisted)
        expect(persisted.resolution_data.player1CombatMutationStateBefore).toMatchObject({
            elasticLimbsUsed: false,
            adaptiveCoreStatus: 'ARMED',
        })
        expect(persisted.resolution_data.player2CombatMutationStateBefore).toEqual(createInitialCombatMutationState())
        expect(persisted.resolution_data.player1CombatMutationStateAfter).toMatchObject({
            elasticLimbsUsed: true,
            adaptiveCoreStatus: 'CONSUMED',
        })
        expect(persisted.resolution_data.player1MutationEffects).toEqual([
            { id: 'ADAPTIVE_CORE', effect: 'ROUND_VALUE_BONUS', value: 1 },
            { id: 'ELASTIC_LIMBS', effect: 'AGILITY_PRESERVED' },
        ])
    })

    it('preserves ARMOR once only when Armored Memory is equipped', () => {
        const first = resolve({
            player1CombatMutationLoadout: ['ADAPTIVE_CORE', 'ARMORED_MEMORY'],
            player1Action: action('p1', 'ARMOR', 'USE'),
        })
        expect(first.player1.traits.ARMOR.exhausted).toBe(false)
        expect(first.player1.combatMutationState.armoredMemoryUsed).toBe(true)
        expect(first.player1.mutationEffects).toEqual([{ id: 'ARMORED_MEMORY', effect: 'ARMOR_PRESERVED' }])

        const second = resolve({
            roundNumber: 2,
            player1CombatMutationLoadout: ['ADAPTIVE_CORE', 'ARMORED_MEMORY'],
            player1Traits: first.player1.traits,
            player2Traits: first.player2.traits,
            player1CombatMutationState: first.player1.combatMutationState,
            player2CombatMutationState: first.player2.combatMutationState,
            player1Action: action('p1', 'ARMOR', 'USE'),
        })
        expect(second.player1.traits.ARMOR.exhausted).toBe(true)
    })

    it('awards Recovery Surge only for its first qualifying exhausted EVOLVE', () => {
        const exhausted = createInitialAdaptations()
        exhausted.SENSES.exhausted = true
        const qualifying = resolve({
            player1CombatMutationLoadout: ['ELASTIC_LIMBS', 'RECOVERY_SURGE'],
            player1Traits: exhausted,
            player1Action: action('p1', 'SENSES', 'EVOLVE'),
        })
        expect(qualifying.player1.breakdown.mutationBonus).toBe(1)
        expect(qualifying.player1.combatMutationState.recoverySurgeUsed).toBe(true)

        const fresh = resolve({
            player1CombatMutationLoadout: ['ELASTIC_LIMBS', 'RECOVERY_SURGE'],
            player1Action: action('p1', 'SENSES', 'EVOLVE'),
        })
        expect(fresh.player1.breakdown.mutationBonus).toBe(0)
        expect(fresh.player1.combatMutationState.recoverySurgeUsed).toBe(false)

        const again = qualifying.player1.traits
        again.ARMOR.exhausted = true
        const consumed = resolve({
            roundNumber: 2,
            player1CombatMutationLoadout: ['ELASTIC_LIMBS', 'RECOVERY_SURGE'],
            player1Traits: again,
            player2Traits: qualifying.player2.traits,
            player1CombatMutationState: qualifying.player1.combatMutationState,
            player2CombatMutationState: qualifying.player2.combatMutationState,
            player1Action: action('p1', 'ARMOR', 'EVOLVE'),
        })
        expect(consumed.player1.breakdown.mutationBonus).toBe(0)
    })

    it('stacks only equipped effects and leaves unequipped mutations untouched', () => {
        const coreAndArmor = resolve({
            player1CombatMutationLoadout: ['ADAPTIVE_CORE', 'ARMORED_MEMORY'],
            player1CombatMutationState: { ...createInitialCombatMutationState(), adaptiveCoreStatus: 'ARMED' },
            player1Action: action('p1', 'ARMOR', 'USE'),
        })
        expect(coreAndArmor.player1.breakdown.mutationBonus).toBe(1)
        expect(coreAndArmor.player1.traits.ARMOR.exhausted).toBe(false)
        expect(coreAndArmor.player1.mutationEffects).toHaveLength(2)

        const exhausted = createInitialAdaptations()
        exhausted.AGILITY.exhausted = true
        const coreAndRecovery = resolve({
            player1CombatMutationLoadout: ['ADAPTIVE_CORE', 'RECOVERY_SURGE'],
            player1Traits: exhausted,
            player1Action: action('p1', 'AGILITY', 'EVOLVE'),
        })
        expect(coreAndRecovery.player1.breakdown.mutationBonus).toBe(1)
        expect(coreAndRecovery.player1.combatMutationState).toMatchObject({
            adaptiveCoreStatus: 'ARMED',
            recoverySurgeUsed: true,
        })

        const notEquipped = resolve({ player1CombatMutationLoadout: ['ADAPTIVE_CORE', 'ARMORED_MEMORY'] })
        expect(notEquipped.player1.traits.AGILITY.exhausted).toBe(true)
        expect(notEquipped.player1.combatMutationState.elasticLimbsUsed).toBe(false)
    })

    it('keeps Core dormant in the state machine when Core is not equipped', () => {
        const result = resolve({
            player1CombatMutationLoadout: ['ELASTIC_LIMBS', 'ARMORED_MEMORY'],
            player1CombatMutationState: { ...createInitialCombatMutationState(), adaptiveCoreStatus: 'ARMED' },
            player1Action: action('p1', 'FEROCITY', 'USE'),
        })

        expect(result.player1.breakdown.mutationBonus).toBe(0)
        expect(result.player1.combatMutationState.adaptiveCoreStatus).toBe('ARMED')
        expect(result.player1.mutationEffects).toEqual([])
    })

    it('keeps Elastic Limbs and Armored Memory independent and does not alter legal actions', () => {
        const first = resolve({
            player1CombatMutationLoadout: ['ELASTIC_LIMBS', 'ARMORED_MEMORY'],
            player1Action: action('p1', 'AGILITY', 'USE'),
        })
        const second = resolve({
            roundNumber: 2,
            player1CombatMutationLoadout: ['ELASTIC_LIMBS', 'ARMORED_MEMORY'],
            player1Traits: first.player1.traits,
            player2Traits: first.player2.traits,
            player1CombatMutationState: first.player1.combatMutationState,
            player2CombatMutationState: first.player2.combatMutationState,
            player1Action: action('p1', 'ARMOR', 'USE'),
        })
        const exhausted = createInitialAdaptations()
        exhausted.ARMOR.exhausted = true

        expect(second.player1.traits.AGILITY.exhausted).toBe(false)
        expect(second.player1.traits.ARMOR.exhausted).toBe(false)
        expect(second.player1.combatMutationState).toMatchObject({ elasticLimbsUsed: true, armoredMemoryUsed: true })
        expect(getLegalBotActions(exhausted)).not.toContainEqual({ trait: 'ARMOR', actionType: 'USE' })
        expect(getLegalBotActions(exhausted)).toContainEqual({ trait: 'ARMOR', actionType: 'EVOLVE' })
    })
})
