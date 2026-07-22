import { describe, expect, it } from 'vitest'

import type { RoundValueBreakdown } from './types'
import { getRoundExplanation } from './round-result-explainer'

function breakdown(overrides?: Partial<RoundValueBreakdown>): RoundValueBreakdown {
    return {
        actionType: 'USE',
        eventModifierTotal: 2,
        eventWeight: 2,
        eventContribution: 4,
        appliedEventEffects: [
            {
                trait: 'PERCEPTION',
                modifier: 2,
                reason: 'Placeholder reason',
                contribution: 4,
            },
        ],
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
            roundEventTitle: 'Eclissi prolungata',
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
            roundEventTitle: 'Inondazione lampo',
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
            roundEventTitle: 'Eclissi prolungata',
            meWon: true,
            meActionType: 'USE',
            opponentActionType: 'EVOLVE',
            myBreakdown: breakdown({ total: 7 }),
            opponentBreakdown: breakdown({ actionType: 'EVOLVE', total: 0 }),
        })

        expect(message).toBe('L avversario ha evoluto il gene, rinunciando al punteggio di questo round.')
    })

    it('explains victory by event effects', () => {
        const message = getRoundExplanation({
            roundEventTitle: 'Migrazione di predatori',
            meWon: true,
            meActionType: 'USE',
            opponentActionType: 'USE',
            myBreakdown: breakdown({ eventContribution: 6, levelContribution: 1, total: 7 }),
            opponentBreakdown: breakdown({ eventContribution: 2, levelContribution: 2, total: 4 }),
        })

        expect(message).toContain('effetti favorevoli')
    })

    it('explains lower event favor compensated by level', () => {
        const message = getRoundExplanation({
            roundEventTitle: 'Picco termico persistente',
            meWon: true,
            meActionType: 'USE',
            opponentActionType: 'USE',
            myBreakdown: breakdown({ eventModifierTotal: -1, eventContribution: -2, levelContribution: 5, total: 3 }),
            opponentBreakdown: breakdown({ eventModifierTotal: 2, eventContribution: 4, levelContribution: 0, total: 4 }),
        })

        expect(message).toContain('compensato')
    })
})
