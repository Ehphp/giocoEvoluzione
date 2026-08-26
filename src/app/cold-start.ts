import type { AuthenticationStatus } from '../auth/AuthProvider'

/**
 * Whether the app has nothing to show yet, and so belongs on the boot screen.
 *
 * The distinction this draws is not cosmetic. `refreshProfile` re-enters `initializing` — it is the
 * same code path as a cold start — and it is called after a finished match to collect the reward,
 * and again whenever a lineage is created, deleted or made active. Treating that as a boot tears the
 * live screen down to a spinner and back: at the end of a match the player saw the result screen
 * arrive, pop away to a spinner, and push back in, three transitions inside a second.
 *
 * A refresh keeps the profile it already resolved, so the profile is what separates the two: no
 * profile means there is genuinely nothing to render, and anything else is background work that the
 * screen on show must survive.
 */
export function isColdStart(input: {
    /** The match session's own first-load flag: restoring a stored session. */
    isRestoringSession: boolean
    authStatus: AuthenticationStatus
    hasProfile: boolean
}): boolean {
    if (input.isRestoringSession) return true
    if (input.authStatus === 'loading') return true

    return input.authStatus === 'initializing' && !input.hasProfile
}

/**
 * Whether the app must replace its current screen with authentication.
 *
 * A profile refresh deliberately re-enters `initializing`, but retains the previous profile and
 * creature until the replacement arrives. That is background work, not a sign-out: replacing the
 * current screen with the login form would unmount it and make the refresh look like a redirect.
 */
export function shouldShowAuthScreen(input: {
    hasActiveMatch: boolean
    authStatus: AuthenticationStatus
    hasProfile: boolean
    hasActiveCreature: boolean
}): boolean {
    if (input.hasActiveMatch) return false
    if (!input.hasProfile || !input.hasActiveCreature) return true

    return input.authStatus === 'unauthenticated' || input.authStatus === 'error'
}
