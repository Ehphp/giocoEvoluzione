import type { DockTab } from '../ui/Dock'
import type { ScreenId } from './screen-depth'

/**
 * Where the dock shows, and which slot it lights up there.
 *
 * A screen listed here shows the dock; one that is absent does not. `null` means "shows it, lights
 * nothing" — that is a screen you are *inside* rather than one of the destinations, so every slot
 * stays live and the pill has nowhere to sit. It is also why a sub-route needs no back button: the
 * dock is a way out to anywhere, which beats a way back to one place.
 *
 * The match is the exception that keeps its own exits. Tapping "Classifica" from a lobby or a live
 * round would strand a game the other player is still sitting in, so those screens ask first
 * through their own control. So does the sign-in flow, which has nowhere to navigate to yet.
 *
 * The dock is rendered once above the whole app rather than by each screen: it is the one piece of
 * chrome that outlives a navigation, which is what lets its active pill travel between slots instead
 * of re-appearing already arrived on a freshly mounted bar. This table is what tells it where to go,
 * and it lives here so the app and the preview route can agree on it.
 */
const DOCK_SLOT: Partial<Record<ScreenId, DockTab | null>> = {
    home: 'battle',
    collection: 'collection',
    ranking: 'ranking',
    profile: 'profile',
    'creature-evolution': null,
}

export type DockPlacement = { isShown: boolean; active: DockTab | null }

export function getDockPlacement(screen: ScreenId): DockPlacement {
    // `in`, not a truthiness check on the value: `null` is a listed screen, just not an active slot.
    return { isShown: screen in DOCK_SLOT, active: DOCK_SLOT[screen] ?? null }
}
