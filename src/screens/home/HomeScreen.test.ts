import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildGuestHomeViewModel } from './build-home-view-model'
import { HomeScreen } from './HomeScreen'
import type { HomeActions, HomeViewModel } from './types'

function createViewModel(): HomeViewModel {
    return buildGuestHomeViewModel({
        nickname: '',
        roomCode: '',
        botDifficulty: 'NORMAL',
        isOnline: true,
        errorMessage: null,
        statusMessage: null,
        isBusy: false,
        busyAction: null,
    })
}

function createActions(): HomeActions {
    return {
        onNicknameChange: vi.fn(),
        onRoomCodeChange: vi.fn(),
        onBotDifficultyChange: vi.fn(),
        onCreateGame: vi.fn(),
        onCreateBotGame: vi.fn(),
        onJoinGame: vi.fn(),
        onLeaveSession: vi.fn(),
        onLogout: vi.fn(),
    }
}

function createLongLineageViewModel(): HomeViewModel {
    const viewModel = createViewModel()
    const creature = viewModel.creature!
    const forms = [1, 2, 3, 4, 5, 6].map((generation) => ({
        id: `long-${generation}`,
        generation,
        name: `Forma ${generation}`,
        image: {
            src: `/assets/long-${generation}.png`,
            fallbackSrc: '/assets/battle/creatures/verdant-hatchling.webp',
            alt: `Verdante, Generazione ${generation - 1}`,
        },
        isCurrent: generation === 6,
    }))

    viewModel.creature = { ...creature, name: 'Verdante', image: forms.at(-1)!.image, visualVersions: forms }

    return viewModel
}

function createVisualLineageViewModel(): HomeViewModel {
    const viewModel = createViewModel()
    const creature = viewModel.creature!

    viewModel.creature = {
        ...creature,
        name: 'Verdante',
        image: {
            src: '/assets/form-3.png',
            fallbackSrc: '/assets/battle/creatures/verdant-hatchling.webp',
            alt: 'Verdante, Generazione 2',
        },
        visualVersions: [
            {
                id: 'form-1',
                generation: 1,
                name: 'Forma base',
                image: { src: '/assets/form-1.png', fallbackSrc: '/assets/battle/creatures/verdant-hatchling.webp', alt: 'Verdante, Generazione 0' },
                isCurrent: false,
            },
            {
                id: 'form-3',
                generation: 3,
                name: 'Arti slanciati',
                image: { src: '/assets/form-3.png', fallbackSrc: '/assets/battle/creatures/verdant-hatchling.webp', alt: 'Verdante, Generazione 2' },
                isCurrent: true,
            },
        ],
    }

    return viewModel
}

