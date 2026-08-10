import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_BATTLE_OPPONENT_CREATURE } from '../../components/game-v2/gameSelectionAssets'
import type { GeneCardV2, GeneSelectionViewModelV2 } from '../../components/game-v2/types'
import { BattleScreen } from './BattleScreen'

function makeGene(input: Pick<GeneCardV2, 'id' | 'traitType' | 'name' | 'level' | 'affinity' | 'usable' | 'exhausted'> & { score?: number; affinityValue?: number }): GeneCardV2 {
    const { score, affinityValue, ...gene } = input

    return {
        ...gene,
        strongAgainst: 'Avversario naturale',
        weakAgainst: 'Predatore naturale',
        prediction: score === undefined
            ? undefined
            : { useScore: score, baseContribution: 2, levelContribution: gene.level, eventModifier: affinityValue ?? 0, reasons: [] },
    }
}

const GENES: GeneCardV2[] = [
    makeGene({ id: 'FEROCITY', traitType: 'FEROCITY', name: 'Ferocia', level: 0, affinity: 'suitable', usable: true, exhausted: false, score: 3, affinityValue: 1 }),
    makeGene({ id: 'ARMOR', traitType: 'ARMOR', name: 'Corazza', level: 1, affinity: 'suitable', usable: true, exhausted: false, score: 4, affinityValue: 1 }),
    makeGene({ id: 'AGILITY', traitType: 'AGILITY', name: 'Agilita', level: 0, affinity: 'ideal', usable: true, exhausted: false, score: 4, affinityValue: 2 }),
    makeGene({ id: 'SENSES', traitType: 'SENSES', name: 'Sensi', level: 0, affinity: 'unfavorable', usable: false, exhausted: true, score: 2, affinityValue: 0 }),
    makeGene({ id: 'CAMOUFLAGE', traitType: 'CAMOUFLAGE', name: 'Mimetismo', level: 2, affinity: 'suitable', usable: true, exhausted: false, score: 5, affinityValue: 1 }),
]

function makeViewModel(overrides: Partial<GeneSelectionViewModelV2> = {}): GeneSelectionViewModelV2 {
    const genes = overrides.genes ?? GENES
    const selectedGeneId = overrides.selectedGeneId ?? genes[0]?.id ?? null
    const selectedGene = genes.find((gene) => gene.id === selectedGeneId) ?? null

    return {
        player: { id: 'me', name: 'Tu', score: 3, roundValueTotal: 12, status: 'choosing' },
        opponent: { id: 'other', name: 'Avversario', score: 3, roundValueTotal: 10, status: 'ready' },
        round: { current: 4, total: 7 },
        roundEvent: {
            id: 'current',
            title: 'Evento corrente',
            description: 'Descrizione corrente',
            effects: [
                { id: 'current-p2', label: 'Ferocia', modifier: 2, value: 'Ideale · Ferocia', tone: 'positive' },
                { id: 'current-p1', label: 'Agilita', modifier: 1, value: 'Adatto · Agilita', tone: 'neutral' },
                { id: 'current-n1', label: 'Mimetismo', modifier: 0, value: 'Sfavorevole · Mimetismo', tone: 'negative' },
                { id: 'current-n2', label: 'Sensi', modifier: 0, value: 'Sfavorevole · Sensi', tone: 'negative' },
            ],
        },
        nextRoundEvent: {
            id: 'next',
            title: 'Evento futuro',
            description: 'Descrizione futura',
            effects: [{ id: 'next-p2', label: 'Corazza', modifier: 2, value: 'Ideale · Corazza', tone: 'positive' }],
        },
        genes,
        selectedGeneId,
        selectedAction: null,
        selectedGene,
        status: 'choosing',
        actionsSubmitted: 0,
        canUse: Boolean(selectedGene?.usable),
        canEvolve: true,
        canSelectGenes: true,
        ...overrides,
    }
}

