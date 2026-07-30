import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { GeneCardV2 } from '../types'
import { ActionPanelV2 } from './ActionPanelV2'
import { WaitingStateV2 } from './WaitingStateV2'

const selectedGene: GeneCardV2 = {
    id: 'AGILITY',
    traitType: 'AGILITY',
    name: 'Agilità',
    level: 0,
    affinity: 'ideal',
    usable: true,
    exhausted: false,
    strongAgainst: 'Sensi',
    weakAgainst: 'Corazza',
    prediction: { useScore: 4, baseContribution: 2, levelContribution: 0, eventModifier: 2, reasons: [] },
}

describe('action and waiting states', () => {
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

    it('keeps both actions available and makes the evolve transition explicit', () => {
        act(() => {
            root.render(createElement(ActionPanelV2, {
                selectedAction: null,
                selectedGene,
                canUse: true,
                canEvolve: true,
                isSubmitting: false,
                onUseAction: async () => {},
                onEvolveAction: async () => {},
            }))
        })

        expect(container.querySelector('.action-v2-btn--use')?.textContent).toContain('USA')
        expect(container.querySelector('.action-v2-btn--evolve')?.textContent).toContain('1 PT')
        expect(container.querySelector('.action-v2-btn--evolve')?.textContent).toContain('LV 0 → 1')
    })

    it.each([
        { level: 0, exhausted: false, label: 'EVOLVI' },
        { level: 1, exhausted: true, label: 'EVOLVI E RECUPERA' },
        { level: 2, exhausted: true, label: 'RECUPERA' },
    ])('labels the real EVOLVE transition at level $level/exhausted=$exhausted', ({ level, exhausted, label }) => {
        act(() => {
            root.render(createElement(ActionPanelV2, {
                selectedAction: null,
                selectedGene: { ...selectedGene, level, exhausted, usable: !exhausted },
                canUse: !exhausted,
                canEvolve: true,
                isSubmitting: false,
                onUseAction: async () => {},
                onEvolveAction: async () => {},
            }))
        })

        expect(container.querySelector('.action-v2-btn--evolve .action-v2-btn__label')?.textContent).toBe(label)
    })

    it('disables EVOLVE when a max-level gene is already available', () => {
        act(() => {
            root.render(createElement(ActionPanelV2, {
                selectedAction: null,
                selectedGene: { ...selectedGene, level: 2, exhausted: false },
                canUse: true,
                canEvolve: false,
                isSubmitting: false,
                onUseAction: async () => {},
                onEvolveAction: async () => {},
            }))
        })

        expect(container.querySelector<HTMLButtonElement>('.action-v2-btn--evolve')?.disabled).toBe(true)
        expect(container.querySelector('.action-v2-btn--evolve')?.textContent).toContain('Gia disponibile al livello massimo')
    })

    it('renders waiting as the alternative state of the same decision dock', () => {
        act(() => {
            root.render(createElement(WaitingStateV2, {
                waitingState: {
                    submittedGeneName: 'Agilità',
                    submittedAction: 'USE',
                    submittedCountLabel: '1/2',
                    opponentStatusLabel: 'In attesa dell avversario',
                    isResolving: false,
                },
            }))
        })

        expect(container.querySelector('.waiting-v2')).not.toBeNull()
        expect(container.querySelector('.waiting-v2')?.textContent).toContain('Agilità')
        expect(container.querySelector('.waiting-v2')?.textContent).toContain('1/2')
    })
})
