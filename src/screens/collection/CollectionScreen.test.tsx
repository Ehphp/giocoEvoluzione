import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CollectionScreen } from './CollectionScreen'

describe('CollectionScreen', () => {
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

    it('preselects the active form and previews a previously discovered form locally', () => {
        act(() => {
            root.render(createElement(CollectionScreen, {
                profile: {
                    id: 'profile-1',
                    nickname: 'Naturalista',
                    skill_rating: 1000,
                    created_at: '2026-01-01T00:00:00.000Z',
                    updated_at: '2026-01-01T00:00:00.000Z',
                },
                creature: {
                    id: 'creature-1',
                    profile_id: 'profile-1',
                    base_creature_key: 'verdant-hatchling',
                    name: 'Verdy',
                    level: 4,
                    experience: 90,
                    progression_state: {},
                    current_visual_version_id: 'form-3',
                    created_at: '2026-01-01T00:00:00.000Z',
                    updated_at: '2026-01-01T00:00:00.000Z',
                },
                isOnline: true,
                onBack: vi.fn(),
                onOpenProfile: vi.fn(),
                onOpenRanking: vi.fn(),
                onLogout: vi.fn(),
                visualUrl: '/assets/current-form.png',
                visualVersionNumber: 3,
                currentVisualVersionId: 'form-3',
                visualHistory: [
                    { id: 'form-1', versionNumber: 1, visualTraitId: null, conceptName: 'Forma base', signedUrl: '/assets/form-1.png' },
                    { id: 'form-3', versionNumber: 3, visualTraitId: 'AGILITY', conceptName: 'Arti slanciati', signedUrl: '/assets/form-3.png' },
                ],
            }))
        })

        const cards = [...container.querySelectorAll<HTMLButtonElement>('.collection-form')]
        const lineageButtons = [...container.querySelectorAll<HTMLButtonElement>('.collection-lineage__button')]
        const preview = container.querySelector<HTMLImageElement>('.collection-current__art')!

        expect(cards).toHaveLength(2)
        expect(lineageButtons).toHaveLength(2)
        expect(cards[1]?.getAttribute('aria-pressed')).toBe('true')
        expect(lineageButtons[1]?.getAttribute('aria-pressed')).toBe('true')
        expect(preview.getAttribute('src')).toBe('/assets/form-3.png')
        expect(container.querySelector('.collection-current__copy')?.textContent).toContain('Forma attuale')

        act(() => cards[0]!.click())

        expect(cards[0]?.getAttribute('aria-pressed')).toBe('true')
        expect(cards[1]?.getAttribute('aria-pressed')).toBe('false')
        expect(cards[0]?.classList.contains('is-selected')).toBe(true)
        expect(cards[1]?.classList.contains('is-selected')).toBe(false)
        expect(lineageButtons[0]?.getAttribute('aria-pressed')).toBe('true')
        expect(lineageButtons[1]?.getAttribute('aria-pressed')).toBe('false')
        expect(preview.getAttribute('src')).toBe('/assets/form-1.png')
        expect(container.querySelector('#current-creature-title')?.textContent).toBe('Generazione 0')
        expect(container.querySelector('.collection-current__copy')?.textContent).toContain('Forma base')
        expect(container.querySelector('.collection-current__copy')?.textContent).toContain('Forma selezionata')
        expect(container.querySelector('.collection-current__copy')?.textContent).not.toContain('Creatura attuale')

        act(() => lineageButtons[1]!.click())

        expect(cards[0]?.getAttribute('aria-pressed')).toBe('false')
        expect(cards[1]?.getAttribute('aria-pressed')).toBe('true')
        expect(lineageButtons[0]?.getAttribute('aria-pressed')).toBe('false')
        expect(lineageButtons[1]?.getAttribute('aria-pressed')).toBe('true')
        expect(preview.getAttribute('src')).toBe('/assets/form-3.png')
    })
})
