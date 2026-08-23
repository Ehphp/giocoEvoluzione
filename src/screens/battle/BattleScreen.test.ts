import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_BATTLE_OPPONENT_CREATURE } from './controller/gene-selection-assets'
import type { GeneCardV2, GeneSelectionViewModelV2 } from './controller/types'
import { BattleScreen } from './BattleScreen'

function makeGene(input: Pick<GeneCardV2, 'id' | 'traitType' | 'name' | 'level' | 'affinity' | 'usable' | 'exhausted'> & { score?: number; affinityValue?: number }): GeneCardV2 {
    const { score, affinityValue, ...gene } = input

    return {
        ...gene,
        strongAgainst: 'Avversario naturale',
        weakAgainst: 'Predatore naturale',
        strongAgainstTrait: 'ARMOR',
        weakAgainstTrait: 'CAMOUFLAGE',
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
        player: {
            id: 'me', name: 'Tu', score: 3, roundValueTotal: 12, status: 'choosing',
            combatMutations: [
                { id: 'ELASTIC_LIMBS', label: 'Arti elastici', shortDescription: 'Primo USA Agilità senza esaurimento.', iconKey: 'elastic-limbs', status: 'available' },
                { id: 'ADAPTIVE_CORE', label: 'Nucleo adattivo', shortDescription: 'Dopo il primo EVOLVI, +1 al prossimo USA.', iconKey: 'adaptive-core', status: 'armed' },
            ],
        },
        opponent: {
            id: 'other', name: 'Avversario', score: 3, roundValueTotal: 10, status: 'ready',
            combatMutations: [
                { id: 'ELASTIC_LIMBS', label: 'Arti elastici', shortDescription: 'Primo USA Agilità senza esaurimento.', iconKey: 'elastic-limbs', status: 'consumed' },
                { id: 'ADAPTIVE_CORE', label: 'Nucleo adattivo', shortDescription: 'Dopo il primo EVOLVI, +1 al prossimo USA.', iconKey: 'adaptive-core', status: 'available' },
            ],
        },
        round: { current: 4, total: 7 },
        roundEvent: {
            id: 'current',
            title: 'Evento corrente',
            description: 'Descrizione corrente',
            effects: [
                { id: 'current-p2', trait: 'FEROCITY', label: 'Ferocia', modifier: 2, value: 'Ideale · Ferocia', tone: 'positive' },
                { id: 'current-p1', trait: 'AGILITY', label: 'Agilita', modifier: 1, value: 'Adatto · Agilita', tone: 'neutral' },
                { id: 'current-n1', trait: 'CAMOUFLAGE', label: 'Mimetismo', modifier: 0, value: 'Sfavorevole · Mimetismo', tone: 'negative' },
                { id: 'current-n2', trait: 'SENSES', label: 'Sensi', modifier: 0, value: 'Sfavorevole · Sensi', tone: 'negative' },
            ],
        },
        nextRoundEvent: {
            id: 'next',
            title: 'Evento futuro',
            description: 'Descrizione futura',
            effects: [{ id: 'next-p2', trait: 'ARMOR', label: 'Corazza', modifier: 2, value: 'Ideale · Corazza', tone: 'positive' }],
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
    })

    it('counts the rounds with dots under the VS badge, inside the header and with no text', () => {
        render()

        const rounds = container.querySelector('.duel-header__rounds')!
        const dots = [...rounds.querySelectorAll('.ev-pips__dot')]

        // One dot per scheduled round, lit up to the current one. The count is the only statement.
        expect(dots).toHaveLength(7)
        expect(dots.filter((dot) => dot.classList.contains('is-on'))).toHaveLength(4)
        expect(rounds.textContent).toBe('')
        expect(rounds.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Round 4 di 7')
        // Between the two profiles, not in a row of its own: the pill it replaced cost 34px.
        expect(rounds.closest('.duel-header')).not.toBeNull()
    })

    it('integrates the ordered mutation slots under each player panel with semantic states', () => {
        render()

        const playerSlots = container.querySelectorAll('.duel-card__mutations--player .duel-mutation')
        const opponentSlots = container.querySelectorAll('.duel-card__mutations--opponent .duel-mutation')

        expect(playerSlots).toHaveLength(2)
        expect(opponentSlots).toHaveLength(2)
        expect(playerSlots[1]?.classList.contains('duel-mutation--armed')).toBe(true)
        expect(opponentSlots[0]?.classList.contains('duel-mutation--consumed')).toBe(true)
        expect(playerSlots[1]?.getAttribute('aria-label')).toContain('Nucleo adattivo, attiva')
        expect(container.querySelectorAll('.duel-card .ev-pips--compact')).toHaveLength(2)
    })

    it('confirms FINE_DEL_MONDO before submitting its zero-point activation', async () => {
        let activations = 0
        const viewModel = makeViewModel({
            player: {
                id: 'me', name: 'Tu', score: 3, roundValueTotal: 12, status: 'choosing',
                combatMutations: [{ id: 'FINE_DEL_MONDO', label: 'Fine del mondo', shortDescription: 'Casualmente -2 o +3 round.', iconKey: 'fine-del-mondo', status: 'available' }],
            },
            canActivateFineDelMondo: true,
        })
        act(() => {
            root.render(createElement(BattleScreen, {
                viewModel,
                onSelectGene: () => undefined,
                onUseGene: async () => undefined,
                onEvolveGene: async () => undefined,
                onActivateFineDelMondo: async () => { activations += 1; return true },
                onLeaveSession: () => undefined,
            }))
        })

        act(() => container.querySelector<HTMLButtonElement>('[aria-label="Attiva Fine del mondo"]')!.click())
        expect(document.body.textContent).toContain('Alterare la durata della partita?')

        await act(async () => {
            ;[...document.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('Attiva Fine del mondo'))!.click()
        })
        expect(activations).toBe(1)
        expect(document.body.textContent).not.toContain('Alterare la durata della partita?')
    })

    it('opens and closes the leave action from the player avatar without taking header space', () => {
        render()

        const trigger = container.querySelector<HTMLButtonElement>('.duel-card__profile-trigger')!

        expect(container.querySelector('.battle-screen__exit')).toBeNull()
        expect(trigger.getAttribute('aria-expanded')).toBe('false')

        act(() => trigger.click())

        expect(trigger.getAttribute('aria-expanded')).toBe('true')
        expect(container.querySelector('[role="menu"]')?.textContent).toContain('Esci dalla partita')

        act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))

        expect(trigger.getAttribute('aria-expanded')).toBe('false')
        expect(container.querySelector('[role="menu"]')).toBeNull()

        act(() => trigger.click())
        act(() => trigger.click())

        expect(trigger.getAttribute('aria-expanded')).toBe('false')
        expect(container.querySelector('[role="menu"]')).toBeNull()
    })

    it('uses compact mutation copy on the relevant action card', () => {
        const gene = { ...GENES[2]!, mutationHints: ['+1 Nucleo adattivo', 'Agilità resta disponibile'] }

        render(makeViewModel({ genes: [gene], selectedGeneId: gene.id, selectedGene: gene }))

        expect(container.querySelector('.ev-btn--use')?.textContent).toContain('+1 Nucleo adattivo · Agilità resta disponibile')
    })

    it('renders all five genes in stable order and selects each by tap', () => {
        renderInteractive()

        const orbs = [...container.querySelectorAll<HTMLButtonElement>('.gene-orb')]

        expect(orbs).toHaveLength(5)
        expect(orbs.map((orb) => orb.querySelector('.gene-orb__name')?.textContent)).toEqual(GENES.map((gene) => gene.name))

        orbs.forEach((orb, index) => {
            act(() => orb.click())
            expect([...container.querySelectorAll('.gene-orb')][index]?.getAttribute('aria-selected')).toBe('true')
        })
    })

    it('shows this round\'s score on the orb and the level as a frame, not as words', () => {
        renderInteractive()

        const orbs = [...container.querySelectorAll<HTMLButtonElement>('.gene-orb')]

        // The one number on the token is the round score, straight from the authoritative prediction.
        expect(orbs.map((orb) => orb.querySelector('.gene-orb__score')?.textContent)).toEqual(['3', '4', '4', '2', '5'])
        // Level rides an attribute so the frame is CSS and no level is ever spelled out.
        expect(orbs.map((orb) => orb.dataset.level)).toEqual(['0', '1', '0', '0', '2'])
        // Scoped to the row: EVOLVI still says which level it buys, which is the action, not the token.
        expect(container.querySelector('.gene-orbs')?.textContent).not.toContain('Liv.')
        // Affinity was a word on the card; it is inside the score now, and stays in the label.
        expect(orbs[2]?.getAttribute('aria-label')).toContain('Affinita ideale')
    })

    it('supports keyboard selection and exposes exhaustion semantically', () => {
        renderInteractive()

        const orbs = () => [...container.querySelectorAll<HTMLButtonElement>('.gene-orb')]

        act(() => orbs()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
        expect(orbs()[1]?.getAttribute('aria-selected')).toBe('true')

        act(() => orbs()[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })))
        expect(orbs()[4]?.getAttribute('aria-selected')).toBe('true')

        expect(orbs()[3]?.classList.contains('is-exhausted')).toBe(true)
        expect(orbs()[3]?.getAttribute('aria-label')).toContain('esaurito')
        expect(orbs()[3]?.getAttribute('aria-label')).toContain('sfavorevole')
    })

    it('says the two matchups with glyphs above the orbs, and nothing below them', () => {
        render()

        const strip = container.querySelector('.gene-matchup')!
        const pairs = [...strip.querySelectorAll('.gene-matchup__pair')]

        // `attacker -> victim`, twice: this gene beating its victim, then its predator beating it.
        expect(pairs).toHaveLength(2)
        expect([...pairs[0]!.querySelectorAll('.gene-glyph')].map((g) => (g as HTMLElement).dataset.gene)).toEqual(['FEROCITY', 'ARMOR'])
        expect([...pairs[1]!.querySelectorAll('.gene-glyph')].map((g) => (g as HTMLElement).dataset.gene)).toEqual(['CAMOUFLAGE', 'FEROCITY'])
        // No words in the strip itself; the whole statement is in its label.
        expect(strip.textContent).toBe('')
        expect(strip.getAttribute('aria-label')).toContain('forte contro Avversario naturale')
        expect(strip.getAttribute('aria-label')).toContain('teme Predatore naturale')
        // The strip precedes the orbs: the explanatory card that used to follow them is gone.
        expect(strip.compareDocumentPosition(container.querySelector('.gene-orbs')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('does not reconstruct a score when the authoritative prediction is missing', () => {
        const gene = makeGene({ id: 'AGILITY', traitType: 'AGILITY', name: 'Agilita', level: 0, affinity: 'ideal', usable: true, exhausted: false })

        render(makeViewModel({ genes: [gene], selectedGeneId: gene.id, selectedGene: gene }))

        expect(container.querySelector('.gene-orb__score')?.textContent).toBe('—')
        expect(container.querySelector('.gene-orb')?.getAttribute('aria-label')).toContain('valore ambientale non disponibile')
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
        expect(container.querySelector('.gene-orb')).toBeNull()
        expect(container.querySelector('.ev-btn--use')).toBeNull()
    })

    it('states the briefing on one row, with the affinities as glyphs and the prose outside it', () => {
        render()

        const row = container.querySelector('.environment-row')!

        expect(row.querySelector('.environment-row__main')?.textContent).toContain('Evento corrente')
        expect(row.querySelector('.environment-row__next')?.textContent).toContain('Evento futuro')

        // The decisive pair, shown as the adaptation's own glyph plus its modifier.
        const effects = [...row.querySelectorAll<HTMLElement>('.environment-row__effect')]
        expect(effects.map((effect) => effect.dataset.gene)).toEqual(['FEROCITY', 'SENSES'])
        expect(effects.map((effect) => effect.querySelector('b')?.textContent)).toEqual(['+2', '0'])

        // The prose left the panel for the artwork, so the row costs one line instead of four.
        expect(row.textContent).not.toContain('Descrizione corrente')
        expect(container.querySelector('.environment-line')?.textContent).toBe('Descrizione corrente')
    })

    it('opens the affinity table of whichever biome was tapped', () => {
        render()

        act(() => container.querySelector<HTMLButtonElement>('.environment-row__main')!.click())

        expect(document.querySelector('.ev-sheet')?.textContent).toContain('Evento corrente')
        expect(document.querySelectorAll('.environment-detail__list li')).toHaveLength(4)

        act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))

        expect(document.querySelector('.environment-detail__list')).toBeNull()

        act(() => container.querySelector<HTMLButtonElement>('.environment-row__next')!.click())

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

        const requestLeave = () => {
            const trigger = container.querySelector<HTMLButtonElement>('.duel-card__profile-trigger')!
            act(() => trigger.click())
            const action = container.querySelector<HTMLButtonElement>('.duel-card__profile-popover button')!
            act(() => action.click())
        }

        requestLeave()

        expect(document.querySelector('.battle-leave-confirm')).not.toBeNull()
        expect(leaveCalls).toBe(0)

        const cancel = [...document.querySelectorAll<HTMLButtonElement>('.battle-leave-confirm button')]
            .find((button) => button.textContent?.includes('Continua a giocare'))!

        act(() => cancel.click())

        expect(document.querySelector('.battle-leave-confirm')).toBeNull()
        expect(leaveCalls).toBe(0)

        requestLeave()

        const confirm = [...document.querySelectorAll<HTMLButtonElement>('.battle-leave-confirm button')]
            .find((button) => button.textContent?.includes('Esci dalla partita'))!

        act(() => confirm.click())

        expect(leaveCalls).toBe(1)
    })

    it('offers a way out of an unplayable session instead of a blank battle', () => {
        render(makeViewModel({ status: 'invalid', invalidReason: 'Sessione non valida.' }))

        expect(container.textContent).toContain('Sessione obsoleta')
        expect(container.textContent).toContain('Sessione non valida.')
        expect(container.querySelector('.gene-orb')).toBeNull()
    })
})
