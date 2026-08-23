import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ActionButton, Button, IconButton } from './components'
import { Dock } from './Dock'
import { playCue } from './feedback/feedback'

vi.mock('./feedback/feedback', () => ({ playCue: vi.fn() }))

const playCueMock = vi.mocked(playCue)

/**
 * Feedback is wired into the primitives rather than into screens, so this is the test that says the
 * whole app is covered. A cue that has to be remembered at every call site is a cue that gets
 * forgotten at half of them.
 */
describe('primitive feedback', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
        playCueMock.mockClear()
        container = document.createElement('div')
        document.body.append(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    function click(selector = 'button') {
        act(() => {
            container.querySelector<HTMLButtonElement>(selector)!.click()
        })
    }

    it.each([
        ['use', 'confirm'],
        ['gold', 'confirm'],
        ['evolve', 'evolve'],
        ['danger', 'alert'],
        ['info', 'tap'],
        ['cream', 'tap'],
        ['ghost', 'tap'],
    ] as const)('reads the cue for a %s button off its tone', (tone, expected) => {
        act(() => root.render(<Button tone={tone}>Azione</Button>))
        click()

        expect(playCueMock).toHaveBeenCalledWith(expected)
    })

    it('still calls the handler the call site passed', () => {
        const onClick = vi.fn()
        act(() => root.render(<Button onClick={onClick}>Azione</Button>))
        click()

        expect(onClick).toHaveBeenCalledTimes(1)
        expect(playCueMock).toHaveBeenCalledTimes(1)
    })

    it('lets a call site override the cue, or ask for silence', () => {
        act(() => root.render(<Button tone="use" cue="back">Indietro</Button>))
        click()
        expect(playCueMock).toHaveBeenCalledWith('back')

        playCueMock.mockClear()
        act(() => root.render(<Button tone="use" cue={null}>Muto</Button>))
        click()
        expect(playCueMock).not.toHaveBeenCalled()
    })

    it('says nothing when a disabled button is pressed', () => {
        const onClick = vi.fn()
        act(() => root.render(<Button disabled onClick={onClick}>Azione</Button>))
        click()

        expect(onClick).not.toHaveBeenCalled()
        expect(playCueMock).not.toHaveBeenCalled()
    })

    it('marks a destructive icon button as an alert and everything else as a tap', () => {
        act(() => root.render(<IconButton label="Esci" variant="danger">x</IconButton>))
        click()
        expect(playCueMock).toHaveBeenCalledWith('alert')

        playCueMock.mockClear()
        act(() => root.render(<IconButton label="Indietro">x</IconButton>))
        click()
        expect(playCueMock).toHaveBeenCalledWith('tap')
    })

    it('confirms the round decision through ActionButton', () => {
        act(() => root.render(<ActionButton tone="use" title="Usa" hint="gene" glyph={null} />))
        click()

        expect(playCueMock).toHaveBeenCalledWith('confirm')
    })

    it('taps for every dock destination', () => {
        const onNavigate = vi.fn()
        act(() => root.render(
            <Dock active="battle" capabilities={{ collection: true, profile: true, ranking: true }} onNavigate={onNavigate} />,
        ))
        click('.ev-dock__item:not(.is-active):not([disabled])')

        expect(playCueMock).toHaveBeenCalledWith('tap')
        expect(onNavigate).toHaveBeenCalledTimes(1)
    })
})
