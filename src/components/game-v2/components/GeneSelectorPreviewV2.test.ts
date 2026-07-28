import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { GeneCardV2 } from '../types'
import { GeneSelectorPreviewV2 } from './GeneSelectorPreviewV2'

const genes: GeneCardV2[] = [
    { id: 'FEROCITY', traitType: 'FEROCITY', name: 'Ferocia', level: 0, affinity: 'medium', usable: true, prediction: { useScore: 1, baseContribution: 1, levelContribution: 0, eventModifier: 0, reasons: [] } },
    { id: 'ARMOR', traitType: 'ARMOR', name: 'Corazza', level: 1, affinity: 'medium', usable: true, prediction: { useScore: 2, baseContribution: 1, levelContribution: 1, eventModifier: 0, reasons: [] } },
    { id: 'AGILITY', traitType: 'AGILITY', name: 'Agilità', level: 0, affinity: 'high', usable: true, prediction: { useScore: 3, baseContribution: 1, levelContribution: 0, eventModifier: 2, reasons: [] } },
    { id: 'SENSES', traitType: 'SENSES', name: 'Sensi', level: 0, affinity: 'low', usable: false, disabledReason: 'Recupero 1', prediction: { useScore: 0, baseContribution: 1, levelContribution: 0, eventModifier: -1, reasons: [] } },
    { id: 'CAMOUFLAGE', traitType: 'CAMOUFLAGE', name: 'Mimetismo', level: 2, affinity: 'excellent', usable: true, prediction: { useScore: 4, baseContribution: 1, levelContribution: 2, eventModifier: 1, reasons: [] } },
]

function SelectorHarness() {
    const [selectedGeneId, setSelectedGeneId] = useState(genes[0]!.id)
    return createElement(GeneSelectorPreviewV2, { genes, selectedGeneId, onSelectGene: setSelectedGeneId })
}

describe('GeneSelectorPreviewV2 five-gene grid', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
        container = document.createElement('div')
        document.body.append(container)
        root = createRoot(container)
        act(() => root.render(createElement(SelectorHarness)))
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('renders all five genes simultaneously and selects each by tap', () => {
        const cards = [...container.querySelectorAll<HTMLButtonElement>('.selector-v2-card')]
        expect(cards).toHaveLength(5)

        cards.forEach((card, index) => {
            act(() => card.click())
            expect(cards[index]?.getAttribute('aria-selected')).toBe('true')
        })
    })

    it('keeps keyboard selection, aria-selected, and cooldown visibility', () => {
        const cards = [...container.querySelectorAll<HTMLButtonElement>('.selector-v2-card')]
        const first = cards[0]!

        act(() => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
        expect(cards[1]?.getAttribute('aria-selected')).toBe('true')

        act(() => cards[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })))
        expect(cards[4]?.getAttribute('aria-selected')).toBe('true')
        expect(cards[3]?.classList.contains('is-cooldown')).toBe(true)
        expect(cards[3]?.textContent).toContain('Recupero 1')
    })
})
