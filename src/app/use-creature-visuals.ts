import { useCallback, useEffect, useRef, useState } from 'react'

import {
    getCreatureVisualProgress,
    getCurrentCreatureVisual,
    rollbackCreatureVisualVersion,
} from '../lib/creature-transformations-api'
import type { CreatureLineageRecord, PlayerCreatureRecord, ProfileRecord } from '../lib/profile-api'
import { withResolvedCreatureImage } from '../ui/assets'
import { isCreatureVisualProgressionEnabled } from './use-evolution-route'

export type OfficialVisual = {
    signedUrl: string
    expiresAt: string
    versionNumber: number
    versionId: string
    visualTraitId?: string | null
    isBaseVersion?: boolean
}

export type VisualProgressSummary = {
    track: { progress: number; target: number; status: string } | null
    currentVersion: {
        id: string
        versionNumber: number
        visualTraitId: string | null
        shortDescription?: string | null
    }
    history: ReadonlyArray<{
        id: string
        versionNumber: number
        visualTraitId: string | null
        conceptName: string | null
        signedUrl: string
        expiresAt: string
    }>
}

export type LineageVisualSummary = Record<
    string,
    {
        visualUrl: string
        visualVersionNumber: number
        visualTrait: string | null
        currentVisualVersionId: string
        visualHistory: VisualProgressSummary['history']
    }
>

/** The signed URL is short-lived, so it is refreshed shortly before it expires. */
const REFRESH_MARGIN_MS = 30_000
const MINIMUM_REFRESH_DELAY_MS = 15_000

async function loadVisual(creatureId: string) {
    const [visual, progression] = await Promise.all([
        getCurrentCreatureVisual({ operation: 'GET_CURRENT_VISUAL', creatureId }),
        getCreatureVisualProgress({ operation: 'GET_VISUAL_PROGRESS', creatureId }),
    ])
    return {
        official: withResolvedCreatureImage(visual.visual),
        progress: {
            track: progression.track,
            currentVersion: progression.currentVersion,
            history: progression.history.map(withResolvedCreatureImage),
        },
        expiresAt: visual.visual.expiresAt,
    }
}

/**
 * Holds on to the previous value while `signature` is unchanged.
 *
 * Every profile refresh rebuilds `lineages` from the network, so the array is a new object even
 * when nothing about it differs — and there are seven ways to trigger a refresh. Depending on its
 * identity made the thumbnail loader below re-issue two edge calls per lineage each time, for a
 * list that had not changed.
 */
function useStableBySignature<T>(value: T, signature: string): T {
    const held = useRef({ signature, value })
    if (held.current.signature !== signature) {
        held.current = { signature, value }
    }
    return held.current.value
}

/**
 * Owns the generated artwork of the active creature and of every lineage in the collection.
 *
 * Two separate loads on purpose: the active creature's visual is kept fresh on a timer because it
 * is on screen continuously, while the collection's thumbnails are fetched once per lineage list
 * and are reloaded only when that list changes or a visual is adopted.
 */
export function useCreatureVisuals(input: {
    profile: ProfileRecord | null
    activeCreature: PlayerCreatureRecord | null
    lineages: readonly CreatureLineageRecord[]
    refreshProfile: () => Promise<void>
}) {
    // --- state -----------------------------------------------------------------
    const [officialVisual, setOfficialVisual] = useState<OfficialVisual | null>(null)
    const [visualProgress, setVisualProgress] = useState<VisualProgressSummary | null>(null)
    const [lineageVisuals, setLineageVisuals] = useState<LineageVisualSummary>({})
    /**
     * Bumped by the two handlers that change a visual. The lineage record carries no version, so a
     * new artwork is invisible in the list itself: without this the thumbnails would keep showing
     * the pre-adoption form.
     */
    const [visualsRevision, setVisualsRevision] = useState(0)

    const { profile, activeCreature, lineages, refreshProfile } = input

    // --- derived: the identity the thumbnail loader actually depends on ---------
    const stableLineages = useStableBySignature(
        lineages,
        lineages.map((lineage) => `${lineage.id}:${lineage.creature.id}`).join('|'),
    )

    // --- effects ---------------------------------------------------------------
    useEffect(() => {
        if (!isCreatureVisualProgressionEnabled || !profile || !activeCreature) {
            setOfficialVisual(null)
            setVisualProgress(null)
            return
        }

        let active = true
        let refreshTimer: number | undefined

        const load = async () => {
            try {
                const next = await loadVisual(activeCreature.id)
                if (!active) return
                setOfficialVisual(next.official)
                setVisualProgress(next.progress)
                const wait = Math.max(
                    MINIMUM_REFRESH_DELAY_MS,
                    Date.parse(next.expiresAt) - Date.now() - REFRESH_MARGIN_MS,
                )
                refreshTimer = window.setTimeout(() => {
                    void load()
                }, wait)
            } catch {
                // The stable base asset remains the UI fallback during rollout or URL errors.
                if (active) setOfficialVisual(null)
            }
        }

        void load()

        return () => {
            active = false
            if (refreshTimer) window.clearTimeout(refreshTimer)
        }
    }, [activeCreature, profile])

    useEffect(() => {
        if (!isCreatureVisualProgressionEnabled || !stableLineages.length) {
            setLineageVisuals({})
            return
        }

        let active = true

        void Promise.all(
            stableLineages.map(async (lineage) => {
                const next = await loadVisual(lineage.creature.id)
                return [
                    lineage.id,
                    {
                        visualUrl: next.official.signedUrl,
                        visualVersionNumber: next.progress.currentVersion.versionNumber,
                        visualTrait: next.progress.currentVersion.visualTraitId,
                        currentVisualVersionId: next.progress.currentVersion.id,
                        visualHistory: next.progress.history,
                    },
                ] as const
            }),
        )
            .then((entries) => {
                if (active) setLineageVisuals(Object.fromEntries(entries))
            })
            .catch(() => {
                if (active) setLineageVisuals({})
            })

        return () => {
            active = false
        }
    }, [stableLineages, visualsRevision])

    // --- handlers --------------------------------------------------------------
    /** Called after an adoption: drops the stale URL and lets the effect above reload. */
    const onVisualChanged = useCallback(async () => {
        setOfficialVisual(null)
        setVisualsRevision((revision) => revision + 1)
        await refreshProfile()
    }, [refreshProfile])

    const selectVisualVersion = useCallback(
        async (selection: { creatureId: string; targetVersionId: string; currentVersionId: string }) => {
            await rollbackCreatureVisualVersion({
                operation: 'ROLLBACK_CREATURE_VISUAL_VERSION',
                creatureId: selection.creatureId,
                targetVersionId: selection.targetVersionId,
                expectedCurrentVisualVersionId: selection.currentVersionId,
            })
            // Only the active creature is on screen; the others reload with the revision bump.
            if (activeCreature?.id === selection.creatureId) {
                const next = await loadVisual(selection.creatureId)
                setOfficialVisual(next.official)
                setVisualProgress(next.progress)
            }
            setVisualsRevision((revision) => revision + 1)
            await refreshProfile()
        },
        [activeCreature?.id, refreshProfile],
    )

    return { officialVisual, visualProgress, lineageVisuals, onVisualChanged, selectVisualVersion }
}
