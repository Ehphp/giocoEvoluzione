import { describe, expect, it } from 'vitest'

import { SCREEN_DEPTH, moveBetweenScreens, type ScreenId } from './screen-depth'

/**
 * Every screen change the app can actually perform, and the move the player should see.
 *
 * This is the real check on the depth table. Depths read plausibly on their own and still send a
 * route the wrong way: the result screen was one level deeper than the battle, which made perfect
 * sense as a stack and turned "nuova partita" into a backwards pop, because a rematch restarts from
 * the result screen without passing through the home screen.
 */
const NAVIGATION: ReadonlyArray<readonly [ScreenId, ScreenId, 'push' | 'pop' | 'fade', string]> = [
    // Getting into the app.
    ['boot', 'auth', 'fade', 'no session yet'],
    ['boot', 'home', 'fade', 'session restored'],
    ['auth', 'home', 'fade', 'signed in'],

    // The dock. Every one of these must cross-fade, or the dock slides with the content.
    ['home', 'collection', 'fade', 'dock'],
    ['home', 'profile', 'fade', 'dock'],
    ['home', 'ranking', 'fade', 'dock'],
    ['collection', 'home', 'fade', 'dock'],
    ['collection', 'profile', 'fade', 'dock'],
    ['collection', 'ranking', 'fade', 'dock'],
    ['profile', 'home', 'fade', 'dock'],
    ['profile', 'collection', 'fade', 'dock'],
    ['profile', 'ranking', 'fade', 'dock'],
    ['ranking', 'home', 'fade', 'dock'],
    ['ranking', 'collection', 'fade', 'dock'],
    ['ranking', 'profile', 'fade', 'dock'],

    // Drilling into a lineage, and coming back out.
    ['collection', 'creature-evolution', 'push', 'opened a lineage'],
    ['profile', 'creature-evolution', 'push', 'opened the active lineage'],
    ['creature-evolution', 'home', 'pop', 'left the evolution screen'],

    // Into a match.
    ['home', 'waiting', 'push', 'created a PvP room'],
    ['home', 'battle', 'push', 'started a bot match'],
    ['waiting', 'battle', 'push', 'opponent joined'],
    ['waiting', 'home', 'pop', 'left the room'],

    // Finishing one.
    ['battle', 'result', 'fade', 'the duel resolving, not a deeper place'],
    ['battle', 'home', 'pop', 'abandoned the match'],
    ['result', 'home', 'pop', 'left the match'],
    ['result', 'battle', 'fade', 'rematch: must not read as going back'],
    ['result', 'waiting', 'pop', 'PvP rematch returns to the room'],
]

describe('screen depth', () => {
    it.each(NAVIGATION)('%s -> %s is a %s (%s)', (from, to, expected) => {
        expect(moveBetweenScreens(from, to)).toBe(expected)
    })

    it('keeps every dock destination on one level, so the dock never travels', () => {
        const dockDestinations: ScreenId[] = ['home', 'collection', 'profile', 'ranking']
        const depths = new Set(dockDestinations.map((screen) => SCREEN_DEPTH[screen]))

        expect(depths.size).toBe(1)
    })

    it('never pops on the way into a match', () => {
        const entering: ReadonlyArray<readonly [ScreenId, ScreenId]> = [
            ['home', 'waiting'],
            ['home', 'battle'],
            ['waiting', 'battle'],
            ['result', 'battle'],
        ]

        for (const [from, to] of entering) {
            expect(moveBetweenScreens(from, to), `${from} -> ${to}`).not.toBe('pop')
        }
    })
})
