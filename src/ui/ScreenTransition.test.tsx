import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ScreenTransition } from './ScreenTransition'
import { Overlay } from './components'

const mounts: string[] = []

/** Stands in for a screen: records its mounts and keeps state we can watch survive a transition. */
function Probe({ label }: { label: string }) {
    const [value, setValue] = useState(label)

    if (!mounts.includes(label)) {
        mounts.push(label)
    }

    return (
        <div data-testid={label}>
            <input value={value} onChange={(event) => setValue(event.target.value)} />
        </div>
    )
}

describe('ScreenTransition', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
        mounts.length = 0
        container = document.createElement('div')
        document.body.append(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    function show(screenKey: string, depth: number, node = <Probe label={screenKey} />) {
        act(() => {
            root.render(<ScreenTransition screenKey={screenKey} depth={depth}>{node}</ScreenTransition>)
        })
    }

    function layers() {
        return [...container.querySelectorAll<HTMLElement>('.ev-screen-layer')]
    }

    function swap() {
        return container.querySelector<HTMLElement>('.ev-screen-swap')!
    }

    /**
     * jsdom has no `AnimationEvent`, so React's vendor-prefix detection settles on
     * `webkitAnimationEnd` here where a real browser gives it `animationend`. Firing both keeps the
     * test honest about the handler rather than about which name the environment happens to use.
     */
    function endAnimationOn(element: Element) {
        act(() => {
            element.dispatchEvent(new Event('animationend', { bubbles: true }))
            element.dispatchEvent(new Event('webkitAnimationEnd', { bubbles: true }))
        })
    }

    function endLeavingAnimation() {
        endAnimationOn(container.querySelector('.ev-screen-layer--leaving')!)
    }

    it('shows a single layer until the screen actually changes', () => {
        show('home', 1)

        expect(layers()).toHaveLength(1)
        expect(layers()[0].className).toContain('ev-screen-layer--entering')

        // A re-render of the same screen is not a transition.
        show('home', 1)

        expect(layers()).toHaveLength(1)
    })

    it('keeps the outgoing screen on stage for the length of the transition, and inert', () => {
        show('home', 1)
        show('profile', 1)

        const [leaving, entering] = layers()
        expect(leaving.className).toContain('ev-screen-layer--leaving')
        expect(leaving.getAttribute('aria-hidden')).toBe('true')
        expect(leaving.hasAttribute('inert')).toBe(true)
        expect(leaving.querySelector('[data-testid="home"]')).not.toBeNull()
        expect(entering.querySelector('[data-testid="profile"]')).not.toBeNull()
    })

    it('cross-fades between screens at the same depth, so the dock does not travel', () => {
        show('home', 1)
        show('profile', 1)

        expect(swap().dataset.move).toBe('fade')
    })

    it('pushes going deeper and pops coming back', () => {
        show('collection', 1)
        show('creature-evolution', 2)

        expect(swap().dataset.move).toBe('push')

        endLeavingAnimation()
        show('home', 1)

        expect(swap().dataset.move).toBe('pop')
    })

    it('holds the move after the transition ends, so the settled screen does not animate again', () => {
        show('home', 1)
        show('battle', 3)
        expect(swap().dataset.move).toBe('push')

        endLeavingAnimation()

        expect(layers()).toHaveLength(1)
        expect(swap().dataset.move).toBe('push')
    })

    it('drops the outgoing layer when its own animation ends, ignoring animations from inside it', () => {
        show('home', 1)
        show('profile', 1)

        endAnimationOn(container.querySelector('[data-testid="home"]')!)

        expect(layers()).toHaveLength(2)

        endLeavingAnimation()

        expect(layers()).toHaveLength(1)
        expect(layers()[0].querySelector('[data-testid="profile"]')).not.toBeNull()
    })

    it('drops the outgoing layer on its own if the animation never reports back', () => {
        vi.useFakeTimers()

        try {
            show('home', 1)
            show('profile', 1)
            expect(layers()).toHaveLength(2)

            act(() => {
                vi.advanceTimersByTime(1_000)
            })

            expect(layers()).toHaveLength(1)
        } finally {
            vi.useRealTimers()
        }
    })

    it('re-renders the outgoing screen instead of re-mounting it, so its state survives the exit', () => {
        show('home', 1)

        const input = container.querySelector<HTMLInputElement>('[data-testid="home"] input')!
        act(() => {
            input.value = 'edited'
            input.dispatchEvent(new Event('input', { bubbles: true }))
        })

        const homeNodeBefore = container.querySelector('[data-testid="home"]')

        show('profile', 1)

        const homeNodeAfter = container.querySelector('[data-testid="home"]')
        expect(homeNodeAfter).toBe(homeNodeBefore)
        expect(homeNodeAfter!.querySelector<HTMLInputElement>('input')!.value).toBe('edited')
        expect(mounts).toEqual(['home', 'profile'])
    })

    it('closes an overlay owned by the screen that is leaving', () => {
        function WithOverlay({ label }: { label: string }) {
            return (
                <div data-testid={label}>
                    <Overlay label="Modalita di partita">
                        <p data-testid={`${label}-sheet`}>contenuto</p>
                    </Overlay>
                </div>
            )
        }

        show('home', 1, <WithOverlay label="home" />)
        expect(document.querySelector('[data-testid="home-sheet"]')).not.toBeNull()

        show('battle', 3)

        // The overlay portals to the body, so no transform on the leaving layer could fade it out:
        // it would sit at full opacity over the arriving screen. It has to withdraw instead.
        expect(document.querySelector('[data-testid="home-sheet"]')).toBeNull()
        expect(document.body.style.overflow).toBe('')
    })
})
