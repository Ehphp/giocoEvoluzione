import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TraitType } from '../../../game/types'
import type { GeneCardV2 } from '../types'
import { ActionPanelV2 } from './ActionPanelV2'
import { GeneSelectorPreviewV2 } from './GeneSelectorPreviewV2'
import { WaitingStateV2 } from './WaitingStateV2'

const TRAITS: TraitType[] = [
    'STRENGTH',
    'RESISTANCE',
    'AGILITY',
    'PERCEPTION',
    'METABOLISM',
    'ADAPTATION',
    'GRIP_CLAWS',
    'CAMOUFLAGE',
    'WEBBED_LIMBS',
    'FAT_RESERVES',
]

const GENES: GeneCardV2[] = TRAITS.map((traitType, index) => ({
    id: traitType,
    traitType,
    name: `Gene ${index + 1}`,
    level: index % 3,
    affinity: index === 0 ? 'excellent' : 'medium',
    usable: index !== 1,
    disabledReason: index === 1 ? 'Cooldown 2' : undefined,
    prediction: {
        useScore: 6 - Math.min(index, 4),
        baseContribution: 1,
        levelContribution: index % 3,
        eventContribution: index === 0 ? 3 : index === 2 ? -1 : 0,
        reasons: [],
    },
}))

function SelectorHarness() {
    const [selectedGeneId, setSelectedGeneId] = useState(GENES[0].id)

    return createElement(GeneSelectorPreviewV2, {
        genes: GENES,
        selectedGeneId,
        onSelectGene: setSelectedGeneId,
    })
}

describe('Gene Selection UI contract', () => {
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
        vi.restoreAllMocks()
    })

    it('keeps every gene in one non-circular rail and selects first and last safely', () => {
        act(() => root.render(createElement(SelectorHarness)))

        const cards = [...container.querySelectorAll<HTMLButtonElement>('.selector-v2-card')]
        expect(cards).toHaveLength(GENES.length)
        expect(container.querySelector('.selector-v2-arrow')).toBeNull()
        expect(container.querySelector('.selector-v2-dots')).toBeNull()
        expect(cards[0].getAttribute('aria-selected')).toBe('true')

        act(() => cards.at(-1)?.click())

        const selected = container.querySelector<HTMLButtonElement>('.selector-v2-card[aria-selected="true"]')
        const rail = container.querySelector<HTMLElement>('.selector-v2-rail')
        expect(selected?.textContent).toContain('Gene 10')
        expect(rail?.style.getPropertyValue('--rail-start')).toBe('7')
        expect(rail?.style.getPropertyValue('--rail-offset')).toBe('-70%')
        expect(rail?.style.getPropertyValue('--rail-width')).toBe(`${(GENES.length / 3) * 100}%`)
        expect(container.querySelectorAll('.selector-v2-card')).toHaveLength(GENES.length)
    })

    it('shows USE points as the primary value and event contribution as secondary data', () => {
        act(() => root.render(createElement(SelectorHarness)))

        const selected = container.querySelector('.selector-v2-card[aria-selected="true"]')
        expect(selected?.querySelector('.selector-v2-points')?.textContent).toBe('6 PT')
        expect(selected?.querySelector('.selector-v2-event-modifier')?.textContent).toBe('Evento +3')
    })

    it('keeps cooldown genes selectable for details while exposing why USE is unavailable', () => {
        act(() => root.render(createElement(SelectorHarness)))

        const cooldownGene = [...container.querySelectorAll<HTMLButtonElement>('.selector-v2-card')]
            .find((card) => card.textContent?.includes('Gene 2'))

        expect(cooldownGene?.disabled).toBe(false)
        expect(cooldownGene?.textContent).toContain('Cooldown 2')
        act(() => cooldownGene?.click())
        expect(cooldownGene?.getAttribute('aria-selected')).toBe('true')
    })

    it('submits USE and freezes both actions at a stable submitting state', () => {
        const onUseAction = vi.fn(async () => undefined)
        const onEvolveAction = vi.fn(async () => undefined)
        const renderActions = (isSubmitting: boolean, selectedAction: 'USE' | 'EVOLVE' | null) => {
            act(() => root.render(createElement(ActionPanelV2, {
                selectedAction,
                selectedGene: GENES[0],
                canUse: !isSubmitting,
                canEvolve: !isSubmitting,
                isSubmitting,
                onUseAction,
                onEvolveAction,
            })))
        }

        renderActions(false, null)
        const useButton = container.querySelector<HTMLButtonElement>('.action-v2-btn--use')!
        expect(useButton.querySelector('.action-v2-btn__value')?.textContent).toBe('6 PT')
        act(() => useButton.click())
        expect(onUseAction).toHaveBeenCalledOnce()

        renderActions(true, 'USE')
        const submittingUse = container.querySelector<HTMLButtonElement>('.action-v2-btn--use')!
        const submittingEvolve = container.querySelector<HTMLButtonElement>('.action-v2-btn--evolve')!
        expect(submittingUse.disabled).toBe(true)
        expect(submittingEvolve.disabled).toBe(true)
        expect(submittingUse.textContent).toContain('INVIO')
        expect(submittingEvolve.textContent).toContain('Scelta in corso')
    })

    it('shows cooldown in the USE action and preserves the multiplayer waiting summary', () => {
        act(() => root.render(createElement(ActionPanelV2, {
            selectedAction: null,
            selectedGene: GENES[1],
            canUse: false,
            canEvolve: true,
            isSubmitting: false,
            onUseAction: async () => undefined,
            onEvolveAction: async () => undefined,
        })))

        const useButton = container.querySelector<HTMLButtonElement>('.action-v2-btn--use')!
        expect(useButton.disabled).toBe(true)
        expect(useButton.textContent).toContain('Cooldown 2')

        act(() => root.render(createElement(WaitingStateV2, {
            waitingState: {
                submittedGeneName: 'Gene 2',
                submittedAction: 'EVOLVE',
                submittedCountLabel: '1/2',
                opponentStatusLabel: 'Avversario sta scegliendo',
                isResolving: false,
            },
        })))

        const waiting = container.querySelector('.waiting-v2')
        expect(waiting?.textContent).toContain('SCELTA INVIATA')
        expect(waiting?.textContent).toContain('Gene 2 · EVOLVI')
        expect(waiting?.textContent).toContain('1/2')
    })
})
