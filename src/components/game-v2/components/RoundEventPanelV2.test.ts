import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RoundEventV2 } from '../types'
import { RoundEventPanelV2 } from './RoundEventPanelV2'

const currentEvent: RoundEventV2 = {
    id: 'current',
    title: 'Evento corrente',
    description: 'Descrizione corrente',
    effects: [
        { id: 'current-p2', label: 'Forza', modifier: 2, value: '+2 Forza', tone: 'positive' },
        { id: 'current-p1', label: 'Agilità', modifier: 1, value: '+1 Agilità', tone: 'positive' },
        { id: 'current-n1', label: 'Mimetismo', modifier: -1, value: '-1 Mimetismo', tone: 'negative' },
        { id: 'current-n2', label: 'Riserva adiposa', modifier: -2, value: '-2 Riserva adiposa', tone: 'negative' },
    ],
}

const nextEvent: RoundEventV2 = {
    id: 'next',
    title: 'Evento futuro',
    description: 'Descrizione futura',
    effects: [
        { id: 'p2', label: 'Gene +2', modifier: 2, value: '+2 Gene +2', tone: 'positive' },
        { id: 'p1', label: 'Gene +1', modifier: 1, value: '+1 Gene +1', tone: 'positive' },
        { id: 'n1', label: 'Gene -1', modifier: -1, value: '-1 Gene -1', tone: 'negative' },
    ],
}

function dispatchPointer(element: Element, type: string) {
    const event = new Event(type, { bubbles: true, cancelable: true })
    element.dispatchEvent(event)
}

describe('RoundEventPanelV2 next event preview', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
        container = document.createElement('div')
        document.body.append(container)
        root = createRoot(container)
        act(() => {
            root.render(createElement(RoundEventPanelV2, {
                roundEvent: currentEvent,
                nextRoundEvent: nextEvent,
            }))
        })
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('keeps the next event visible in a dedicated compact card', () => {
        const section = container.querySelector('[aria-label="Prossimo evento"]')
        const card = container.querySelector('.next-event-v2-card')

        expect(section?.textContent).toContain('Evento futuro')
        expect(card).not.toBeNull()
        expect(card?.getAttribute('aria-expanded')).toBe('false')
    })

    it('opens the current event and exposes every impacted gene', () => {
        const card = container.querySelector<HTMLButtonElement>('.event-v2-card')!

        expect(card.getAttribute('aria-expanded')).toBe('false')
        act(() => card.dispatchEvent(new MouseEvent('click', { bubbles: true })))

        const modifiers = [...container.querySelectorAll('.current-event-v2-popover .next-event-v2-modifier')]
        expect(modifiers).toHaveLength(currentEvent.effects.length)
        expect(modifiers.map((node) => node.textContent)).toEqual([
            '+2Forza',
            '+1Agilità',
            '-1Mimetismo',
            '-2Riserva adiposa',
        ])
        expect(card.getAttribute('aria-expanded')).toBe('true')

        act(() => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
        expect(container.querySelector('.current-event-v2-popover')).toBeNull()
        expect(document.activeElement).toBe(card)
    })

    it('opens on tap, exposes every modifier, and closes on a second tap', () => {
        const card = container.querySelector('.next-event-v2-card')!

        act(() => card.dispatchEvent(new MouseEvent('click', { bubbles: true })))
        const modifiers = [...container.querySelectorAll('.next-event-v2-modifier b')].map((node) => node.textContent)
        expect(modifiers).toEqual(['+2', '+1', '-1'])
        expect(card.getAttribute('aria-expanded')).toBe('true')

        act(() => card.dispatchEvent(new MouseEvent('click', { bubbles: true })))
        expect(container.querySelector('.next-event-v2-popover')).toBeNull()
        expect(card.getAttribute('aria-expanded')).toBe('false')
    })

    it('closes the preview with Escape and returns focus to its trigger', () => {
        const card = container.querySelector<HTMLButtonElement>('.next-event-v2-card')!

        act(() => card.dispatchEvent(new MouseEvent('click', { bubbles: true })))
        expect(container.querySelector('.next-event-v2-popover')).not.toBeNull()

        act(() => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
        expect(container.querySelector('.next-event-v2-popover')).toBeNull()
        expect(document.activeElement).toBe(card)
    })

    it('closes the preview when the player taps outside', () => {
        const card = container.querySelector('.next-event-v2-card')!

        act(() => card.dispatchEvent(new MouseEvent('click', { bubbles: true })))
        expect(container.querySelector('.next-event-v2-popover')).not.toBeNull()

        act(() => dispatchPointer(document.body, 'pointerdown'))
        expect(container.querySelector('.next-event-v2-popover')).toBeNull()
    })
})
