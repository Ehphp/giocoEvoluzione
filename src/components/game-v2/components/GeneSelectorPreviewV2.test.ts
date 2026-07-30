import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GeneCardV2 } from '../types'
import { GeneSelectorPreviewV2 } from './GeneSelectorPreviewV2'

const gene = (input: Pick<GeneCardV2, 'id' | 'traitType' | 'name' | 'level' | 'affinity' | 'usable' | 'exhausted'> & { score: number; affinityValue: number }): GeneCardV2 => ({ ...input, strongAgainst: 'Avversario naturale', weakAgainst: 'Predatore naturale', prediction: { useScore: input.score, baseContribution: 2, levelContribution: input.level, eventModifier: input.affinityValue, reasons: [] } })
const genes: GeneCardV2[] = [
    gene({ id: 'FEROCITY', traitType: 'FEROCITY', name: 'Ferocia', level: 0, affinity: 'suitable', usable: true, exhausted: false, score: 3, affinityValue: 1 }),
    gene({ id: 'ARMOR', traitType: 'ARMOR', name: 'Corazza', level: 1, affinity: 'suitable', usable: true, exhausted: false, score: 4, affinityValue: 1 }),
    gene({ id: 'AGILITY', traitType: 'AGILITY', name: 'Agilita', level: 0, affinity: 'ideal', usable: true, exhausted: false, score: 4, affinityValue: 2 }),
    gene({ id: 'SENSES', traitType: 'SENSES', name: 'Sensi', level: 0, affinity: 'unfavorable', usable: false, exhausted: true, score: 2, affinityValue: 0 }),
    gene({ id: 'CAMOUFLAGE', traitType: 'CAMOUFLAGE', name: 'Mimetismo', level: 2, affinity: 'suitable', usable: true, exhausted: false, score: 5, affinityValue: 1 }),
]
function SelectorHarness() { const [selectedGeneId, setSelectedGeneId] = useState(genes[0]!.id); return createElement(GeneSelectorPreviewV2, { genes, selectedGeneId, onSelectGene: setSelectedGeneId }) }
describe('GeneSelectorPreviewV2 five-gene grid', () => {
    let container: HTMLDivElement; let root: Root
    beforeEach(() => { container = document.createElement('div'); document.body.append(container); root = createRoot(container); act(() => root.render(createElement(SelectorHarness))) })
    afterEach(() => { act(() => root.unmount()); container.remove() })
    it('renders all five genes in stable input order and selects each by tap', () => { const cards = [...container.querySelectorAll<HTMLButtonElement>('.selector-v2-card')]; expect(cards).toHaveLength(5); expect(cards.map((card) => card.title)).toEqual(genes.map((entry) => entry.name)); cards.forEach((card, index) => { act(() => card.click()); expect(cards[index]?.getAttribute('aria-selected')).toBe('true') }) })
    it('keeps keyboard selection and clearly exposes exhaustion, affinity and matchup', () => { const cards = [...container.querySelectorAll<HTMLButtonElement>('.selector-v2-card')]; act(() => cards[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))); expect(cards[1]?.getAttribute('aria-selected')).toBe('true'); act(() => cards[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))); expect(cards[4]?.getAttribute('aria-selected')).toBe('true'); expect(cards[3]?.classList.contains('is-exhausted')).toBe(true); expect(cards[3]?.textContent).toContain('Esaurito'); expect(cards[3]?.textContent).toContain('Affinita Sfavorevole'); expect(cards[3]?.textContent).toContain('Forte:') })
    it('does not reconstruct a score when the authoritative prediction is missing', () => {
        const geneWithoutPrediction: GeneCardV2 = {
            ...genes[4]!,
            prediction: undefined,
        }
        act(() => root.render(createElement(GeneSelectorPreviewV2, {
            genes: [geneWithoutPrediction],
            selectedGeneId: geneWithoutPrediction.id,
            onSelectGene: () => {},
        })))

        expect(container.querySelector('.selector-v2-points')?.textContent).toBe('— PT base')
        expect(container.querySelector('.selector-v2-card')?.getAttribute('aria-label')).toContain('valore ambientale non disponibile')
    })
})
