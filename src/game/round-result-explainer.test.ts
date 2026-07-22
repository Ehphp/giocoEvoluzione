import { describe, expect, it } from 'vitest'

import type { RoundValueBreakdown } from './types'
import { getRoundExplanation } from './round-result-explainer'

function breakdown(overrides?: Partial<RoundValueBreakdown>): RoundValueBreakdown {
    return {
        actionType: 'USE',
        environmentModifier: 2,
        environmentWeight: 2,
        environmentContribution: 4,
        originalLevel: 1,
        effectiveLevel: 1,
        levelContribution: 1,
        total: 5,
        ...overrides,
    }
}

describe('round result explainer', () => {
    it('returns historical fallback when breakdown is missing', () => {
        const message = getRoundExplanation({
            environment: 'FOREST',
            meWon: true,
            meActionType: 'USE',
            opponentActionType: 'USE',
            myBreakdown: null,
            opponentBreakdown: null,
        })

        expect(message).toMatch(/storico/i)
    })

    it('explains tie deterministically', () => {
        const message = getRoundExplanation({
            environment: 'SWAMP',
            meWon: null,
            meActionType: 'USE',
            opponentActionType: 'USE',
            myBreakdown: breakdown({ total: 6 }),
            opponentBreakdown: breakdown({ total: 6 }),
        })

        expect(message).toBe('Entrambi i geni hanno prodotto lo stesso valore.')
    })

    it('explains USE vs EVOLVE', () => {
        const message = getRoundExplanation({
            environment: 'MOUNTAIN',
            meWon: true,
            meActionType: 'USE',
            opponentActionType: 'EVOLVE',
            myBreakdown: breakdown({ total: 7 }),
            opponentBreakdown: breakdown({ actionType: 'EVOLVE', total: 0 }),
        })

        expect(message).toBe('L avversario ha evoluto il gene, rinunciando al punteggio di questo round.')
    })

    it('explains both players evolving', () => {
        const message = getRoundExplanation({
            environment: 'FOREST',
            meWon: null,
            meActionType: 'EVOLVE',
            opponentActionType: 'EVOLVE',
            myBreakdown: breakdown({ actionType: 'EVOLVE', total: 0 }),
            opponentBreakdown: breakdown({ actionType: 'EVOLVE', total: 0 }),
        })

        expect(message).toBe('Entrambi avete evoluto il gene, rinunciando al punteggio di questo round.')
    })

    it('explains when player evolves and gives up round score', () => {
        const message = getRoundExplanation({
            environment: 'MOUNTAIN',
            meWon: false,
            meActionType: 'EVOLVE',
            opponentActionType: 'USE',
            myBreakdown: breakdown({ actionType: 'EVOLVE', total: 0 }),
            opponentBreakdown: breakdown({ total: 6 }),
        })

        expect(message).toBe('Hai evoluto il gene, rinunciando al punteggio di questo round.')
    })

    it('explains victory mostly by environment affinity', () => {
        const message = getRoundExplanation({
            environment: 'FOREST',
            meWon: true,
            meActionType: 'USE',
            opponentActionType: 'USE',
            myBreakdown: breakdown({ environmentContribution: 6, levelContribution: 1, total: 7 }),
            opponentBreakdown: breakdown({ environmentContribution: 2, levelContribution: 2, total: 4 }),
        })

        expect(message).toBe('Hai vinto grazie alla maggiore affinità con la Foresta.')
    })

    it('explains lower affinity compensated by level', () => {
        const message = getRoundExplanation({
            environment: 'MOUNTAIN',
            meWon: true,
            meActionType: 'USE',
            opponentActionType: 'USE',
            myBreakdown: breakdown({ environmentModifier: 1, environmentContribution: 2, levelContribution: 5, total: 7 }),
            opponentBreakdown: breakdown({ environmentModifier: 3, environmentContribution: 6, levelContribution: 0, total: 6 }),
        })

        expect(message).toBe('Il livello superiore ha compensato la minore affinità ambientale.')
    })

    it('explains when more suitable gene loses due to insufficient level', () => {
        const message = getRoundExplanation({
            environment: 'SWAMP',
            meWon: false,
            meActionType: 'USE',
            opponentActionType: 'USE',
            myBreakdown: breakdown({ environmentModifier: 3, environmentContribution: 6, levelContribution: 0, total: 6 }),
            opponentBreakdown: breakdown({ environmentModifier: 1, environmentContribution: 2, levelContribution: 5, total: 7 }),
        })

        expect(message).toBe('Il tuo gene era più adatto alla Palude, ma il livello non è bastato.')
    })
})
