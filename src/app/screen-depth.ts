import { moveBetweenDepths, type ScreenMove } from '../ui/screen-move'

/**
 * How deep each screen sits in navigation, which is what picks its transition — see
 * `ScreenTransition`. Deeper than the screen it replaces pushes, shallower pops, equal cross-fades.
 *
 * Everything reachable from the dock shares depth 1: those are siblings, and a cross-fade is what
 * keeps the dock from sliding along with the content under it. Drilling into a lineage is one level
 * deeper, and each step into a match deeper again, so entering a battle pushes forward and leaving
 * it pops back the way it came.
 *
 * Adding a screen means adding it here. Two screens at the same depth is a statement that the
 * player moves sideways between them, not into one from the other.
 */
export const SCREEN_DEPTH = {
    boot: 1,
    'missing-config': 1,
    auth: 1,
    home: 1,
    collection: 1,
    profile: 1,
    ranking: 1,
    'creature-evolution': 2,
    waiting: 2,
    battle: 3,
    /*
     * Same depth as the battle, not deeper. The result is the duel resolving, not a further place
     * inside it — and "nuova partita" restarts from here without passing through the home screen
     * (`newMatch` calls `startNewGame` directly), so a deeper result would make a rematch pop
     * backwards. Level with the battle it cross-fades instead, and leaving for the home screen or
     * back to a PvP waiting room still pops, which is what those two actually are.
     */
    result: 3,
    'missing-result': 3,
} as const

export type ScreenId = keyof typeof SCREEN_DEPTH

/**
 * The move the player will see going from one screen to another.
 *
 * Exposed so the navigation paths that actually exist can be asserted rather than assumed: a depth
 * table reads plausibly and still gets a route backwards, which is exactly what happened to the
 * result screen.
 */
export function moveBetweenScreens(from: ScreenId, to: ScreenId): ScreenMove {
    return moveBetweenDepths(SCREEN_DEPTH[from], SCREEN_DEPTH[to])
}
