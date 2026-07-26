import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HomeScreen } from './HomeScreen'

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

    it('keeps the game entry actions without rendering the legacy creature hero', () => {
        act(() => {
            root.render(createElement(HomeScreen, {
                nickname: '',
                roomCode: '',
                isOnline: true,
                errorMessage: null,
                statusMessage: null,
                isBusy: false,
                busyAction: null,
                onNicknameChange: vi.fn(),
                onRoomCodeChange: vi.fn(),
                onCreateGame: vi.fn(),
                onCreateBotGame: vi.fn(),
                onJoinGame: vi.fn(),
                onLeaveSession: vi.fn(),
            }))
        })

        expect(container.querySelector('.home-hero')).toBeNull()
        expect(container.querySelector('#player-name')).not.toBeNull()
        expect(container.textContent).toContain('CREA PARTITA')
        expect(container.textContent).toContain('Gioca contro il bot')
        expect(container.textContent).toContain('ENTRA')
    })
})
