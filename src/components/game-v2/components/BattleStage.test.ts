import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_BATTLE_OPPONENT_CREATURE, getBattleBackgroundForEvent } from '../gameSelectionAssets'
import { BattleStage } from './BattleStage'
import { shouldMirrorCreature } from './creatureOrientation'

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
        const versus = container.querySelector<HTMLImageElement>('.battle-stage__versus')
        expect(versus?.src).toContain('/assets/game-ui/battle-versus.png')
        expect(versus?.alt).toBe('')
    })

    it('keeps visual sizing and offsets in the creature configuration', () => {
        const player = container.querySelector<HTMLElement>('.battle-stage__creature--player')!
        expect(player.style.getPropertyValue('--battle-creature-scale')).toBe('1.1')
        expect(player.style.getPropertyValue('--battle-creature-offset-y')).toBe('12%')
    })

    it('faces local and remote creatures toward each other without mirroring their wrappers', () => {
        const player = container.querySelector<HTMLElement>('.battle-stage__creature--player')!
        const opponent = container.querySelector<HTMLElement>('.battle-stage__creature--opponent')!

        expect(player.dataset.facing).toBe('right')
        expect(opponent.dataset.facing).toBe('left')
        expect(player.classList.contains('is-mirrored')).toBe(false)
        expect(opponent.classList.contains('is-mirrored')).toBe(false)
        expect(opponent.querySelector('img')?.classList.contains('is-mirrored')).toBe(true)
    })

    it('keeps the bot fallback unmirrored because its source sprite already faces left', () => {
        act(() => {
            root.render(createElement(BattleStage, {
                playerCreature: { src: '/player.png', alt: 'Giocatore' },
                opponentCreature: DEFAULT_BATTLE_OPPONENT_CREATURE,
            }))
        })

        expect(container.querySelector('.battle-stage__creature--opponent img')?.classList.contains('is-mirrored')).toBe(false)
    })
})

describe('shouldMirrorCreature', () => {
    it('uses one native-facing rule for both sides', () => {
        expect(shouldMirrorCreature('right', 'right')).toBe(false)
        expect(shouldMirrorCreature('right', 'left')).toBe(true)
        expect(shouldMirrorCreature('left', 'left')).toBe(false)
        expect(shouldMirrorCreature('left', 'right')).toBe(true)
    })
})

describe('getBattleBackgroundForEvent', () => {
    it('returns the default background for unknown and missing events', () => {
        expect(getBattleBackgroundForEvent('unmapped-event')).toBe('/assets/battle/backgrounds/enchanted-forest.png')
        expect(getBattleBackgroundForEvent(undefined)).toBe('/assets/battle/backgrounds/enchanted-forest.png')
    })
})
