import { describe, expect, it } from 'vitest'
import { ROUND_EVENT_DEFINITIONS, createInitialGenes, getRoundEventById, getValidatedGeneUseBreakdown, resolveRound, validateCatalog } from './index.ts'

describe('five-gene rules', () => {
    it('validates the approved event matrix with explicit zero signs', () => {
        expect(validateCatalog()).toEqual([])
        expect(ROUND_EVENT_DEFINITIONS).toHaveLength(6)
    })

    it('scores USE as base plus level plus direct event modifier', () => {
        const genes = createInitialGenes()
        genes.RESILIENCE.level = 2
        expect(getValidatedGeneUseBreakdown(getRoundEventById('VOLCANIC_ASH_WAVE'), genes, 'RESILIENCE').total).toBe(5)
    })

    it('applies cooldown, evolves to cap three, and rejects illegal actions', () => {
        let genes = createInitialGenes()
        for (let roundNumber = 1; roundNumber <= 3; roundNumber += 1) {
            const result = resolveRound({ roundNumber, roundEvent: getRoundEventById('HEAT_SPIKE'), player1Id: 'p1', player2Id: 'p2', player1Traits: genes, player2Traits: createInitialGenes(), player1Action: { playerId: 'p1', trait: 'METABOLISM', actionType: 'EVOLVE' }, player2Action: { playerId: 'p2', trait: 'AQUATIC', actionType: 'EVOLVE' } })
            genes = result.player1.traits
        }
        expect(genes.METABOLISM.level).toBe(3)
        expect(() => resolveRound({ roundNumber: 4, roundEvent: getRoundEventById('HEAT_SPIKE'), player1Id: 'p1', player2Id: 'p2', player1Traits: genes, player2Traits: createInitialGenes(), player1Action: { playerId: 'p1', trait: 'METABOLISM', actionType: 'EVOLVE' }, player2Action: { playerId: 'p2', trait: 'AQUATIC', actionType: 'USE' } })).toThrow(/maximum level/i)
        const used = resolveRound({ roundNumber: 4, roundEvent: getRoundEventById('HEAT_SPIKE'), player1Id: 'p1', player2Id: 'p2', player1Traits: genes, player2Traits: createInitialGenes(), player1Action: { playerId: 'p1', trait: 'METABOLISM', actionType: 'USE' }, player2Action: { playerId: 'p2', trait: 'AQUATIC', actionType: 'USE' } })
        expect(used.player1.traits.METABOLISM.cooldown).toBe(1)
    })
})
