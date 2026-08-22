import { describe, expect, it } from 'vitest'

import { HAPTIC_PATTERNS, SOUND_RECIPES, type Cue } from './cues'

/** Every cue the vocabulary declares. Kept literal so adding a `Cue` fails here until it is wired. */
const CUES: readonly Cue[] = ['tap', 'select', 'back', 'confirm', 'evolve', 'impact', 'win', 'lose', 'alert']

describe('feedback cues', () => {
    it('gives every cue both a sound and a vibration', () => {
        expect(Object.keys(SOUND_RECIPES).sort()).toEqual([...CUES].sort())
        expect(Object.keys(HAPTIC_PATTERNS).sort()).toEqual([...CUES].sort())
    })

    it.each(CUES)('keeps %s short enough to read as feedback rather than as a wait', (cue) => {
        const recipe = SOUND_RECIPES[cue]
        const soundEnd = Math.max(...recipe.tones.map((tone) => (tone.delay ?? 0) + tone.attack + tone.decay))

        expect(soundEnd).toBeGreaterThan(0)
        // The verdict fanfares earn more room; nothing may outstay a short animation.
        expect(soundEnd).toBeLessThanOrEqual(cue === 'win' || cue === 'lose' ? .6 : .45)
    })

    it.each(CUES)('keeps %s inside the gain budget so stacked voices cannot clip', (cue) => {
        const recipe = SOUND_RECIPES[cue]
        const total = recipe.tones.reduce((sum, tone) => sum + tone.gain, 0) + (recipe.noise?.gain ?? 0)

        expect(total).toBeLessThanOrEqual(1)
    })

    it.each(CUES)('keeps the %s vibration brief — a long buzz reads as a fault', (cue) => {
        const pattern = HAPTIC_PATTERNS[cue]
        const durations = Array.isArray(pattern) ? pattern : [pattern as number]

        for (const duration of durations) {
            expect(duration).toBeGreaterThanOrEqual(5)
            expect(duration).toBeLessThanOrEqual(80)
        }
    })

    it('rises to confirm and falls to go back, because that pairing is the whole convention', () => {
        const confirmTones = SOUND_RECIPES.confirm.tones
        const back = SOUND_RECIPES.back.tones[0]!

        expect(confirmTones[1]!.from).toBeGreaterThan(confirmTones[0]!.from)
        expect(back.to).toBeLessThan(back.from)
    })
})
