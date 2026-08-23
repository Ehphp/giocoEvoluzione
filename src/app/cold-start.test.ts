import { describe, expect, it } from 'vitest'

import { isColdStart } from './cold-start'

describe('cold start', () => {
    it('boots while the stored session is still being restored', () => {
        expect(isColdStart({ isRestoringSession: true, authStatus: 'ready', hasProfile: true })).toBe(true)
    })

    it('boots before authentication has resolved', () => {
        expect(isColdStart({ isRestoringSession: false, authStatus: 'loading', hasProfile: false })).toBe(true)
    })

    it('boots while the first profile is being built', () => {
        expect(isColdStart({ isRestoringSession: false, authStatus: 'initializing', hasProfile: false })).toBe(true)
    })

    it('does NOT boot when a profile refresh re-enters initializing', () => {
        /*
         * The regression this exists for. `refreshProfile` runs the same code path as a cold start,
         * and it fires after a finished match to collect the reward, and on every lineage change. When
         * this returned true the live screen was torn down to a spinner and pushed back: the player
         * watched the result screen arrive, pop away and return, three transitions inside a second.
         */
        expect(isColdStart({ isRestoringSession: false, authStatus: 'initializing', hasProfile: true })).toBe(false)
    })

    it('does not boot once everything has resolved, or when there is no session at all', () => {
        expect(isColdStart({ isRestoringSession: false, authStatus: 'ready', hasProfile: true })).toBe(false)
        expect(isColdStart({ isRestoringSession: false, authStatus: 'unauthenticated', hasProfile: false })).toBe(false)
        expect(isColdStart({ isRestoringSession: false, authStatus: 'error', hasProfile: false })).toBe(false)
    })
})
