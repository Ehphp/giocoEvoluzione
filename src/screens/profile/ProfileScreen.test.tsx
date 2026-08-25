import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProfileScreen } from './ProfileScreen'

describe('ProfileScreen combat mutation loadout', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
        ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
        container = document.createElement('div')
        document.body.append(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('persists a slot replacement immediately and never offers the mutation in the other slot', async () => {
        const onSetCombatMutationLoadout = vi.fn().mockResolvedValue(undefined)
        act(() => {
            root.render(createElement(ProfileScreen, {
                profile: { id: 'profile', nickname: 'Naturalista', skill_rating: 1000, created_at: '2026-01-01', updated_at: '2026-01-01' },
                creature: { id: 'creature', profile_id: 'profile', lineage_id: 'lineage', base_creature_key: 'VERDANT_HATCHLING', name: 'Verdy', level: 1, experience: 0, progression_state: {}, combat_mutation_loadout: ['ELASTIC_LIMBS', 'ADAPTIVE_CORE'], created_at: '2026-01-01', updated_at: '2026-01-01' },
                history: [], isLoadingHistory: false, errorMessage: null, onSetCombatMutationLoadout,
            }))
        })

        const slot = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('Slot 1'))!
        act(() => slot.dispatchEvent(new MouseEvent('click', { bubbles: true })))
        const adaptiveCore = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.startsWith('Nucleo adattivo:'))!
        expect(adaptiveCore.disabled).toBe(true)
        const armored = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.startsWith('Memoria corazzata:'))!
        await act(async () => {
            armored.dispatchEvent(new MouseEvent('click', { bubbles: true }))
            await Promise.resolve()
        })

        expect(onSetCombatMutationLoadout).toHaveBeenCalledWith(['ARMORED_MEMORY', 'ADAPTIVE_CORE'])
        expect(document.body.textContent).not.toContain('Scegli una mutazione')
    })
})
