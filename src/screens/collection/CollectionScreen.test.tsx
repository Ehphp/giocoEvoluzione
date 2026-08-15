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
                    lineage_id: 'lineage-1',
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

        act(() => preview.dispatchEvent(new Event('error')))
        expect(preview.getAttribute('src')).toBe('/assets/battle/creatures/verdant-hatchling.png')

        act(() => lineageButtons[1]!.click())

        expect(cards[0]?.getAttribute('aria-pressed')).toBe('false')
        expect(cards[1]?.getAttribute('aria-pressed')).toBe('true')
        expect(lineageButtons[0]?.getAttribute('aria-pressed')).toBe('false')
        expect(lineageButtons[1]?.getAttribute('aria-pressed')).toBe('true')
        expect(preview.getAttribute('src')).toBe('/assets/form-3.png')
    })

    it('switches the displayed timeline by lineage without changing the active lineage', () => {
        const onSetActiveLineage = vi.fn()
        const onOpenEvolution = vi.fn()
        const creature = {
            id: 'creature-a', profile_id: 'profile-1', lineage_id: 'lineage-a', base_creature_key: 'VERDANT_HATCHLING', name: 'Verde', level: 2, experience: 30, progression_state: {}, current_visual_version_id: 'a-2', created_at: '2026-01-01', updated_at: '2026-01-01',
        }
        const secondCreature = { ...creature, id: 'creature-b', lineage_id: 'lineage-b', name: 'Viola', current_visual_version_id: 'b-3' }
        act(() => {
            root.render(createElement(CollectionScreen, {
                profile: { id: 'profile-1', nickname: 'Naturalista', skill_rating: 1000, created_at: '2026-01-01', updated_at: '2026-01-01', active_lineage_id: 'lineage-a' },
                creature,
                lineages: [
                    { id: 'lineage-a', profile_id: 'profile-1', name: 'Stirpe verde', base_creature_key: 'VERDANT_HATCHLING', created_at: '2026-01-01', updated_at: '2026-01-01', creature },
                    { id: 'lineage-b', profile_id: 'profile-1', name: 'Stirpe viola', base_creature_key: 'VERDANT_HATCHLING', created_at: '2026-01-01', updated_at: '2026-01-01', creature: secondCreature },
                ],
                activeLineageId: 'lineage-a', onSetActiveLineage, onOpenEvolution, isOnline: true, onBack: vi.fn(), onOpenProfile: vi.fn(), onOpenRanking: vi.fn(), onLogout: vi.fn(),
                lineageVisuals: {
                    'lineage-a': { visualUrl: '/a-2.png', visualVersionNumber: 2, visualTrait: null, currentVisualVersionId: 'a-2', visualHistory: [{ id: 'a-1', versionNumber: 1, visualTraitId: null, conceptName: 'Base A', signedUrl: '/a-1.png' }, { id: 'a-2', versionNumber: 2, visualTraitId: 'AGILITY', conceptName: 'A2', signedUrl: '/a-2.png' }] },
                    'lineage-b': { visualUrl: '/b-3.png', visualVersionNumber: 3, visualTrait: null, currentVisualVersionId: 'b-3', visualHistory: [{ id: 'b-1', versionNumber: 1, visualTraitId: null, conceptName: 'Base B', signedUrl: '/b-1.png' }, { id: 'b-3', versionNumber: 3, visualTraitId: 'ARMOR', conceptName: 'B3', signedUrl: '/b-3.png' }] },
                },
            }))
        })
        const tabs = [...container.querySelectorAll<HTMLButtonElement>('.collection-lineages__button')]
        expect(tabs).toHaveLength(2)
        act(() => tabs[1]!.click())
        expect(container.querySelector('.collection-current__art')?.getAttribute('src')).toBe('/b-3.png')
        expect(container.querySelectorAll('.collection-form')).toHaveLength(2)
        expect(container.textContent).toContain('Usa questa stirpe')
        expect(onSetActiveLineage).not.toHaveBeenCalled()
        const evolve = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('Evolvi questa stirpe'))
        act(() => evolve?.click())
        expect(onOpenEvolution).toHaveBeenCalledWith('lineage-b')
        expect(onSetActiveLineage).not.toHaveBeenCalled()
    })

    it('offers a control to create a fresh lineage', () => {
        const onCreateLineage = vi.fn().mockResolvedValue('lineage-2')
        act(() => {
            root.render(createElement(CollectionScreen, {
                profile: { id: 'profile-1', nickname: 'Naturalista', skill_rating: 1000, created_at: '2026-01-01', updated_at: '2026-01-01' },
                creature: { id: 'creature-1', profile_id: 'profile-1', lineage_id: 'lineage-1', base_creature_key: 'VERDANT_HATCHLING', name: 'Verde', level: 1, experience: 0, progression_state: {}, created_at: '2026-01-01', updated_at: '2026-01-01' },
                isOnline: true, onBack: vi.fn(), onOpenProfile: vi.fn(), onOpenRanking: vi.fn(), onLogout: vi.fn(), onCreateLineage,
            }))
        })

        const action = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('Nuova stirpe'))
        expect(action).toBeDefined()
        act(() => action?.click())
        expect(onCreateLineage).toHaveBeenCalledTimes(1)
    })
})
