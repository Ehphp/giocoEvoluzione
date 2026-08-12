import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LeaderboardScreen } from './LeaderboardScreen'

describe('LeaderboardScreen', () => {
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

    it('renders the supplied competitive leaderboard in rating order', () => {
        act(() => {
            root.render(createElement(LeaderboardScreen, {
                onBack: vi.fn(),
                onOpenProfile: vi.fn(),
                onLogout: vi.fn(),
                previewEntries: [
                    { position: 1, nickname: 'Aquila', skillRating: 1086 },
                    { position: 2, nickname: 'Naturalista', skillRating: 1000 },
                ],
            }))
        })

        const rows = [...container.querySelectorAll('.leaderboard-row')]

        expect(rows).toHaveLength(2)
        expect(rows[0]?.textContent).toContain('Aquila')
        expect(rows[0]?.textContent).toContain('1086')
        expect(rows[1]?.textContent).toContain('Naturalista')
        expect(container.textContent).toContain('Il rating cambia solo nelle partite PvP')
    })
})
