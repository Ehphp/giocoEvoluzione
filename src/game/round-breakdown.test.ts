import { describe, expect, it } from 'vitest'

import { createInitialTraits } from './config'
import { resolveRound } from './engine'
import { getRoundEventById } from './round-events'

describe('round breakdown', () => {
    const ash = getRoundEventById('VOLCANIC_ASH_WAVE')
    const eclipse = getRoundEventById('PROLONGED_ECLIPSE')
    const heat = getRoundEventById('HEAT_SPIKE')

    it('resolves normal USE vs USE with consistent breakdown totals', () => {
        const result = resolveRound({
            roundNumber: 1,
            roundEvent: ash,
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: createInitialTraits(),
            player2Traits: createInitialTraits(),
            player1Action: { playerId: 'p1', trait: 'RESISTANCE', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'STRENGTH', actionType: 'USE' },
        })

        expect(result.winnerId).toBe('p1')
        expect(result.player1.breakdown.total).toBe(result.player1.roundValue)
        expect(result.player2.breakdown.total).toBe(result.player2.roundValue)
    })

    it('resolves tie and preserves equal totals', () => {
        const result = resolveRound({
            roundNumber: 1,
            roundEvent: eclipse,
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: createInitialTraits(),
            player2Traits: createInitialTraits(),
            player1Action: { playerId: 'p1', trait: 'PERCEPTION', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'PERCEPTION', actionType: 'USE' },
        })

        expect(result.winnerId).toBeNull()
        expect(result.player1.roundValue).toBe(result.player2.roundValue)
        expect(result.player1.breakdown.total).toBe(result.player2.breakdown.total)
    })

    it('handles USE vs EVOLVE with zero breakdown total on EVOLVE', () => {
        const result = resolveRound({
            roundNumber: 1,
            roundEvent: heat,
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: createInitialTraits(),
            player2Traits: createInitialTraits(),
            player1Action: { playerId: 'p1', trait: 'METABOLISM', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'RESISTANCE', actionType: 'EVOLVE' },
        })

        expect(result.player1.roundValue).toBeGreaterThan(result.player2.roundValue)
        expect(result.player2.breakdown.actionType).toBe('EVOLVE')
        expect(result.player2.breakdown.total).toBe(0)
    })

    it('handles both EVOLVE without scoring points in breakdown totals', () => {
        const result = resolveRound({
            roundNumber: 1,
            roundEvent: ash,
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: createInitialTraits(),
            player2Traits: createInitialTraits(),
            player1Action: { playerId: 'p1', trait: 'GRIP_CLAWS', actionType: 'EVOLVE' },
            player2Action: { playerId: 'p2', trait: 'RESISTANCE', actionType: 'EVOLVE' },
        })

        expect(result.winnerId).toBeNull()
        expect(result.player1.breakdown.total).toBe(0)
        expect(result.player2.breakdown.total).toBe(0)
    })

    it('applies level cap in breakdown while preserving original level', () => {
        const traits = createInitialTraits()
        traits.CAMOUFLAGE.level = 7

        const result = resolveRound({
            roundNumber: 1,
            roundEvent: eclipse,
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: traits,
            player2Traits: createInitialTraits(),
            player1Action: { playerId: 'p1', trait: 'CAMOUFLAGE', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'RESISTANCE', actionType: 'USE' },
        })

        expect(result.player1.breakdown.originalLevel).toBe(7)
        expect(result.player1.breakdown.effectiveLevel).toBe(5)
        expect(result.player1.breakdown.levelContribution).toBe(5)
        expect(result.player1.breakdown.total).toBe(result.player1.roundValue)
    })
})
