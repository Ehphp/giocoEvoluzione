import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CreatureLineageRecord, PlayerCreatureRecord, ProfileRecord } from '../lib/profile-api'
import { useCreatureVisuals } from './use-creature-visuals'

/**
 * Pins how often the collection thumbnails are fetched.
 *
 * Each lineage costs two edge calls, and `lineages` arrives as a fresh array from every profile
 * refresh — of which there are seven triggers, most of them unrelated to artwork (a match result, a
 * combat-mutation loadout). Keying the loader on the array identity meant refetching the whole
 * collection whenever any of them fired.
 *
 * What has to stay true is the other half: the lineage record carries no version number, so a newly
 * adopted artwork is invisible in the list. If the fetch no longer follows the array, it has to
 * follow an explicit signal from the two handlers that change a visual — otherwise the thumbnails
 * silently keep the old form, which is worse than the wasted egress.
 */

const getCurrentCreatureVisual = vi.fn(async ({ creatureId }: { creatureId: string }) => ({
    visual: {
        signedUrl: `https://example.test/${creatureId}.webp`,
        expiresAt: '2030-01-01T00:00:00.000Z',
        versionNumber: 4,
        versionId: `version-${creatureId}`,
        visualTraitId: 'ARMOR',
        isBaseVersion: false,
    },
}))

const getCreatureVisualProgress = vi.fn(async ({ creatureId }: { creatureId: string }) => ({
    track: { progress: 2, target: 3, status: 'IDLE' },
    currentVersion: { id: `version-${creatureId}`, versionNumber: 4, visualTraitId: 'ARMOR' },
    history: [],
}))

const rollbackCreatureVisualVersion = vi.fn(async (_input: Record<string, unknown>) => ({}))

vi.mock('../lib/creature-transformations-api', () => ({
    getCurrentCreatureVisual: (...args: unknown[]) => getCurrentCreatureVisual(...(args as [{ creatureId: string }])),
    getCreatureVisualProgress: (...args: unknown[]) => getCreatureVisualProgress(...(args as [{ creatureId: string }])),
    rollbackCreatureVisualVersion: (...args: unknown[]) => rollbackCreatureVisualVersion(...(args as [Record<string, unknown>])),
}))

// The flag is read from import.meta.env at module load; the hook is inert without it.
vi.mock('./use-evolution-route', () => ({ isCreatureVisualProgressionEnabled: true }))

const PROFILE = { id: 'profile-1', nickname: 'Naturalista' } as ProfileRecord

function lineage(id: string, creatureId: string): CreatureLineageRecord {
    return {
        id,
        profile_id: 'profile-1',
        name: null,
        base_creature_key: 'VERDANT_HATCHLING',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        creature: { id: creatureId, lineage_id: id, base_creature_key: 'VERDANT_HATCHLING', level: 4 } as PlayerCreatureRecord,
    }
}

const refreshProfile = vi.fn(async () => undefined)

let container: HTMLDivElement
let root: Root
let api: ReturnType<typeof useCreatureVisuals>

function Probe({ lineages }: { lineages: readonly CreatureLineageRecord[] }) {
    api = useCreatureVisuals({ profile: PROFILE, activeCreature: null, lineages, refreshProfile })
    return null
}

async function render(lineages: readonly CreatureLineageRecord[]) {
    await act(async () => {
        root.render(createElement(Probe, { lineages }))
    })
}

/** One lineage costs one GET_CURRENT_VISUAL and one GET_VISUAL_PROGRESS. */
function lineageFetches() {
    return getCurrentCreatureVisual.mock.calls.length
}

beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
})

afterEach(() => {
    act(() => root.unmount())
    container.remove()
})

describe('useCreatureVisuals lineage thumbnails', () => {
    it('fetches one visual per lineage on mount', async () => {
        await render([lineage('lineage-1', 'creature-1'), lineage('lineage-2', 'creature-2')])

        expect(lineageFetches()).toBe(2)
        expect(getCreatureVisualProgress).toHaveBeenCalledTimes(2)
        expect(Object.keys(api.lineageVisuals).sort()).toEqual(['lineage-1', 'lineage-2'])
    })

    it('does not refetch when a profile refresh rebuilds the same list', async () => {
        await render([lineage('lineage-1', 'creature-1'), lineage('lineage-2', 'creature-2')])
        expect(lineageFetches()).toBe(2)

        // A new array with new record objects — exactly what loadAccount returns every refresh.
        await render([lineage('lineage-1', 'creature-1'), lineage('lineage-2', 'creature-2')])

        expect(lineageFetches()).toBe(2)
    })

    it('refetches when a lineage is added', async () => {
        await render([lineage('lineage-1', 'creature-1')])
        expect(lineageFetches()).toBe(1)

        await render([lineage('lineage-1', 'creature-1'), lineage('lineage-2', 'creature-2')])

        expect(lineageFetches()).toBe(3)
    })

    it('refetches when a lineage swaps its creature', async () => {
        await render([lineage('lineage-1', 'creature-1')])
        expect(lineageFetches()).toBe(1)

        await render([lineage('lineage-1', 'creature-9')])

        expect(lineageFetches()).toBe(2)
    })

    it('refetches after an adoption, which the lineage record cannot show', async () => {
        const lineages = [lineage('lineage-1', 'creature-1')]
        await render(lineages)
        expect(lineageFetches()).toBe(1)

        await act(async () => {
            await api.onVisualChanged()
        })

        expect(lineageFetches()).toBe(2)
        expect(refreshProfile).toHaveBeenCalledTimes(1)
    })

    it('refetches after a rollback to an earlier version', async () => {
        await render([lineage('lineage-1', 'creature-1')])
        expect(lineageFetches()).toBe(1)

        await act(async () => {
            await api.selectVisualVersion({
                creatureId: 'creature-1',
                targetVersionId: 'version-2',
                currentVersionId: 'version-4',
            })
        })

        expect(rollbackCreatureVisualVersion).toHaveBeenCalledTimes(1)
        expect(lineageFetches()).toBe(2)
    })
})
