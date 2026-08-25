import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Dock, type DockCapabilities, type DockTab } from './Dock'

vi.mock('./feedback/feedback', () => ({ playCue: vi.fn() }))

/**
 * The dock is rendered once for the whole app rather than by each screen, so nothing else asserts
 * its behaviour any more: the gating and the labelling below used to be checked through the home
 * screen, which no longer knows the dock exists.
 */
describe('Dock', () => {
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

    function render(active: DockTab | null, capabilities: DockCapabilities, onNavigate = vi.fn()) {
        act(() => root.render(<Dock active={active} capabilities={capabilities} onNavigate={onNavigate} />))

        return { onNavigate, items: [...container.querySelectorAll<HTMLButtonElement>('.ev-dock__item')] }
    }

    it('carries every destination name without printing one, and says which are not shipped', () => {
        const { items } = render('battle', {})

        // Icon-only slots: the label lives on as the accessible name, which is where it is asserted.
        expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
            'Negozio — disponibile presto',
            'Collezione — disponibile presto',
            'Battaglia',
            'Classifica — disponibile presto',
            'Creatura — disponibile presto',
        ])
        expect(items.every((item) => item.textContent === '')).toBe(true)
        expect(items.find((item) => item.classList.contains('is-active'))?.getAttribute('aria-label')).toBe('Battaglia')
        expect(items.every((item) => item.disabled)).toBe(true)
    })

    it.each([
        ['profile', 4],
        ['ranking', 3],
        ['collection', 1],
    ] as const)('opens %s once its capability is available', (tab, index) => {
        const { onNavigate, items } = render('battle', { [tab]: true })

        expect(items[index]!.disabled).toBe(false)
        act(() => items[index]!.click())

        expect(onNavigate).toHaveBeenCalledWith(tab)
    })

    it('offers every destination, and no pill, on a screen that is not one of them', () => {
        // A sub-route shows the dock with nothing current: that is what replaces its back button.
        const { items } = render(null, { collection: true, profile: true, ranking: true })

        expect(container.querySelector('.ev-dock__pill')).toBeNull()
        expect(items.some((item) => item.classList.contains('is-active'))).toBe(false)
        expect(items.filter((item) => !item.disabled)).toHaveLength(4)
    })

    it('places the travelling pill on the active slot, so it has somewhere to travel from', () => {
        // The pill is positioned in CSS from these two custom properties; jsdom applies no stylesheet,
        // so the index is what can be held to account here. Geometry is checked against the real
        // browser by the preview screenshots.
        const bar = () => container.querySelector<HTMLDivElement>('.ev-dock__bar')!

        render('battle', { collection: true, profile: true, ranking: true })
        expect(container.querySelector('.ev-dock__pill')).not.toBeNull()
        expect(bar().style.getPropertyValue('--ev-dock-slots')).toBe('5')
        expect(bar().style.getPropertyValue('--ev-dock-active')).toBe('2')

        render('profile', { collection: true, profile: true, ranking: true })
        expect(bar().style.getPropertyValue('--ev-dock-active')).toBe('4')
    })
})
