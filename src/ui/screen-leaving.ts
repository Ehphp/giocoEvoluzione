import { createContext, useContext } from 'react'

/**
 * Whether the calling subtree belongs to the screen currently animating away.
 *
 * A screen keeps rendering for one transition after it stops being current — that is what lets it
 * animate out. Almost nothing needs to know, because a transform on the layer carries the whole
 * subtree with it. The exception is anything that escapes that layer: an `Overlay` portals to the
 * document body, so no transform can reach it and it has to bow out on its own.
 *
 * Set by `ScreenTransition`, which owns both layers.
 */
export const ScreenLeavingContext = createContext(false)

export function useIsScreenLeaving(): boolean {
    return useContext(ScreenLeavingContext)
}
