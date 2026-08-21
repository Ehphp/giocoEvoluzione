import { describe, expect, it } from 'vitest'
import { RULE_VERSION, createInitialAdaptations, createInitialCombatMutationState, getRoundEventById, resolveRound, resolveSymbiosisPropagation, type AdaptationCollection, type CombatMutationLoadout, type ResolveRoundInput, type SymbiosisLink } from './index.ts'

const passive: CombatMutationLoadout = ['ELASTIC_LIMBS', 'ADAPTIVE_CORE']
const symbiosis: CombatMutationLoadout = ['SYMBIOSIS', 'ADAPTIVE_CORE']
const event = getRoundEventById('HEAT_SPIKE')
const link = (sourceTrait: SymbiosisLink['sourceTrait'], targetTrait: SymbiosisLink['targetTrait'], ownerPlayerId = 'p1', targetPlayerId = 'p2'): SymbiosisLink => ({ ownerPlayerId, sourceTrait, targetPlayerId, targetTrait, activatedRound: 1 })
function traits(overrides: Partial<Record<keyof AdaptationCollection, Partial<AdaptationCollection[keyof AdaptationCollection]>>> = {}): AdaptationCollection {
    const result = createInitialAdaptations()
    for (const [trait, state] of Object.entries(overrides)) Object.assign(result[trait as keyof AdaptationCollection], state)
    return result
}
function round(overrides: Partial<ResolveRoundInput> = {}) {
    return resolveRound({
        roundNumber: 1, roundEvent: event, player1Id: 'p1', player2Id: 'p2', ruleVersion: RULE_VERSION,
        player1Traits: createInitialAdaptations(), player2Traits: createInitialAdaptations(),
        player1CombatMutationState: createInitialCombatMutationState(), player2CombatMutationState: createInitialCombatMutationState(),
        player1CombatMutationLoadout: symbiosis, player2CombatMutationLoadout: symbiosis,
        player1Action: { playerId: 'p1', trait: 'FEROCITY', actionType: 'USE' }, player2Action: { playerId: 'p2', trait: 'ARMOR', actionType: 'USE' },
        ...overrides,
    })
}