describe('HomeScreen', () => {
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

    function render(viewModel = createViewModel(), actions = createActions()) {
        act(() => {
            root.render(createElement(HomeScreen, { viewModel, actions }))
        })

        return actions
    }

    function openPlayModes() {
        act(() => container.querySelector<HTMLButtonElement>('.home-cta__play')!.click())
    }

    it('renders the hub with the branded logo, one creature and the single call to action', () => {
        render()

        const logo = container.querySelector<HTMLImageElement>('.home-brand__logo')!

        expect(logo.getAttribute('src')).toBe('/assets/branding/evori-logo.webp')
        expect(logo.getAttribute('alt')).toBe('Evori')
        expect(container.querySelector('[data-testid="home-creature-stage"]')).not.toBeNull()
        expect(container.querySelectorAll('.home-stage__creature')).toHaveLength(1)
        expect(container.querySelector('.home-cta__play')?.textContent).toContain('GIOCA')
        expect(container.querySelector('#player-name')).toBeNull()
    })

    it('keeps the account settings behind the player row instead of on the top bar', () => {
        render()

        expect(container.querySelector('.ev-menu__popover')).toBeNull()

        const trigger = container.querySelector<HTMLButtonElement>('.home-identity')!

        expect(trigger.getAttribute('aria-expanded')).toBe('false')
        act(() => trigger.click())

        const items = [...container.querySelectorAll<HTMLButtonElement>('.ev-menu__popover button')]

        expect(items.map((item) => item.textContent)).toEqual(['Audio attivo', 'Esci dall account'])
        expect(trigger.getAttribute('aria-expanded')).toBe('true')
    })

    it('asks to sign out rather than doing it: the menu only raises the request', () => {
        const actions = render()

        act(() => container.querySelector<HTMLButtonElement>('.home-identity')!.click())
        act(() => container.querySelector<HTMLButtonElement>('.home-account__logout')!.click())

        expect(actions.onLogout).toHaveBeenCalledTimes(1)
        // And it puts itself away first: the confirmation is an overlay, and two must not stack.
        expect(container.querySelector('.ev-menu__popover')).toBeNull()
    })

    it('forwards guest form values and every existing game action', () => {
        const actions = render()
        openPlayModes()

        const nickname = document.querySelector('#player-name') as HTMLInputElement
        const roomCode = document.querySelector('#room-code') as HTMLInputElement
        const difficulty = document.querySelector('#bot-difficulty') as HTMLSelectElement
        const buttons = [...document.querySelectorAll<HTMLButtonElement>('.ev-sheet button')]
        const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        const setSelectValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set

        act(() => {
            setInputValue?.call(nickname, 'Lince')
            nickname.dispatchEvent(new Event('input', { bubbles: true }))
            setInputValue?.call(roomCode, 'ABCDE')
            roomCode.dispatchEvent(new Event('input', { bubbles: true }))
            setSelectValue?.call(difficulty, 'HARD')
            difficulty.dispatchEvent(new Event('change', { bubbles: true }))
            buttons.find((button) => button.textContent?.includes('CREA PARTITA'))?.click()
            buttons.find((button) => button.textContent?.includes('Gioca contro il bot'))?.click()
            buttons.find((button) => button.textContent?.trim() === 'ENTRA')?.click()
            buttons.find((button) => button.textContent?.includes('Pulisci sessione locale'))?.click()
        })

        expect(actions.onNicknameChange).toHaveBeenCalledWith('Lince')
        expect(actions.onRoomCodeChange).toHaveBeenCalledWith('ABCDE')
        expect(actions.onBotDifficultyChange).toHaveBeenCalledWith('HARD')
        expect(actions.onCreateGame).toHaveBeenCalledTimes(1)
        expect(actions.onCreateBotGame).toHaveBeenCalledTimes(1)
        expect(actions.onJoinGame).toHaveBeenCalledTimes(1)
        expect(actions.onLeaveSession).toHaveBeenCalledTimes(1)
    })

    it('keeps room-code focus while normalizing typed or pasted input and supports Enter', () => {
        const onJoinGame = vi.fn()

        function RoomCodeHarness() {
            const [roomCode, setRoomCode] = useState('')
            const viewModel = createViewModel()
            viewModel.playModes.roomCode = roomCode
            const actions = createActions()
            actions.onRoomCodeChange = setRoomCode
            actions.onJoinGame = onJoinGame

            return createElement(HomeScreen, { viewModel, actions })
        }

        act(() => root.render(createElement(RoomCodeHarness)))
        openPlayModes()

        const roomCode = document.querySelector('#room-code') as HTMLInputElement
        const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

        act(() => roomCode.focus())
        act(() => {
            setInputValue?.call(roomCode, 'a')
            roomCode.dispatchEvent(new Event('input', { bubbles: true }))
        })

        expect(document.querySelector('#room-code')).toBe(roomCode)
        expect(document.activeElement).toBe(roomCode)
        expect(roomCode.value).toBe('A')

        act(() => {
            setInputValue?.call(roomCode, 'ab cde')
            roomCode.dispatchEvent(new Event('input', { bubbles: true }))
        })

        expect(document.activeElement).toBe(roomCode)
        expect(roomCode.value).toBe('ABCDE')

        act(() => roomCode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))

        expect(onJoinGame).toHaveBeenCalledTimes(1)
    })

    it('renders application notices and disables all game actions while busy', () => {
        const viewModel = createViewModel()
        viewModel.playModes.isBusy = true
        viewModel.playModes.busyAction = 'CREATE_BOT'
        viewModel.notices = [
            { id: 'offline', tone: 'warning', message: 'Connessione offline.' },
            { id: 'error', tone: 'error', message: 'Operazione non riuscita.' },
            { id: 'status', tone: 'success', message: 'Sessione pulita.' },
        ]

        render(viewModel)

        expect(container.textContent).toContain('Connessione offline.')
        expect(container.textContent).toContain('Operazione non riuscita.')
        expect(container.textContent).toContain('Sessione pulita.')

        openPlayModes()

        expect(document.querySelector('.ev-sheet')?.textContent).toContain('CREAZIONE...')
        expect(document.querySelectorAll('.ev-sheet button:disabled')).toHaveLength(3)
    })

    it('supports authenticated data and falls back when a creature image fails', () => {
        const viewModel = createViewModel()
        viewModel.mode = 'authenticated'
        viewModel.player = { displayName: 'Ada', accountLevel: 4, rating: '1.240', experience: { current: 30, required: 120 } }
        viewModel.creature = {
            name: 'Verdante',
            level: 4,
            evolution: { current: 2, total: 5 },
            image: {
                src: '/assets/missing-creature.png',
                fallbackSrc: '/assets/battle/creatures/verdant-hatchling.webp',
                alt: 'Verdante',
            },
            visualVersions: [{
                id: 'form-1',
                generation: 1,
                name: 'Forma iniziale',
                image: {
                    src: '/assets/missing-creature.png',
                    fallbackSrc: '/assets/battle/creatures/verdant-hatchling.webp',
                    alt: 'Verdante',
                },
                isCurrent: true,
            }],
        }

        render(viewModel)
        openPlayModes()

        const creatureImage = container.querySelector('.home-stage__creature') as HTMLImageElement

        expect(document.querySelector('#player-name')).toBeNull()
        expect(container.textContent).toContain('Ada')
        // The level is the badge on the avatar's ring now, not a line of caption under the creature.
        expect(container.querySelector('.ev-avatar-progress__level')?.textContent).toBe('4')
        expect(container.querySelector('.ev-avatar-progress__ring')?.getAttribute('aria-valuenow')).toBe('30')

        act(() => creatureImage.dispatchEvent(new Event('error')))

        expect(creatureImage.getAttribute('src')).toBe('/assets/battle/creatures/verdant-hatchling.webp')
    })

    it('shows the creature and nothing else: no caption, and no dialog behind it', () => {
        render(createVisualLineageViewModel())

        act(() => container.querySelector<HTMLElement>('.home-stage__creature')!.click())

        expect(container.querySelector('.home-stage__plaque')).toBeNull()
        // The rail below is tappable; the artwork itself is not.
        expect(container.querySelectorAll('.home-stage__carousel button')).toHaveLength(0)
        expect(document.querySelector('[role="dialog"]')).toBeNull()
    })

    it('starts the Home carousel on the current, most recent unlocked form', () => {
        render(createVisualLineageViewModel())

        expect(container.querySelector('[data-testid="home-creature-form-form-3"]')?.getAttribute('aria-hidden')).toBe('false')
        expect(container.querySelector('[data-testid="home-creature-form-form-1"]')?.getAttribute('aria-hidden')).toBe('true')
    })

    it('offers no form picker: the swipe is the only way through the lineage', () => {
        render(createVisualLineageViewModel())

        // The rail of generation thumbnails was a placeholder and is gone. It was also the last
        // thing asking for the whole lineage up front, which is what made a load cost 1.08 MB.
        expect(container.querySelector('[data-testid="home-forms-rail"]')).toBeNull()
        expect(container.querySelector('[role="tablist"]')).toBeNull()
        expect(container.querySelectorAll('[data-testid="home-creature-stage"] button')).toHaveLength(0)
    })

    it('fetches only the selected form and its neighbours, not the whole lineage', () => {
        render(createLongLineageViewModel())

        const slides = [...container.querySelectorAll<HTMLImageElement>('.home-stage__carousel img')]

        // Six forms on the creature, the last one current: only it and the one before it are asked
        // for. Giving every slide a `src` is what made a page load cost the entire lineage.
        expect(slides.map((slide) => slide.getAttribute('src')))
            .toEqual([null, null, null, null, '/assets/long-5.png', '/assets/long-6.png'])
    })

    it('fetches a form once a swipe reaches it, and keeps the ones already fetched', () => {
        render(createLongLineageViewModel())

        const carousel = container.querySelector<HTMLDivElement>('[data-testid="home-creature-carousel"]')!
        Object.defineProperty(carousel, 'clientWidth', { configurable: true, value: 300 })

        // Swipe from the current form back to the first one.
        act(() => {
            carousel.scrollLeft = 0
            carousel.dispatchEvent(new Event('scroll', { bubbles: true }))
        })

        const slides = [...container.querySelectorAll<HTMLImageElement>('.home-stage__carousel img')]

        // The first two are now reachable, and the pair fetched before the swipe is not given up:
        // dropping a `src` would only make the swipe back ask for the sprite a second time.
        expect(slides.map((slide) => slide.getAttribute('src')))
            .toEqual(['/assets/long-1.png', '/assets/long-2.png', null, null, '/assets/long-5.png', '/assets/long-6.png'])
    })

    it('carries the swipe one form at a time, fetching the next neighbour each step', () => {
        render(createLongLineageViewModel())

        const carousel = container.querySelector<HTMLDivElement>('[data-testid="home-creature-carousel"]')!
        Object.defineProperty(carousel, 'clientWidth', { configurable: true, value: 300 })
        const sources = () => [...container.querySelectorAll<HTMLImageElement>('.home-stage__carousel img')]
            .map((slide) => slide.getAttribute('src'))

        // Starting on the last of six: it and its one neighbour.
        expect(sources()).toEqual([null, null, null, null, '/assets/long-5.png', '/assets/long-6.png'])

        act(() => {
            carousel.scrollLeft = 3 * 300
            carousel.dispatchEvent(new Event('scroll', { bubbles: true }))
        })

        // One swipe left: the form before the new selection joins, the far end stays untouched.
        expect(sources()).toEqual([null, null, '/assets/long-3.png', '/assets/long-4.png', '/assets/long-5.png', '/assets/long-6.png'])
    })

    it('keeps the mouse drag alive past the first pull', () => {
        render(createLongLineageViewModel())

        const carousel = container.querySelector<HTMLDivElement>('[data-testid="home-creature-carousel"]')!
        carousel.setPointerCapture = vi.fn()
        carousel.focus = vi.fn()

        const pointerDown = new Event('pointerdown', { bubbles: true, cancelable: true })
        Object.assign(pointerDown, { pointerType: 'mouse', pointerId: 1, clientX: 0 })
        act(() => { carousel.dispatchEvent(pointerDown) })

        /*
         * The default has to go: left in, the browser claims the gesture for its own panning and
         * answers the capture with `pointercancel`, which drops the drag before the first move —
         * a mouse could pull the carousel exactly once and then never again. Only reproducible in
         * a real engine, so what the test can hold is the call that prevents it.
         */
        expect(pointerDown.defaultPrevented).toBe(true)
        expect(carousel.focus).toHaveBeenCalled()
        expect(carousel.setPointerCapture).toHaveBeenCalledWith(1)
    })

    it('updates the Home preview through scroll snap without changing the active creature', () => {
        const viewModel = createVisualLineageViewModel()
        const actions = render(viewModel)
        const carousel = container.querySelector<HTMLDivElement>('[data-testid="home-creature-carousel"]')!

        Object.defineProperty(carousel, 'clientWidth', { configurable: true, value: 300 })
        act(() => {
            carousel.scrollLeft = 0
            carousel.dispatchEvent(new Event('scroll', { bubbles: true }))
        })

        expect(container.querySelector('[data-testid="home-creature-form-form-1"]')?.getAttribute('aria-hidden')).toBe('false')
        expect(viewModel.creature?.visualVersions.find((version) => version.isCurrent)?.id).toBe('form-3')
        expect(Object.values(actions).every((action) => !vi.isMockFunction(action) || action.mock.calls.length === 0)).toBe(true)
    })

    it('closes the play dialog with Escape', () => {
        render()
        openPlayModes()

        expect(document.querySelector('[role="dialog"]')).not.toBeNull()

        act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))

        expect(document.querySelector('[role="dialog"]')).toBeNull()
    })
})
