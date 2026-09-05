import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_BATTLE_OPPONENT_CREATURE } from './controller/gene-selection-assets'
import type { GeneActionCommandV2, GeneCardV2, GeneSelectionViewModelV2 } from './controller/types'
import { BattleScreen } from './BattleScreen'

function makeGene(input: Pick<GeneCardV2, 'id' | 'traitType' | 'name' | 'level' | 'affinity' | 'usable' | 'exhausted'> & { score?: number; affinityValue?: number }): GeneCardV2 {
    const { score, affinityValue, ...gene } = input

    return {
        ...gene,
        evolvable: true,
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

function pointerEvent(type: string, x = 0, y = 0, pointerId = 1, isPrimary = true) {
    const event = new Event(type, { bubbles: true, cancelable: true })

    Object.assign(event, { button: 0, clientX: x, clientY: y, pointerId, pointerType: 'touch', isPrimary })
    return event
}

function setDropZoneRect(element: Element, left: number, top: number, right: number, bottom: number) {
    element.getBoundingClientRect = () => ({
        x: left,
        y: top,
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
        toJSON: () => undefined,
    })
}

function enablePointerCapture(element: HTMLButtonElement) {
    const captures = new Set<number>()

    element.setPointerCapture = vi.fn((pointerId: number) => captures.add(pointerId))
    element.hasPointerCapture = vi.fn((pointerId: number) => captures.has(pointerId))
    element.releasePointerCapture = vi.fn((pointerId: number) => captures.delete(pointerId))
}

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
        vi.useRealTimers()
    })

    function render(viewModel = makeViewModel(), {
        onSelectGene = () => undefined,
        onUseGene = async () => undefined,
        onEvolveGene = async () => undefined,
    }: {
        onSelectGene?: (geneId: string) => void
        onUseGene?: () => Promise<void>
        onEvolveGene?: () => Promise<void>
    } = {}) {
        act(() => {
            root.render(createElement(BattleScreen, {
                viewModel,
                onSelectGene,
                onSubmitGeneAction: async () => true,
                onUseGene,
                onEvolveGene,
                onLeaveSession: () => undefined,
            }))
        })
    }

    function renderInteractive({
        genes = GENES,
        onSubmitGeneAction = async () => true,
    }: {
        genes?: GeneCardV2[]
        onSubmitGeneAction?: (command: GeneActionCommandV2) => Promise<boolean>
    } = {}) {
        function Harness() {
            const [selectedGeneId, setSelectedGeneId] = useState(genes[0]!.id)

            return createElement(BattleScreen, {
                viewModel: makeViewModel({ genes, selectedGeneId }),
                onSelectGene: setSelectedGeneId,
                onSubmitGeneAction,
                onUseGene: async () => undefined,
                onEvolveGene: async () => undefined,
                onLeaveSession: () => undefined,
            })
        }

        act(() => root.render(createElement(Harness)))
    }

    function arrangeDropZones() {
        const playerZone = container.querySelector<HTMLElement>('.arena__drop-zone--player')!
        const opponentZone = container.querySelector<HTMLElement>('.arena__drop-zone--opponent')!

        setDropZoneRect(playerZone, 0, 100, 206, 500)
        setDropZoneRect(opponentZone, 206, 100, 412, 500)
        return { playerZone, opponentZone }
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

    it('keeps the ordered player mutation loadout in the battle board with semantic states', () => {
        render()

        const playerSlots = container.querySelectorAll('.mutation-loadout .mutation-slot')

        expect(playerSlots).toHaveLength(2)
        expect(playerSlots[1]?.classList.contains('mutation-slot--armed')).toBe(true)
        expect(playerSlots[1]?.querySelector('.mutation-slot__icon')?.getAttribute('aria-label')).toContain('Nucleo adattivo, attiva')
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
                onSubmitGeneAction: async () => true,
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

    it('keeps movement below the drag threshold as a normal tap selection', () => {
        renderInteractive()

        const armor = container.querySelectorAll<HTMLButtonElement>('.gene-orb')[1]!

        enablePointerCapture(armor)
        act(() => armor.dispatchEvent(pointerEvent('pointerdown', 50, 600)))
        act(() => armor.dispatchEvent(pointerEvent('pointermove', 56, 606)))

        expect(container.querySelector('.gene-drag-preview')).toBeNull()

        act(() => armor.dispatchEvent(pointerEvent('pointerup', 56, 606)))
        act(() => armor.click())

        expect(armor.getAttribute('aria-selected')).toBe('true')
    })

    it('starts dragging at exactly 10px and cancels the pending long press', () => {
        vi.useFakeTimers()
        renderInteractive()

        const ferocity = container.querySelectorAll<HTMLButtonElement>('.gene-orb')[0]!

        enablePointerCapture(ferocity)
        act(() => ferocity.dispatchEvent(pointerEvent('pointerdown', 50, 600)))
        act(() => ferocity.dispatchEvent(pointerEvent('pointermove', 60, 600)))
        act(() => vi.advanceTimersByTime(350))

        expect(container.querySelector('.gene-drag-preview')?.textContent).toContain('Ferocia')
        expect(ferocity.dataset.matchupVisible).toBeUndefined()

        act(() => ferocity.dispatchEvent(pointerEvent('pointerup', 500, 600)))
        act(() => ferocity.click())

        expect(document.querySelector('.gene-detail')).toBeNull()
    })

    it('drops an unselected gene on the player creature as an explicit EVOLVE command', async () => {
        const submit = vi.fn(async () => true)
        renderInteractive({ onSubmitGeneAction: submit })

        const armor = container.querySelectorAll<HTMLButtonElement>('.gene-orb')[1]!
        const { playerZone } = arrangeDropZones()

        enablePointerCapture(armor)
        act(() => armor.dispatchEvent(pointerEvent('pointerdown', 300, 700)))
        act(() => armor.dispatchEvent(pointerEvent('pointermove', 100, 250)))

        expect(playerZone.classList.contains('is-active')).toBe(true)
        expect(playerZone.dataset.dropState).toBe('valid')
        expect(container.querySelector<HTMLElement>('.gene-drag-preview')?.style.getPropertyValue('--gene-drag-x')).toBe('100px')

        await act(async () => {
            armor.dispatchEvent(pointerEvent('pointerup', 100, 250))
            await Promise.resolve()
        })

        expect(submit).toHaveBeenCalledOnce()
        expect(submit).toHaveBeenCalledWith({ geneId: 'ARMOR', actionType: 'EVOLVE' })
        expect(container.querySelectorAll('.gene-orb')[1]?.getAttribute('aria-selected')).toBe('true')
        expect(container.querySelector('.gene-drag-preview')).toBeNull()
    })

    it('drops an unselected gene on the opponent creature as an explicit USE command', async () => {
        const submit = vi.fn(async () => true)
        renderInteractive({ onSubmitGeneAction: submit })

        const agility = container.querySelectorAll<HTMLButtonElement>('.gene-orb')[2]!
        const { opponentZone } = arrangeDropZones()

        enablePointerCapture(agility)
        act(() => agility.dispatchEvent(pointerEvent('pointerdown', 100, 700)))
        act(() => agility.dispatchEvent(pointerEvent('pointermove', 310, 250)))

        expect(opponentZone.classList.contains('is-active')).toBe(true)
        expect(opponentZone.dataset.dropState).toBe('valid')

        await act(async () => {
            agility.dispatchEvent(pointerEvent('pointerup', 310, 250))
            await Promise.resolve()
        })

        expect(submit).toHaveBeenCalledWith({ geneId: 'AGILITY', actionType: 'USE' })
        expect(container.querySelectorAll('.gene-orb')[2]?.getAttribute('aria-selected')).toBe('true')
    })

    it('cancels a drop outside both creatures without changing selection', () => {
        const submit = vi.fn(async () => true)
        renderInteractive({ onSubmitGeneAction: submit })

        const armor = container.querySelectorAll<HTMLButtonElement>('.gene-orb')[1]!

        arrangeDropZones()
        enablePointerCapture(armor)
        act(() => armor.dispatchEvent(pointerEvent('pointerdown', 300, 700)))
        act(() => armor.dispatchEvent(pointerEvent('pointermove', 500, 600)))
        act(() => armor.dispatchEvent(pointerEvent('pointerup', 500, 600)))

        expect(submit).not.toHaveBeenCalled()
        expect(container.querySelectorAll('.gene-orb')[0]?.getAttribute('aria-selected')).toBe('true')
        expect(container.querySelector('.gene-drag-preview')).toBeNull()
    })

    it.each([
        { target: 'player', gene: { ...GENES[1]!, evolvable: false }, x: 100, stateSelector: '.arena__drop-zone--player' },
        { target: 'opponent', gene: { ...GENES[3]!, evolvable: true }, x: 310, stateSelector: '.arena__drop-zone--opponent' },
    ])('shows and rejects the disabled $target drop zone for the dragged gene', ({ gene, x, stateSelector }) => {
        const submit = vi.fn(async () => true)
        renderInteractive({ genes: [GENES[0]!, gene], onSubmitGeneAction: submit })

        const draggedOrb = container.querySelectorAll<HTMLButtonElement>('.gene-orb')[1]!

        arrangeDropZones()
        enablePointerCapture(draggedOrb)
        act(() => draggedOrb.dispatchEvent(pointerEvent('pointerdown', 300, 700)))
        act(() => draggedOrb.dispatchEvent(pointerEvent('pointermove', x, 250)))

        expect(container.querySelector<HTMLElement>(stateSelector)?.dataset.dropState).toBe('disabled')

        act(() => draggedOrb.dispatchEvent(pointerEvent('pointerup', x, 250)))

        expect(submit).not.toHaveBeenCalled()
        expect(container.querySelectorAll('.gene-orb')[0]?.getAttribute('aria-selected')).toBe('true')
    })

    it('ignores a secondary pointer throughout the primary pointer session', () => {
        renderInteractive()

        const ferocity = container.querySelectorAll<HTMLButtonElement>('.gene-orb')[0]!

        enablePointerCapture(ferocity)
        act(() => ferocity.dispatchEvent(pointerEvent('pointerdown', 50, 600)))
        act(() => ferocity.dispatchEvent(pointerEvent('pointermove', 100, 250, 2, false)))

        expect(container.querySelector('.gene-drag-preview')).toBeNull()

        act(() => ferocity.dispatchEvent(pointerEvent('pointermove', 100, 250)))

        expect(container.querySelector('.gene-drag-preview')).not.toBeNull()
    })

    it.each(['pointercancel', 'lostpointercapture'])('cleans drag state once on %s', (terminalEvent) => {
        const submit = vi.fn(async () => true)
        renderInteractive({ onSubmitGeneAction: submit })

        const ferocity = container.querySelectorAll<HTMLButtonElement>('.gene-orb')[0]!

        arrangeDropZones()
        enablePointerCapture(ferocity)
        act(() => ferocity.dispatchEvent(pointerEvent('pointerdown', 50, 600)))
        act(() => ferocity.dispatchEvent(pointerEvent('pointermove', 100, 250)))
        act(() => ferocity.dispatchEvent(pointerEvent(terminalEvent, 100, 250)))
        act(() => ferocity.dispatchEvent(pointerEvent('pointerup', 100, 250)))

        expect(container.querySelector('.gene-drag-preview')).toBeNull()
        expect(submit).not.toHaveBeenCalled()
    })

    it('does not submit twice when capture is lost after a valid pointerup', async () => {
        let resolveSubmit: ((result: boolean) => void) | undefined
        const submit = vi.fn(() => new Promise<boolean>((resolve) => {
            resolveSubmit = resolve
        }))
        renderInteractive({ onSubmitGeneAction: submit })

        const ferocity = container.querySelectorAll<HTMLButtonElement>('.gene-orb')[0]!

        arrangeDropZones()
        enablePointerCapture(ferocity)
        act(() => ferocity.dispatchEvent(pointerEvent('pointerdown', 50, 600)))
        act(() => ferocity.dispatchEvent(pointerEvent('pointermove', 310, 250)))
        act(() => ferocity.dispatchEvent(pointerEvent('pointerup', 310, 250)))
        act(() => ferocity.dispatchEvent(pointerEvent('lostpointercapture', 310, 250)))

        expect(submit).toHaveBeenCalledOnce()

        await act(async () => {
            resolveSubmit?.(true)
            await Promise.resolve()
        })
    })

    it('cleans an active drag when battle status changes', () => {
        render()

        const ferocity = container.querySelector<HTMLButtonElement>('.gene-orb')!

        enablePointerCapture(ferocity)
        act(() => ferocity.dispatchEvent(pointerEvent('pointerdown', 50, 600)))
        act(() => ferocity.dispatchEvent(pointerEvent('pointermove', 100, 250)))

        expect(container.querySelector('.gene-drag-preview')).not.toBeNull()

        render(makeViewModel({
            status: 'waiting',
            waitingState: {
                submittedGeneName: 'Ferocia',
                submittedAction: 'USE',
                submittedCountLabel: '1/2',
                opponentStatusLabel: 'In attesa dell avversario',
                isResolving: false,
            },
        }))

        expect(container.querySelector('.gene-drag-preview')).toBeNull()
        expect(ferocity.releasePointerCapture).toHaveBeenCalledOnce()
    })

    it('releases the commit lock after a rejected submission', async () => {
        const submit = vi.fn()
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce(true)
        renderInteractive({ onSubmitGeneAction: submit })

        const ferocity = container.querySelectorAll<HTMLButtonElement>('.gene-orb')[0]!

        arrangeDropZones()
        enablePointerCapture(ferocity)

        await act(async () => {
            ferocity.dispatchEvent(pointerEvent('pointerdown', 50, 600))
            ferocity.dispatchEvent(pointerEvent('pointermove', 310, 250))
            ferocity.dispatchEvent(pointerEvent('pointerup', 310, 250))
            await Promise.resolve()
        })
        await act(async () => {
            ferocity.dispatchEvent(pointerEvent('pointerdown', 50, 600))
            ferocity.dispatchEvent(pointerEvent('pointermove', 310, 250))
            ferocity.dispatchEvent(pointerEvent('pointerup', 310, 250))
            await Promise.resolve()
        })

        expect(submit).toHaveBeenCalledTimes(2)
    })

    it('keeps the existing USE and EVOLVE buttons as working fallbacks', async () => {
        const onUseGene = vi.fn(async () => undefined)
        const onEvolveGene = vi.fn(async () => undefined)

        render(makeViewModel(), { onUseGene, onEvolveGene })

        await act(async () => {
            container.querySelector<HTMLButtonElement>('.ev-btn--use')!.click()
            container.querySelector<HTMLButtonElement>('.ev-btn--evolve')!.click()
            await Promise.resolve()
        })

        expect(onUseGene).toHaveBeenCalledOnce()
        expect(onEvolveGene).toHaveBeenCalledOnce()
    })

    it('shows the event-adjusted expected score with visible matchup ears during a long press', () => {
        vi.useFakeTimers()
        const ferocity = {
            ...GENES[0]!,
            prediction: {
                ...GENES[0]!.prediction!,
                useScore: 5,
                eventModifier: 2,
            },
        }
        render(makeViewModel({ genes: [ferocity], selectedGeneId: ferocity.id, selectedGene: ferocity }))

        const geneOrb = container.querySelector<HTMLButtonElement>('.gene-orb')!
        const normalScore = geneOrb.querySelector('.gene-orb__score')?.textContent

        expect(normalScore).toBe('5')

        act(() => geneOrb.dispatchEvent(pointerEvent('pointerdown')))
        act(() => vi.advanceTimersByTime(350))

        expect(geneOrb.dataset.matchupVisible).toBe('true')
        expect(geneOrb.classList.contains('is-matchup-visible')).toBe(true)
        expect(geneOrb.querySelector('.gene-orb__expected-score')?.textContent).toBe(normalScore)
        expect(geneOrb.textContent).not.toContain('LIVELLO')
        expect(geneOrb.querySelector('.gene-orb__icon')?.classList.contains('is-context-hidden')).toBe(true)
        expect(geneOrb.querySelector('.gene-orb__score')?.classList.contains('is-context-hidden')).toBe(true)
        expect(geneOrb.querySelector('.gene-orb__frame')?.classList.contains('is-context-hidden')).toBe(true)
        expect([...geneOrb.querySelectorAll<HTMLElement>('.gene-orb__ear')].map((ear) => ear.dataset.gene)).toEqual(['ARMOR', 'CAMOUFLAGE'])
        expect(geneOrb.querySelector<HTMLElement>('.gene-orb__ear--strong')?.dataset.gene).toBe('ARMOR')
        expect(geneOrb.querySelector<HTMLElement>('.gene-orb__ear--weak')?.dataset.gene).toBe('CAMOUFLAGE')
        expect(getComputedStyle(geneOrb.querySelector<HTMLElement>('.gene-orb__matchups')!).zIndex).toBe('2')
        expect(getComputedStyle(geneOrb.querySelector<HTMLElement>('.gene-orb__disc')!).zIndex).toBe('1')
        expect(getComputedStyle(geneOrb.querySelector<HTMLElement>('.gene-orb__expected-score')!).zIndex).toBe('3')
        expect(getComputedStyle(geneOrb.querySelector<HTMLElement>('.gene-orb__expected-score')!).transformOrigin).toBe('50% 100%')
        expect(container.querySelector('.gene-matchup')).toBeNull()

        act(() => geneOrb.dispatchEvent(pointerEvent('pointerup')))

        expect(geneOrb.dataset.matchupVisible).toBeUndefined()
        expect(geneOrb.classList.contains('is-matchup-visible')).toBe(false)
        expect(geneOrb.querySelector('.gene-orb__score')?.classList.contains('is-context-hidden')).toBe(false)
    })

    it.each([0, -12])('keeps the normal expected score %i for a long press', (expectedScore) => {
        vi.useFakeTimers()
        const gene = {
            ...GENES[0]!,
            prediction: {
                ...GENES[0]!.prediction!,
                useScore: expectedScore,
            },
        }
        render(makeViewModel({ genes: [gene], selectedGeneId: gene.id, selectedGene: gene }))

        const geneOrb = container.querySelector<HTMLButtonElement>('.gene-orb')!
        const normalScore = geneOrb.querySelector('.gene-orb__score')?.textContent

        act(() => geneOrb.dispatchEvent(pointerEvent('pointerdown')))
        act(() => vi.advanceTimersByTime(350))

        expect(normalScore).toBe(String(expectedScore))
        expect(geneOrb.querySelector('.gene-orb__expected-score')?.textContent).toBe(normalScore)
    })

    it('does not select or open details after releasing a long press', () => {
        vi.useFakeTimers()
        renderInteractive()

        const armor = container.querySelectorAll<HTMLButtonElement>('.gene-orb')[1]!

        act(() => armor.dispatchEvent(pointerEvent('pointerdown')))
        act(() => vi.advanceTimersByTime(350))
        act(() => armor.dispatchEvent(pointerEvent('pointerup')))
        act(() => armor.click())

        expect(armor.getAttribute('aria-selected')).toBe('false')
        expect(document.querySelector('.gene-detail')).toBeNull()
    })

    it('cancels a pending long press when the pointer starts to scroll', () => {
        vi.useFakeTimers()
        renderInteractive()

        const ferocity = container.querySelectorAll<HTMLButtonElement>('.gene-orb')[0]!

        act(() => ferocity.dispatchEvent(pointerEvent('pointerdown')))
        act(() => ferocity.dispatchEvent(pointerEvent('pointermove', 11)))
        act(() => vi.advanceTimersByTime(350))

        expect(ferocity.dataset.matchupVisible).toBeUndefined()
    })

    it('cleans pointer state and timers on pointercancel and unmount', () => {
        vi.useFakeTimers()
        const clearTimer = vi.spyOn(globalThis, 'clearTimeout')
        renderInteractive()

        const ferocity = container.querySelectorAll<HTMLButtonElement>('.gene-orb')[0]!

        act(() => ferocity.dispatchEvent(pointerEvent('pointerdown')))
        act(() => ferocity.dispatchEvent(pointerEvent('pointercancel')))
        act(() => vi.advanceTimersByTime(350))

        expect(ferocity.dataset.matchupVisible).toBeUndefined()

        act(() => ferocity.dispatchEvent(pointerEvent('pointerdown')))
        act(() => ferocity.dispatchEvent(pointerEvent('pointermove', 10)))

        expect(container.querySelector('.gene-drag-preview')).not.toBeNull()

        act(() => root.unmount())

        expect(clearTimer).toHaveBeenCalled()
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
            player: { id: 'me', name: 'Tu', score: 0, roundValueTotal: null, status: 'choosing', creatureVisual: { src: '/player.png', alt: 'Giocatore', heightMeters: 1.4 } },
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

    it('keeps dynamic assets free from starter calibration while preserving the ground anchor', () => {
        render(makeViewModel({
            player: {
                id: 'me', name: 'Tu', score: 0, roundValueTotal: null, status: 'choosing',
                creatureVisual: {
                    src: '/player.png',
                    alt: 'Giocatore',
                    heightMeters: 1.652,
                    nativeFacing: 'left',
                },
            },
        }))

        const player = container.querySelector<HTMLElement>('.arena__creature--player')!
        const sprite = player.querySelector<HTMLImageElement>('.arena__sprite')!

        // JSDOM has no decoded alpha bitmap, so the framing safely starts at neutral rather than
        // inheriting the former .95 calibration reserved for bundled starter artwork.
        expect(player.dataset.framingNormalization).toBe('1.000')
        expect(player.dataset.biologicalScale).toBe('1.271')
        expect(player.style.getPropertyValue('--arena-ground-offset')).toBe('0px')
        expect(sprite.classList.contains('is-mirrored')).toBe(true)
        expect(getComputedStyle(sprite).transformOrigin).toMatch(/bottom/)
    })

    it('confirms before abandoning a running match', () => {
        let leaveCalls = 0

        act(() => {
            root.render(createElement(BattleScreen, {
                viewModel: makeViewModel(),
                onSelectGene: () => undefined,
                onSubmitGeneAction: async () => true,
                onUseGene: async () => undefined,
                onEvolveGene: async () => undefined,
                onLeaveSession: () => { leaveCalls += 1 },
            }))
        })

        const requestLeave = () => {
            const trigger = container.querySelector<HTMLButtonElement>('.duel-card__profile-trigger')!
            act(() => trigger.click())
            const action = container.querySelector<HTMLButtonElement>('.ev-menu__popover button')!
            act(() => action.click())
        }

        requestLeave()

        expect(document.querySelector('.ev-confirm')).not.toBeNull()
        expect(leaveCalls).toBe(0)

        const cancel = [...document.querySelectorAll<HTMLButtonElement>('.ev-confirm button')]
            .find((button) => button.textContent?.includes('Continua a giocare'))!

        act(() => cancel.click())

        expect(document.querySelector('.ev-confirm')).toBeNull()
        expect(leaveCalls).toBe(0)

        requestLeave()

        const confirm = [...document.querySelectorAll<HTMLButtonElement>('.ev-confirm button')]
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
