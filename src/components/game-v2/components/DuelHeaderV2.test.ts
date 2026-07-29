import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DuelHeaderV2 } from './DuelHeaderV2'

describe('DuelHeaderV2 score and tiebreak total', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
        container = document.createElement('div')
        document.body.append(container)
        root = createRoot(container)
        act(() => {
            root.render(createElement(DuelHeaderV2, {
                player: { id: 'player', name: 'Tu', score: 3, roundValueTotal: 12, status: 'choosing' },
                opponent: { id: 'opponent', name: 'Avversario', score: 3, roundValueTotal: 10, status: 'ready' },
                round: { current: 4, total: 7 },
                onLeaveSession: () => undefined,
            }))
        })
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('shows the stored round-value total used for the tiebreak below each score', () => {
        expect(container.querySelector('.duel-v2-card--player .duel-v2-score')?.textContent).toContain('TB 12')
        expect(container.querySelector('.duel-v2-card--opponent .duel-v2-score')?.textContent).toContain('TB 10')
    })
})
