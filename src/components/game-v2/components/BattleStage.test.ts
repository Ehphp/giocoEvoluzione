import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getBattleBackgroundForEvent } from '../gameSelectionAssets'
import { BattleStage } from './BattleStage'

describe('BattleStage', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
        container = document.createElement('div')
        document.body.append(container)
        root = createRoot(container)
        act(() => {
            root.render(createElement(BattleStage, {
                playerCreature: { src: '/player.png', alt: 'Giocatore', scale: 1.1, offsetY: 12 },
                opponentCreature: { src: '/opponent.png', alt: 'Avversario', offsetX: 4 },
            }))
        })
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('renders creature layers without embedding the page background in the arena', () => {
        expect(container.querySelector('.battle-stage__background')).toBeNull()
        expect(container.querySelector<HTMLImageElement>('.battle-stage__creature--player img')?.src).toContain('/player.png')
        expect(container.querySelector<HTMLImageElement>('.battle-stage__creature--opponent img')?.src).toContain('/opponent.png')
        expect(container.querySelector('.battle-stage__versus')?.textContent).toBe('VS')
    })

    it('keeps visual sizing and offsets in the creature configuration', () => {
        const player = container.querySelector<HTMLElement>('.battle-stage__creature--player')!
        expect(player.style.getPropertyValue('--battle-creature-scale')).toBe('1.1')
        expect(player.style.getPropertyValue('--battle-creature-offset-y')).toBe('12%')
    })
})

describe('getBattleBackgroundForEvent', () => {
    it('returns the default background for unknown and missing events', () => {
        expect(getBattleBackgroundForEvent('unmapped-event')).toBe('/assets/battle/backgrounds/enchanted-forest.png')
        expect(getBattleBackgroundForEvent(undefined)).toBe('/assets/battle/backgrounds/enchanted-forest.png')
    })
})
