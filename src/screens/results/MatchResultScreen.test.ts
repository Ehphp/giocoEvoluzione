import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { MatchResultRound, MatchResultViewModel } from './types'
import { MatchResultScreen } from './MatchResultScreen'

const breakdown = {
    actionType: 'USE' as const,
    baseContribution: 1,
    levelContribution: 2,
    eventModifier: 1,
    matchupBonus: 1,
    mutationBonus: 0,
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
        player: { action: { trait: 'AGILITY', actionType: 'USE' }, value: 5, points: 1, breakdown, mutationEffects: [] },
        opponent: { action: { trait: 'ARMOR', actionType: 'USE' }, value: 3, points: 0, breakdown: { ...breakdown, total: 3 }, mutationEffects: [] },
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
    let leaveCalls: number
    let newGameCalls: number

    function render(viewModel = makeViewModel()) {
        act(() => {
            root.render(createElement(MatchResultScreen, {
                viewModel,
                onLeaveSession: () => { leaveCalls += 1 },
                onNewGame: () => { newGameCalls += 1 },
            }))
        })
    }

    beforeEach(() => {
        container = document.createElement('div')
        document.body.append(container)
        root = createRoot(container)
        leaveCalls = 0
        newGameCalls = 0
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
        const base = makeViewModel()

        render(makeViewModel({
            player: { ...base.player, tiebreakTotal: 11 },
            opponent: { ...base.opponent, tiebreakTotal: 9 },
            metrics: [{ id: 'tiebreak', label: 'Tiebreak', value: '11 - 9' }],
        }))

        expect(container.textContent).toContain('TB 11')
        expect(container.textContent).toContain('TB 9')
        expect(container.textContent).toContain('Tiebreak')
        expect(container.textContent).not.toContain('Punti totali')
    })

    it('shows both USE and EVOLVE actions in the final round', () => {
        render(makeViewModel({
            lastRound: makeRound({
                player: { action: { trait: 'SENSES', actionType: 'USE' }, value: 4, points: 1, breakdown, mutationEffects: [] },
                opponent: { action: { trait: 'CAMOUFLAGE', actionType: 'EVOLVE' }, value: 1, points: 0, breakdown: { ...breakdown, actionType: 'EVOLVE', total: 1 }, mutationEffects: [] },
            }),
        }))

        const cards = [...container.querySelectorAll('.result-last-round .result-side')]

        expect(cards[0]?.textContent).toContain('USA')
        expect(cards[1]?.textContent).toContain('EVOLVI')
    })

    it('opens the persisted calculation detail and supports legacy records without a breakdown', () => {
        render(makeViewModel({
            lastRound: makeRound({ player: { action: { trait: 'AGILITY', actionType: 'USE' }, value: 5, points: 1, breakdown: null, mutationEffects: [] } }),
        }))

        const detail = container.querySelectorAll<HTMLButtonElement>('.result-side__toggle')[0]!

        act(() => detail.click())

        expect(detail.getAttribute('aria-expanded')).toBe('true')
        expect(container.textContent).toContain('Dettaglio calcolo non disponibile per questo risultato storico.')
    })

    it('shows persisted Combat Mutation effects for a match-clinching round', () => {
        render(makeViewModel({
            lastRound: makeRound({
                player: {
                    action: { trait: 'AGILITY', actionType: 'USE' }, value: 6, points: 1,
                    breakdown: { ...breakdown, mutationBonus: 1, total: 6 },
                    mutationEffects: [
                        { id: 'ADAPTIVE_CORE', effect: 'ROUND_VALUE_BONUS', value: 1 },
                        { id: 'ELASTIC_LIMBS', effect: 'AGILITY_PRESERVED' },
                    ],
                },
            }),
        }))

        act(() => container.querySelector<HTMLButtonElement>('.result-side__toggle')?.click())

        expect(container.textContent).toContain('Nucleo adattivo: +1 valore round.')
        expect(container.textContent).toContain('Arti elastici: Agilità resta disponibile.')
    })

    it('shows Armored Memory and Recovery Surge only from persisted effects', () => {
        render(makeViewModel({
            lastRound: makeRound({
                player: {
                    action: { trait: 'ARMOR', actionType: 'EVOLVE' }, value: 2, points: 1,
                    breakdown: { ...breakdown, actionType: 'EVOLVE', mutationBonus: 1, total: 2 },
                    mutationEffects: [{ id: 'RECOVERY_SURGE', effect: 'EVOLVE_ROUND_BONUS', value: 1 }],
                },
                opponent: {
                    action: { trait: 'ARMOR', actionType: 'USE' }, value: 3, points: 0,
                    breakdown: { ...breakdown, total: 3 },
                    mutationEffects: [{ id: 'ARMORED_MEMORY', effect: 'ARMOR_PRESERVED' }],
                },
            }),
        }))

        const details = [...container.querySelectorAll<HTMLButtonElement>('.result-side__toggle')]
        act(() => details.forEach((detail) => detail.click()))

        expect(container.textContent).toContain('Impulso di recupero: +1 valore round.')
        expect(container.textContent).toContain('Memoria corazzata: Armatura resta disponibile.')
    })

    it('keeps persisted history sorted and allows one expanded row at a time', () => {
        const roundOne = makeRound({ id: 'round-1', number: 1 })
        const roundTwo = makeRound({ id: 'round-2', number: 2 })

        render(makeViewModel({ rounds: [roundOne, roundTwo], lastRound: roundTwo }))

        const rows = [...container.querySelectorAll<HTMLButtonElement>('.result-history-row__summary')]

        expect(rows).toHaveLength(2)
        expect(rows[0]?.textContent).toContain('R1')
        expect(rows[1]?.textContent).toContain('R2')

        act(() => rows[0]!.click())
        expect(rows[0]!.getAttribute('aria-expanded')).toBe('true')

        act(() => rows[1]!.click())
        expect(rows[0]!.getAttribute('aria-expanded')).toBe('false')
        expect(rows[1]!.getAttribute('aria-expanded')).toBe('true')
    })

    it('calls home and new-match callbacks', () => {
        render()

        const buttons = [...container.querySelectorAll<HTMLButtonElement>('.result-actions button')]
        const newMatch = buttons.find((button) => button.textContent?.includes('Nuova partita'))!
        const home = buttons.find((button) => button.textContent?.includes('Torna alla home'))!

        act(() => home.click())
        act(() => newMatch.click())

        expect(leaveCalls).toBe(1)
        expect(newGameCalls).toBe(1)
    })
})
