import { useCallback, useEffect, useState } from 'react'

export type EvolutionRouteTarget = Readonly<{ lineageId: string; creatureId: string }>

/** The screens the app shell can show outside a running match. */
export type CurrentScreen = 'home' | 'collection' | 'profile' | 'ranking' | 'creature-evolution'

const CREATURE_VISUAL_PROGRESSION_HASH = '#creature-evolution'

export const isCreatureVisualProgressionEnabled =
    import.meta.env.VITE_CREATURE_VISUAL_PROGRESSION_ENABLED === 'true'

function evolutionTargetFromHash(): EvolutionRouteTarget | null {
    if (!window.location.hash.startsWith(CREATURE_VISUAL_PROGRESSION_HASH)) return null
    const query = window.location.hash.slice(CREATURE_VISUAL_PROGRESSION_HASH.length)
    const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : '')
    const lineageId = params.get('lineageId')?.trim()
    const creatureId = params.get('creatureId')?.trim()
    return lineageId && creatureId ? { lineageId, creatureId } : null
}

function creatureEvolutionHash(target: EvolutionRouteTarget): string {
    return `${CREATURE_VISUAL_PROGRESSION_HASH}?${new URLSearchParams(target).toString()}`
}

function initialScreen(): CurrentScreen {
    if (isCreatureVisualProgressionEnabled && evolutionTargetFromHash()) return 'creature-evolution'
    return 'home'
}

/**
 * Owns which screen the shell shows and the `#creature-evolution` hash that addresses a lineage.
 *
 * The evolution screen is the only deep-linkable one, so the hash is the single source of truth
 * for it: a reload or a pasted link lands on the same creature. Everything else is in-memory
 * navigation.
 */
export function useEvolutionRoute() {
    // --- state -----------------------------------------------------------------
    const [currentScreen, setCurrentScreen] = useState<CurrentScreen>(initialScreen)
    const [evolutionTarget, setEvolutionTarget] = useState<EvolutionRouteTarget | null>(evolutionTargetFromHash)

    // --- effects ---------------------------------------------------------------
    useEffect(() => {
        if (!isCreatureVisualProgressionEnabled) return

        const syncTechnicalRoute = () => {
            const target = evolutionTargetFromHash()

            if (target) {
                setEvolutionTarget(target)
                setCurrentScreen('creature-evolution')
                return
            }

            setEvolutionTarget(null)
            setCurrentScreen('home')
        }

        window.addEventListener('hashchange', syncTechnicalRoute)
        return () => window.removeEventListener('hashchange', syncTechnicalRoute)
    }, [])

    // --- handlers --------------------------------------------------------------
    const openEvolution = useCallback((target: EvolutionRouteTarget) => {
        if (!isCreatureVisualProgressionEnabled) return
        setEvolutionTarget(target)
        window.location.hash = creatureEvolutionHash(target)
        setCurrentScreen('creature-evolution')
    }, [])

    /** Drops the hash so a reload does not re-enter the screen the player just left. */
    const leaveEvolution = useCallback(() => {
        if (window.location.hash.startsWith(CREATURE_VISUAL_PROGRESSION_HASH)) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }
        setEvolutionTarget(null)
        setCurrentScreen('home')
    }, [])

    return { currentScreen, setCurrentScreen, evolutionTarget, openEvolution, leaveEvolution }
}