describe('BattleScreen', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
        container = document.createElement('div')
        document.body.append(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    function render(viewModel = makeViewModel(), onSelectGene: (geneId: string) => void = () => undefined) {
        act(() => {
            root.render(createElement(BattleScreen, {
                viewModel,
                onSelectGene,
                onUseGene: async () => undefined,
                onEvolveGene: async () => undefined,
                onLeaveSession: () => undefined,
            }))
        })
    }

    function renderInteractive() {
        function Harness() {
            const [selectedGeneId, setSelectedGeneId] = useState(GENES[0]!.id)

            return createElement(BattleScreen, {
                viewModel: makeViewModel({ selectedGeneId }),
                onSelectGene: setSelectedGeneId,
                onUseGene: async () => undefined,
                onEvolveGene: async () => undefined,
                onLeaveSession: () => undefined,
            })
        }

        act(() => root.render(createElement(Harness)))
    }

    it('shows both scores with the round-value total used for the tiebreak', () => {
        render()

        expect(container.querySelector('.duel-card--player')?.textContent).toContain('TB 12')
        expect(container.querySelector('.duel-card--opponent')?.textContent).toContain('TB 10')
        expect(container.querySelector('.battle-screen__meta')?.textContent).toContain('4/7')
    })

    it('renders all five genes in stable order and selects each by tap', () => {
        renderInteractive()

        const cards = [...container.querySelectorAll<HTMLButtonElement>('.gene-card')]

        expect(cards).toHaveLength(5)
        expect(cards.map((card) => card.querySelector('.gene-card__name')?.textContent)).toEqual(GENES.map((gene) => gene.name))

        cards.forEach((card, index) => {
            act(() => card.click())
            expect([...container.querySelectorAll('.gene-card')][index]?.getAttribute('aria-selected')).toBe('true')
        })
    })

    it('supports keyboard selection and exposes exhaustion semantically', () => {
        renderInteractive()

        const cards = () => [...container.querySelectorAll<HTMLButtonElement>('.gene-card')]

        act(() => cards()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
        expect(cards()[1]?.getAttribute('aria-selected')).toBe('true')

        act(() => cards()[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })))
        expect(cards()[4]?.getAttribute('aria-selected')).toBe('true')

        expect(cards()[3]?.classList.contains('is-exhausted')).toBe(true)
        expect(cards()[3]?.getAttribute('aria-label')).toContain('esaurito')
        expect(cards()[3]?.getAttribute('aria-label')).toContain('sfavorevole')
    })

    it('does not reconstruct a score when the authoritative prediction is missing', () => {
        const gene = makeGene({ id: 'AGILITY', traitType: 'AGILITY', name: 'Agilita', level: 0, affinity: 'ideal', usable: true, exhausted: false })

        render(makeViewModel({ genes: [gene], selectedGeneId: gene.id, selectedGene: gene }))

        expect(container.querySelector('.gene-card__value')?.textContent).toBe('—')
        expect(container.querySelector('.gene-card')?.getAttribute('aria-label')).toContain('valore ambientale non disponibile')
        expect(container.querySelector('.ev-btn--use')?.textContent).toContain('— PT')
    })

    it.each([
        { level: 0, exhausted: false, label: 'EVOLVI' },
        { level: 1, exhausted: true, label: 'RIGENERA' },
        { level: 2, exhausted: true, label: 'RECUPERA' },
    ])('labels the real EVOLVE transition at level $level/exhausted=$exhausted', ({ level, exhausted, label }) => {
        const gene = { ...GENES[2]!, level, exhausted, usable: !exhausted }

        render(makeViewModel({ genes: [gene], selectedGeneId: gene.id, selectedGene: gene, canUse: !exhausted }))

        expect(container.querySelector('.ev-btn--evolve .ev-action-btn__title')?.textContent).toBe(label)
    })

    it('disables EVOLVE when a max-level gene is already available', () => {
        const gene = { ...GENES[2]!, level: 2, exhausted: false }

        render(makeViewModel({ genes: [gene], selectedGeneId: gene.id, selectedGene: gene, canEvolve: false }))

        expect(container.querySelector<HTMLButtonElement>('.ev-btn--evolve')?.disabled).toBe(true)
        expect(container.querySelector('.ev-btn--evolve')?.textContent).toContain('Gia al livello massimo')
    })

    it('replaces the decision controls with the waiting state once a choice is submitted', () => {
        render(makeViewModel({
            status: 'waiting',
            waitingState: {
                submittedGeneName: 'Agilita',
                submittedAction: 'USE',
                submittedCountLabel: '1/2',
                opponentStatusLabel: 'In attesa dell avversario',
                isResolving: false,
            },
        }))

        expect(container.querySelector('.waiting-panel')?.textContent).toContain('Agilita')
        expect(container.querySelector('.waiting-panel')?.textContent).toContain('1/2')
        expect(container.querySelector('.gene-card')).toBeNull()
        expect(container.querySelector('.ev-btn--use')).toBeNull()
    })

    it('previews the next biome beside the active one', () => {
        render()

        expect(container.querySelector('.environment-card__main')?.textContent).toContain('Evento corrente')
        // Only the decisive pair stays on the card; the full table lives in the sheet.
        expect(container.querySelectorAll('.environment-card__chips .ev-chip')).toHaveLength(2)
        expect(container.querySelector('.environment-card__next')?.textContent).toContain('Evento futuro')
    })

    it('opens the affinity table of whichever biome was tapped', () => {
        render()

        act(() => container.querySelector<HTMLButtonElement>('.environment-card__main')!.click())

        expect(document.querySelector('.ev-sheet')?.textContent).toContain('Evento corrente')
        expect(document.querySelectorAll('.environment-detail__list li')).toHaveLength(4)

        act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))

        expect(document.querySelector('.environment-detail__list')).toBeNull()

        act(() => container.querySelector<HTMLButtonElement>('.environment-card__next')!.click())

        expect(document.querySelector('.ev-sheet')?.textContent).toContain('Evento futuro')
        expect(document.querySelectorAll('.environment-detail__list li')).toHaveLength(1)
    })

    it('faces both creatures toward each other and mirrors only the sprite', () => {
        render(makeViewModel({
            player: { id: 'me', name: 'Tu', score: 0, roundValueTotal: null, status: 'choosing', creatureVisual: { src: '/player.png', alt: 'Giocatore' } },
            opponent: { id: 'other', name: 'Avversario', score: 0, roundValueTotal: null, status: 'choosing', creatureVisual: DEFAULT_BATTLE_OPPONENT_CREATURE },
        }))

        const player = container.querySelector<HTMLElement>('.arena__creature--player')!
        const opponent = container.querySelector<HTMLElement>('.arena__creature--opponent')!

        expect(player.dataset.facing).toBe('right')
        expect(opponent.dataset.facing).toBe('left')
        expect(player.classList.contains('is-mirrored')).toBe(false)
        expect(opponent.classList.contains('is-mirrored')).toBe(false)
        // The supplied bot sprite already faces left, so it must not be mirrored again.
        expect(opponent.querySelector('img')?.classList.contains('is-mirrored')).toBe(false)
        // The centre emblem is gone: the arena is split evenly between the two creatures instead.
        expect(container.querySelector('.arena__versus')).toBeNull()
    })

    it('confirms before abandoning a running match', () => {
        let leaveCalls = 0

        act(() => {
            root.render(createElement(BattleScreen, {
                viewModel: makeViewModel(),
                onSelectGene: () => undefined,
                onUseGene: async () => undefined,
                onEvolveGene: async () => undefined,
                onLeaveSession: () => { leaveCalls += 1 },
            }))
        })

        act(() => container.querySelector<HTMLButtonElement>('.battle-screen__exit')!.click())

        expect(document.querySelector('.battle-leave-confirm')).not.toBeNull()
        expect(leaveCalls).toBe(0)

        const cancel = [...document.querySelectorAll<HTMLButtonElement>('.battle-leave-confirm button')]
            .find((button) => button.textContent?.includes('Continua a giocare'))!

        act(() => cancel.click())

        expect(document.querySelector('.battle-leave-confirm')).toBeNull()
        expect(leaveCalls).toBe(0)

        act(() => container.querySelector<HTMLButtonElement>('.battle-screen__exit')!.click())

        const confirm = [...document.querySelectorAll<HTMLButtonElement>('.battle-leave-confirm button')]
            .find((button) => button.textContent?.includes('Esci dalla partita'))!

        act(() => confirm.click())

        expect(leaveCalls).toBe(1)
    })

    it('offers a way out of an unplayable session instead of a blank battle', () => {
        render(makeViewModel({ status: 'invalid', invalidReason: 'Sessione non valida.' }))

        expect(container.textContent).toContain('Sessione obsoleta')
        expect(container.textContent).toContain('Sessione non valida.')
        expect(container.querySelector('.gene-card')).toBeNull()
    })
})
