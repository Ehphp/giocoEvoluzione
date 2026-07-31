import { act, createElement } from 'react'
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
    }
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
        const playButton = container.querySelector('.home-primary-navigation__play') as HTMLButtonElement

        act(() => playButton.click())
    }

    it('renders the guest hub with one personal creature and working play modes', () => {
        render()

        expect(container.querySelector('[data-testid="home-creature-stage"]')).not.toBeNull()
        expect(container.querySelectorAll('.home-creature-stage__creature')).toHaveLength(1)
        expect(container.querySelector('#player-name')).toBeNull()
        expect(container.querySelector('.home-primary-navigation__play')?.textContent).toContain('Gioca')

        const futureNavigation = [...container.querySelectorAll('.home-primary-navigation__future button')]
        expect(futureNavigation.map((button) => button.textContent)).toEqual(['Collezione', 'Classifica', 'Profilo'])
        expect(futureNavigation.every((button) => (button as HTMLButtonElement).disabled)).toBe(true)

        openPlayModes()

        expect(container.querySelector('[role="dialog"]')).not.toBeNull()
        expect(container.querySelector('#player-name')).not.toBeNull()
        expect(container.textContent).toContain('CREA PARTITA')
        expect(container.textContent).toContain('Gioca contro il bot')
        expect(container.textContent).toContain('ENTRA')
    })

    it('forwards guest form values and every existing game action', () => {
        const actions = render()
        openPlayModes()
        const nickname = container.querySelector('#player-name') as HTMLInputElement
        const roomCode = container.querySelector('#room-code') as HTMLInputElement
        const difficulty = container.querySelector('#bot-difficulty') as HTMLSelectElement
        const buttons = [...container.querySelectorAll('button')]
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
        openPlayModes()

        expect(container.textContent).toContain('Connessione offline.')
        expect(container.textContent).toContain('Operazione non riuscita.')
        expect(container.textContent).toContain('Sessione pulita.')
        expect(container.textContent).toContain('CREAZIONE...')
        expect(container.querySelectorAll('.home-play-modes button:disabled')).toHaveLength(3)
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
        }

        render(viewModel)
        openPlayModes()

        const creatureImage = container.querySelector('.home-creature-stage__creature') as HTMLImageElement
        expect(container.querySelector('#player-name')).toBeNull()
        expect(container.textContent).toContain('Ada')
        expect(container.textContent).toContain('Livello 4')

        act(() => creatureImage.dispatchEvent(new Event('error')))

        expect(creatureImage.getAttribute('src')).toBe('/assets/battle/creatures/verdant-hatchling.png')
    })

    it('closes the play dialog with Escape', () => {
        render()
        openPlayModes()

        act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))

        expect(container.querySelector('[role="dialog"]')).toBeNull()
    })
})
