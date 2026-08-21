import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildGuestHomeViewModel } from './buildHomeViewModel'
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
        onOpenProfile: vi.fn(),
        onOpenCollection: vi.fn(),
        onOpenRanking: vi.fn(),
        onLogout: vi.fn(),
    }
}

function createVisualLineageViewModel(): HomeViewModel {
    const viewModel = createViewModel()
    const creature = viewModel.creature!

    viewModel.creature = {
        ...creature,
        name: 'Verdante',
        image: {
            src: '/assets/form-3.png',
            fallbackSrc: '/assets/battle/creatures/verdant-hatchling.png',
            alt: 'Verdante, Generazione 2',
        },
        visualVersions: [
            {
                id: 'form-1',
                generation: 1,
                name: 'Forma base',
                image: { src: '/assets/form-1.png', fallbackSrc: '/assets/battle/creatures/verdant-hatchling.png', alt: 'Verdante, Generazione 0' },
                isCurrent: false,
            },
            {
                id: 'form-3',
                generation: 3,
                name: 'Arti slanciati',
                image: { src: '/assets/form-3.png', fallbackSrc: '/assets/battle/creatures/verdant-hatchling.png', alt: 'Verdante, Generazione 2' },
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

        expect(logo.getAttribute('src')).toBe('/assets/branding/evori-logo.png')
        expect(logo.getAttribute('alt')).toBe('Evori')
        expect(container.querySelector('[data-testid="home-creature-stage"]')).not.toBeNull()
        expect(container.querySelectorAll('.home-stage__creature')).toHaveLength(1)
        expect(container.querySelector('.home-cta__play')?.textContent).toContain('GIOCA')
        expect(container.querySelector('#player-name')).toBeNull()
    })

    it('locks the destinations that are not shipped yet and keeps battle current', () => {
        render()

        const items = [...container.querySelectorAll<HTMLButtonElement>('.ev-dock__item')]

        expect(items.map((item) => item.textContent)).toEqual(['Negozio', 'Collezione', 'Battaglia', 'Classifica', 'Creatura'])
        expect(items.find((item) => item.classList.contains('is-active'))?.textContent).toBe('Battaglia')
        expect(items.every((item) => item.disabled)).toBe(true)
    })

    it('opens the profile from the dock once the capability is available', () => {
        const viewModel = createViewModel()
        viewModel.capabilities = { ...viewModel.capabilities, profile: true }
        const actions = render(viewModel)

        const profileTab = [...container.querySelectorAll<HTMLButtonElement>('.ev-dock__item')].at(-1)!

        expect(profileTab.disabled).toBe(false)
        act(() => profileTab.click())

        expect(actions.onOpenProfile).toHaveBeenCalledTimes(1)
    })

    it('opens the competitive leaderboard from the dock once the capability is available', () => {
        const viewModel = createViewModel()
        viewModel.capabilities = { ...viewModel.capabilities, rankings: true }
        const actions = render(viewModel)

        const rankingTab = [...container.querySelectorAll<HTMLButtonElement>('.ev-dock__item')][3]!

        expect(rankingTab.disabled).toBe(false)
        act(() => rankingTab.click())

        expect(actions.onOpenRanking).toHaveBeenCalledTimes(1)
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
        viewModel.player = { displayName: 'Ada', accountLevel: 4, rankLabel: 'Esploratrice' }
        viewModel.creature = {
            name: 'Verdante',
            level: 4,
            evolution: { current: 2, total: 5 },
            image: {
                src: '/assets/missing-creature.png',
                fallbackSrc: '/assets/battle/creatures/verdant-hatchling.png',
                alt: 'Verdante',
            },
            visualVersions: [{
                id: 'form-1',
                generation: 1,
                name: 'Forma iniziale',
                image: {
                    src: '/assets/missing-creature.png',
                    fallbackSrc: '/assets/battle/creatures/verdant-hatchling.png',
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
        expect(container.textContent).toContain('Livello 4')

        act(() => creatureImage.dispatchEvent(new Event('error')))

        expect(creatureImage.getAttribute('src')).toBe('/assets/battle/creatures/verdant-hatchling.png')
    })

    it('opens the active creature description when its image is selected', () => {
        const viewModel = createVisualLineageViewModel()
        viewModel.creature = { ...viewModel.creature!, shortDescription: 'Una creatura quadrupede dalle scaglie verdi, con una lunga coda piumata e morbide corna arancioni.' }

        render(viewModel)
        const trigger = container.querySelector<HTMLButtonElement>('[data-testid="home-creature-description-trigger"]')

        expect(trigger?.getAttribute('aria-label')).toBe('Leggi la descrizione di Verdante')
        expect(document.querySelector('[role="dialog"]')).toBeNull()

        act(() => trigger?.click())

        expect(document.querySelector('[role="dialog"]')?.textContent).toContain('lunga coda piumata')
    })

    it('does not make the creature interactive when the active version has no description', () => {
        render(createVisualLineageViewModel())

        expect(container.querySelector('[data-testid="home-creature-description-trigger"]')).toBeNull()
    })

    it('starts the Home carousel on the current, most recent unlocked form', () => {
        render(createVisualLineageViewModel())

        expect(container.querySelector('[data-testid="home-creature-form-form-3"]')?.getAttribute('aria-hidden')).toBe('false')
        expect(container.querySelector('[data-testid="home-creature-form-form-1"]')?.getAttribute('aria-hidden')).toBe('true')
        expect(container.querySelector('.home-stage__plaque')?.textContent).toContain('Generazione 2')
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
        expect(container.querySelector('.home-stage__plaque')?.textContent).toContain('Generazione 0')
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
