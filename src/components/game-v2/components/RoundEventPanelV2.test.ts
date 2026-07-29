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

describe('RoundEventPanelV2 compact module', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
        container = document.createElement('div')
        document.body.append(container)
        root = createRoot(container)
        act(() => {
            root.render(createElement(RoundEventPanelV2, { roundEvent: currentEvent, nextRoundEvent: nextEvent }))
        })
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('keeps current and next event in one compact module', () => {
        const module = container.querySelector('.event-v2-stack')
        const current = container.querySelector<HTMLButtonElement>('.event-v2-card')
        const next = container.querySelector<HTMLButtonElement>('.event-v2-next-trigger')

        expect(module?.textContent).toContain('Evento corrente')
        expect(module?.textContent).toContain('Evento futuro')
        expect(current?.getAttribute('aria-expanded')).toBe('false')
        expect(next?.getAttribute('aria-expanded')).toBe('false')
    })

    it('opens every current-event modifier and returns focus after Escape', () => {
        const current = container.querySelector<HTMLButtonElement>('.event-v2-card')!

        act(() => current.click())
        expect(document.querySelectorAll('.event-v2-popover .event-v2-modifier')).toHaveLength(currentEvent.effects.length)
        expect(current.getAttribute('aria-expanded')).toBe('true')

        act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
        expect(document.querySelector('.event-v2-popover')).toBeNull()
        expect(document.activeElement).toBe(current)
    })

    it('opens next-event details without creating a second large event card', () => {
        const next = container.querySelector<HTMLButtonElement>('.event-v2-next-trigger')!

        act(() => next.click())
        expect(document.querySelectorAll('.event-v2-popover .event-v2-modifier')).toHaveLength(nextEvent.effects.length)
        expect(next.getAttribute('aria-expanded')).toBe('true')

        act(() => next.click())
        expect(document.querySelector('.event-v2-popover')).toBeNull()
    })
})