describe('SYMBIOSIS', () => {
    it('uses a real zero-value action and leaves genes untouched in the activation round', () => {
        const result = round({ player1Action: { playerId: 'p1', actionType: 'ACTIVATE_MUTATION', mutationId: 'SYMBIOSIS', sourceTrait: 'FEROCITY', targetTrait: 'ARMOR' } })
        expect(result.player1.roundValue).toBe(0)
        expect(result.player1.traits).toEqual(createInitialAdaptations())
        expect(result.symbiosisLinks).toEqual([link('FEROCITY', 'ARMOR')])
        expect(result.symbiosisEvents).toEqual([{ effect: 'LINK_ACTIVATED', link: link('FEROCITY', 'ARMOR') }])
    })

    it('requires the equipped mutation and rejects a second activation', () => {
        expect(() => round({ player1CombatMutationLoadout: passive, player1Action: { playerId: 'p1', actionType: 'ACTIVATE_MUTATION', mutationId: 'SYMBIOSIS', sourceTrait: 'FEROCITY', targetTrait: 'ARMOR' } })).toThrow('not equipped')
        expect(() => round({ roundNumber: 2, symbiosisLinks: [link('FEROCITY', 'ARMOR')], player1Action: { playerId: 'p1', actionType: 'ACTIVATE_MUTATION', mutationId: 'SYMBIOSIS', sourceTrait: 'SENSES', targetTrait: 'AGILITY' } })).toThrow('already been activated')
    })

    it('allows simultaneous activations and keeps both ownership records', () => {
        const result = round({
            player1Action: { playerId: 'p1', actionType: 'ACTIVATE_MUTATION', mutationId: 'SYMBIOSIS', sourceTrait: 'FEROCITY', targetTrait: 'ARMOR' },
            player2Action: { playerId: 'p2', actionType: 'ACTIVATE_MUTATION', mutationId: 'SYMBIOSIS', sourceTrait: 'SENSES', targetTrait: 'AGILITY' },
        })
        expect([result.player1.roundValue, result.player2.roundValue]).toEqual([0, 0])
        expect(result.symbiosisLinks).toEqual([link('FEROCITY', 'ARMOR'), link('SENSES', 'AGILITY', 'p2', 'p1')])
    })

    it('reflects only genuine direct EVOLVE level-ups in both directions without changing exhaustion', () => {
        const first = round({
            roundNumber: 2, symbiosisLinks: [link('FEROCITY', 'ARMOR')],
            player1Action: { playerId: 'p1', trait: 'FEROCITY', actionType: 'EVOLVE' },
            player2Traits: traits({ ARMOR: { exhausted: true } }), player2Action: { playerId: 'p2', trait: 'SENSES', actionType: 'USE' },
        })
        expect(first.player2.traits.ARMOR).toEqual({ level: 1, exhausted: true })
        const second = round({
            roundNumber: 2, symbiosisLinks: [link('FEROCITY', 'ARMOR')],
            player2Action: { playerId: 'p2', trait: 'ARMOR', actionType: 'EVOLVE' },
            player1Action: { playerId: 'p1', trait: 'SENSES', actionType: 'USE' },
        })
        expect(second.player1.traits.FEROCITY.level).toBe(1)
    })

    it('does not reflect a max-level recovery and caps a reflected increase', () => {
        const recovery = round({
            roundNumber: 2, symbiosisLinks: [link('FEROCITY', 'ARMOR')],
            player1Traits: traits({ FEROCITY: { level: 2, exhausted: true } }),
            player2Traits: traits({ ARMOR: { level: 0 } }),
            player1Action: { playerId: 'p1', trait: 'FEROCITY', actionType: 'EVOLVE' }, player2Action: { playerId: 'p2', trait: 'SENSES', actionType: 'USE' },
        })
        expect(recovery.player2.traits.ARMOR.level).toBe(0)
        const capped = round({
            roundNumber: 2, symbiosisLinks: [link('FEROCITY', 'ARMOR')],
            player1Traits: traits({ FEROCITY: { level: 1 } }), player2Traits: traits({ ARMOR: { level: 2, exhausted: true } }),
            player1Action: { playerId: 'p1', trait: 'FEROCITY', actionType: 'EVOLVE' }, player2Action: { playerId: 'p2', trait: 'SENSES', actionType: 'USE' },
        })
        expect(capped.player2.traits.ARMOR).toEqual({ level: 2, exhausted: true })
        expect(capped.symbiosisEvents).toMatchObject([{ effect: 'LEVEL_REFLECTED', appliedLevels: 0 }])
    })

    it('deduplicates inverse links for propagation while retaining both consumed slots', () => {
        const inverse = link('ARMOR', 'FEROCITY', 'p2', 'p1')
        const result = round({
            roundNumber: 2, symbiosisLinks: [link('FEROCITY', 'ARMOR'), inverse],
            player1Action: { playerId: 'p1', trait: 'FEROCITY', actionType: 'EVOLVE' }, player2Action: { playerId: 'p2', trait: 'SENSES', actionType: 'USE' },
        })
        expect(result.symbiosisLinks).toHaveLength(2)
        expect(result.player2.traits.ARMOR.level).toBe(1)
        expect(result.symbiosisEvents).toMatchObject([{ effect: 'LEVEL_REFLECTED', requestedLevels: 1 }])
    })

    it('aggregates distinct overlapping links, is order independent, and never recurses', () => {
        const links: SymbiosisLink[] = [link('FEROCITY', 'ARMOR', 'a', 'b'), link('SENSES', 'ARMOR', 'c', 'b'), link('ARMOR', 'AGILITY', 'b', 'd')]
        const ups = [{ playerId: 'a', trait: 'FEROCITY' as const }, { playerId: 'c', trait: 'SENSES' as const }]
        const forward = resolveSymbiosisPropagation(links, ups)
        const reversed = resolveSymbiosisPropagation([...links].reverse(), [...ups].reverse())
        expect(forward).toEqual(reversed)
        expect(forward).toMatchObject([{ targetPlayerId: 'b', targetTrait: 'ARMOR', requestedLevels: 2 }])
        // The reflected ARMOR does not activate the ARMOR ↔ AGILITY link.
        expect(forward.some((target) => target.targetPlayerId === 'd')).toBe(false)
    })

    it('does not fire passive mutations on the reflected increase', () => {
        const result = round({
            roundNumber: 2, symbiosisLinks: [link('FEROCITY', 'ARMOR')],
            player1CombatMutationLoadout: passive, player2CombatMutationLoadout: symbiosis,
            player1Action: { playerId: 'p1', trait: 'FEROCITY', actionType: 'EVOLVE' }, player2Action: { playerId: 'p2', trait: 'SENSES', actionType: 'USE' },
        })
        expect(result.player2.combatMutationState.adaptiveCoreStatus).toBe('DORMANT')
        expect(result.player2.mutationEffects).toEqual([])
    })
})
