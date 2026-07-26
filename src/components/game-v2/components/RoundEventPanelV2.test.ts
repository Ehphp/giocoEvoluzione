import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RoundEventV2 } from '../types'
import { RoundEventPanelV2 } from './RoundEventPanelV2'

const currentEvent: RoundEventV2 = {
    id: 'current',
    title: 'Evento corrente',
    description: 'Descrizione corrente',
    effects: [],
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

function dispatchPointer(element: Element, type: string, init: { pointerId?: number; clientY?: number } = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperties(event, {
        button: { value: 0 },
        pointerId: { value: init.pointerId ?? 1 },
        clientY: { value: init.clientY ?? 100 },
    })
    element.dispatchEvent(event)
}

describe('RoundEventPanelV2 next event preview', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
        vi.useFakeTimers()
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
        vi.useRealTimers()
    })

    it('keeps the next event visible in a dedicated compact card', () => {
        const section = container.querySelector('[aria-label="Prossimo evento"]')
        const card = container.querySelector('.next-event-v2-card')

        expect(section?.textContent).toContain('Evento futuro')
        expect(card).not.toBeNull()
        expect(card?.getAttribute('aria-expanded')).toBe('false')
    })

    it('opens only after a long press and closes on release', () => {
        const card = container.querySelector('.next-event-v2-card')!

        act(() => {
            dispatchPointer(card, 'pointerdown')
            vi.advanceTimersByTime(419)
        })
        expect(container.querySelector('.next-event-v2-popover')).toBeNull()

        act(() => vi.advanceTimersByTime(1))
        const modifiers = [...container.querySelectorAll('.next-event-v2-modifier b')].map((node) => node.textContent)
        expect(modifiers).toEqual(['+2', '+1', '-1'])

        act(() => dispatchPointer(card, 'pointerup'))
        expect(container.querySelector('.next-event-v2-popover')).toBeNull()
    })

    it('closes the preview on swipe down', () => {
        const card = container.querySelector('.next-event-v2-card')!

        act(() => {
            dispatchPointer(card, 'pointerdown', { clientY: 100 })
            vi.advanceTimersByTime(420)
        })
        expect(container.querySelector('.next-event-v2-popover')).not.toBeNull()

        act(() => dispatchPointer(card, 'pointermove', { clientY: 150 }))
        expect(container.querySelector('.next-event-v2-popover')).toBeNull()
    })

    it('closes an accessible preview when the player taps outside', () => {
        const card = container.querySelector('.next-event-v2-card')!

        act(() => {
            card.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                bubbles: true,
                cancelable: true,
            }))
        })
        expect(container.querySelector('.next-event-v2-popover')).not.toBeNull()

        act(() => dispatchPointer(document.body, 'pointerdown'))
        expect(container.querySelector('.next-event-v2-popover')).toBeNull()
    })
})
