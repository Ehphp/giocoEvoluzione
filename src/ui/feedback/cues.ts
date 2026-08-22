/**
 * The feedback vocabulary.
 *
 * A cue is one *event*, not one sound: the name is what call sites use, and each name owns both a
 * sound recipe and a vibration pattern so the two can never drift out of step. Adding a cue means
 * adding a row to both tables below — `cues.test.ts` fails if one is missing.
 *
 * The sounds are synthesised rather than sampled. That is a deliberate starting point, not a final
 * answer: it costs no download, needs no asset pipeline, and works offline. When authored samples
 * arrive they replace `SOUND_RECIPES` alone — the cue names are the stable contract, so nothing
 * that plays a cue has to change.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type Cue =
    /** Any ordinary press: navigating, opening a sheet, picking from a list. */
    | 'tap'
    /** Moving the selection without committing to it — the gene carousel. */
    | 'select'
    /** Leaving a screen, closing a sheet. */
    | 'back'
    /** Committing: using a gene, confirming, starting a match. */
    | 'confirm'
    /** Anything evolution: evolving a gene, choosing a draft target. */
    | 'evolve'
    /** A round resolving — the moment the two choices meet. */
    | 'impact'
    /** Winning a match. */
    | 'win'
    /** Losing a match. */
    | 'lose'
    /** A destructive control, or a refused action. */
    | 'alert'

/** One voice inside a cue: an envelope over an oscillator, optionally gliding in pitch. */
export type Tone = Readonly<{
    wave: OscillatorType
    /** Starting frequency in Hz. */
    from: number
    /** Frequency to glide to across the voice's life. Omitted holds `from`. */
    to?: number
    /** Peak gain, 0–1, before the master volume. */
    gain: number
    /** Seconds to reach peak gain. Kept short; a slow attack reads as a fade-in, not a hit. */
    attack: number
    /** Seconds from peak back to silence. */
    decay: number
    /** Seconds after the cue starts. This is how an arpeggio is spelled. */
    delay?: number
}>

/** A short burst of filtered noise. Gives an impact its body; a pure tone only ever pings. */
export type NoiseBurst = Readonly<{
    gain: number
    decay: number
    /** Low-pass cutoff in Hz. */
    cutoff: number
    delay?: number
}>

export type SoundRecipe = Readonly<{
    tones: readonly Tone[]
    noise?: NoiseBurst
}>

/** Milliseconds, or an on/off millisecond pattern, as `navigator.vibrate` takes them. */
export type HapticPattern = number | readonly number[]

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

export const SOUND_RECIPES: Readonly<Record<Cue, SoundRecipe>> = {
    // A blip, not a note. Anything longer than ~60ms starts to feel like a delay on the press.
    tap: {
        tones: [{ wave: 'triangle', from: 520, gain: .16, attack: .004, decay: .05 }],
    },

    // Quieter and higher than `tap`: it fires repeatedly while scrolling a carousel.
    select: {
        tones: [{ wave: 'sine', from: 720, gain: .1, attack: .003, decay: .035 }],
    },

    // The mirror of `confirm` — falling instead of rising.
    back: {
        tones: [{ wave: 'triangle', from: 420, to: 300, gain: .14, attack: .004, decay: .085 }],
    },

    // A rising interval. Up means yes; this is the whole reason `back` falls.
    confirm: {
        tones: [
            { wave: 'triangle', from: 620, gain: .16, attack: .004, decay: .07 },
            { wave: 'triangle', from: 880, gain: .14, attack: .004, decay: .11, delay: .055 },
        ],
    },

    // A long climb with a shimmer on top: growth, not a button press.
    evolve: {
        tones: [
            { wave: 'sine', from: 380, to: 1140, gain: .15, attack: .02, decay: .34 },
            { wave: 'triangle', from: 1560, gain: .06, attack: .05, decay: .26, delay: .1 },
        ],
    },

    // Low, short, with noise for body. This one has to land like a hit.
    impact: {
        tones: [{ wave: 'sawtooth', from: 150, to: 62, gain: .22, attack: .002, decay: .19 }],
        noise: { gain: .13, decay: .1, cutoff: 1500 },
    },

    // A major triad climbing. Deliberately the longest cue in the set.
    win: {
        tones: [
            { wave: 'triangle', from: 659, gain: .16, attack: .006, decay: .16 },
            { wave: 'triangle', from: 830, gain: .16, attack: .006, decay: .16, delay: .1 },
            { wave: 'triangle', from: 988, gain: .17, attack: .006, decay: .34, delay: .2 },
        ],
    },

    // Two sagging tones. Soft on purpose: losing already stings without the game shouting.
    lose: {
        tones: [
            { wave: 'triangle', from: 392, to: 330, gain: .14, attack: .008, decay: .18 },
            { wave: 'triangle', from: 294, to: 233, gain: .13, attack: .008, decay: .3, delay: .13 },
        ],
    },

    // Square wave: the only harsh timbre in the set, so "no" is unmistakable.
    alert: {
        tones: [
            { wave: 'square', from: 240, gain: .1, attack: .003, decay: .06 },
            { wave: 'square', from: 200, gain: .1, attack: .003, decay: .09, delay: .09 },
        ],
    },
}

/* -------------------------------------------------------------------------- */
/* Haptics                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Kept short. A long buzz reads as a malfunction, and on Android the motor takes time to spin up,
 * so anything under ~5ms is felt as nothing at all.
 */
export const HAPTIC_PATTERNS: Readonly<Record<Cue, HapticPattern>> = {
    tap: 8,
    select: 5,
    back: 8,
    confirm: 14,
    evolve: [10, 40, 10, 40, 22],
    impact: 26,
    win: [18, 60, 30],
    lose: 38,
    alert: [12, 70, 12],
}
