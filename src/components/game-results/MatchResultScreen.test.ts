import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MatchResultScreen } from './MatchResultScreen'
import type { MatchResultRound, MatchResultViewModel } from './types'

const breakdown = {
    actionType: 'USE' as const,
    baseContribution: 1,
    levelContribution: 2,
    eventModifier: 1,
    matchupBonus: 1,
    originalLevel: 2,
    effectiveLevel: 2,
    total: 5,
    appliedEventEffects: [],
}

function makeRound(overrides: Partial<MatchResultRound> = {}): MatchResultRound {
    return {
        id: 'round-2',
        number: 2,
        eventLabel: 'Foresta incantata',
        outcome: 'win',
        player: { action: { trait: 'AGILITY', actionType: 'USE' }, value: 5, points: 1, breakdown },
        opponent: { action: { trait: 'ARMOR', actionType: 'USE' }, value: 3, points: 0, breakdown: { ...breakdown, total: 3 } },
        explanation: 'Hai vinto grazie al vantaggio naturale.',
        ...overrides,
    }
}

function makeViewModel(overrides: Partial<MatchResultViewModel> = {}): MatchResultViewModel {
    const firstRound = makeRound({ id: 'round-1', number: 1, outcome: 'draw' })
    const lastRound = makeRound()

    return {
        outcome: 'win',
        player: { id: 'player', name: 'Naturalista', score: 2, creature: { src: '/player.png', alt: 'Creatura giocatore' }, tiebreakTotal: null },
        opponent: { id: 'opponent', name: 'Bot', score: 1, creature: { src: '/opponent.png', alt: 'Creatura avversaria' }, tiebreakTotal: null },
        finalRoundNumber: 2,
        totalRounds: 7,
        background: '/background.png',
        metrics: [{ id: 'round-values', label: 'Valori round', value: '8 - 5' }],
        lastRound,
        rounds: [firstRound, lastRound],
        ...overrides,
    }
}

describe('MatchResultScreen', () => {
    let container: HTMLDivElement
    let root: Root
    let onLeaveSession: () => void
    let onNewGame: () => void
    let leaveCalls: number
    let newGameCalls: number

    function render(viewModel = makeViewModel()) {
        act(() => {
            root.render(createElement(MatchResultScreen, {
                viewModel,
                onLeaveSession,
                onNewGame,
            }))
        })
    }

    beforeEach(() => {
        container = document.createElement('div')
        document.body.append(container)
        root = createRoot(container)
        leaveCalls = 0
        newGameCalls = 0
        onLeaveSession = () => { leaveCalls += 1 }
        onNewGame = () => { newGameCalls += 1 }
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it.each([
        ['win', 'HAI VINTO!', 'Vittoria'],
        ['loss', 'HAI PERSO', 'Sconfitta'],
        ['draw', 'PAREGGIO', 'Pareggio'],
    ] as const)('renders the persisted %s outcome', (outcome, title, label) => {
        render(makeViewModel({ outcome }))

        expect(container.textContent).toContain(title)
        expect(container.textContent).toContain(label)
    })

    it('shows persisted tiebreak totals without inventing an extra metric', () => {
        const viewModel = makeViewModel({
            player: { ...makeViewModel().player, tiebreakTotal: 11 },
            opponent: { ...makeViewModel().opponent, tiebreakTotal: 9 },
            metrics: [{ id: 'tiebreak', label: 'Tiebreak', value: '11 - 9' }],
        })
        render(viewModel)

        expect(container.textContent).toContain('TB 11')
        expect(container.textContent).toContain('Tiebreak')
        expect(container.textContent).not.toContain('Punti totali')
    })

    it('shows both USE and EVOLVE actions in the final round', () => {
        render(makeViewModel({
            lastRound: makeRound({
                player: { action: { trait: 'SENSES', actionType: 'USE' }, value: 4, points: 1, breakdown },
                opponent: { action: { trait: 'CAMOUFLAGE', actionType: 'EVOLVE' }, value: 1, points: 0, breakdown: { ...breakdown, actionType: 'EVOLVE', total: 1 } },
            }),
        }))

        expect(container.textContent).toContain('Azione: USA')
        expect(container.textContent).toContain('Azione: EVOLVI')
    })

    it('opens the persisted calculation detail and supports legacy records without a breakdown', () => {
        render(makeViewModel({
            lastRound: makeRound({ player: { action: { trait: 'AGILITY', actionType: 'USE' }, value: 5, points: 1, breakdown: null } }),
        }))
        const detail = container.querySelectorAll<HTMLButtonElement>('.result-calculation__toggle')[0]!

        act(() => detail.click())

        expect(detail.getAttribute('aria-expanded')).toBe('true')
        expect(container.textContent).toContain('Dettaglio calcolo non disponibile per questo risultato storico.')
    })

    it('keeps persisted history sorted and allows one expanded row at a time', () => {
        const roundOne = makeRound({ id: 'round-1', number: 1 })
        const roundTwo = makeRound({ id: 'round-2', number: 2 })
        render(makeViewModel({ rounds: [roundOne, roundTwo], lastRound: roundTwo }))
        const rows = [...container.querySelectorAll<HTMLButtonElement>('.match-result-history__row')]

        expect(rows.map((row) => row.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Round 1'), expect.stringContaining('Round 2')]))
        expect(container.textContent!.indexOf('Round 1')).toBeLessThan(container.textContent!.indexOf('Round 2'))

        act(() => rows[0]!.click())
        expect(rows[0]!.getAttribute('aria-expanded')).toBe('true')
        act(() => rows[1]!.click())
        expect(rows[0]!.getAttribute('aria-expanded')).toBe('false')
        expect(rows[1]!.getAttribute('aria-expanded')).toBe('true')
    })

    it('calls home and new-match callbacks', () => {
        render()
        const home = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('Torna alla home'))!
        const newMatch = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('Nuova partita'))!

        act(() => home.click())
        act(() => newMatch.click())

        expect(leaveCalls).toBe(1)
        expect(newGameCalls).toBe(1)
    })
})
