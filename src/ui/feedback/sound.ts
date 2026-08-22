import { SOUND_RECIPES, type Cue, type NoiseBurst, type SoundRecipe, type Tone } from './cues'

/**
 * Synthesises the cue sounds through Web Audio.
 *
 * Two rules shape this file.
 *
 * **Nothing is created until a cue actually plays.** Constructing an `AudioContext` at import time
 * earns a console warning on Chrome and a permanently suspended context on iOS, which is worse than
 * no sound: it fails silently forever. The context is built on the first `playSound`, which always
 * happens inside a user gesture because every cue is a response to something the player did.
 *
 * **Silence is an acceptable outcome.** No Web Audio, a refused resume, a browser that throttled the
 * context — none of these are errors worth surfacing. A game that cannot make a noise still plays.
 */

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

/** Headroom under 1.0 so stacked voices cannot clip. */
const MASTER_VOLUME = .5

/** Length of the noise buffer, in seconds. Longer than any burst that reads from it. */
const NOISE_BUFFER_SECONDS = .4

/* -------------------------------------------------------------------------- */
/* Module state                                                                */
/* -------------------------------------------------------------------------- */

let context: AudioContext | null = null
let master: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null
/** Set once the environment has proved it cannot do this, so we stop retrying every press. */
let isUnavailable = false

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function audioContextConstructor(): typeof AudioContext | null {
    if (typeof window === 'undefined') return null

    const candidate = window.AudioContext
        ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    return candidate ?? null
}

/** Builds the context and master bus on first use, or returns null if this environment cannot. */
function ensureContext(): AudioContext | null {
    if (isUnavailable) return null
    if (context) return context

    const Constructor = audioContextConstructor()

    if (!Constructor) {
        isUnavailable = true
        return null
    }

    try {
        context = new Constructor()
        master = context.createGain()
        master.gain.value = MASTER_VOLUME
        master.connect(context.destination)
    } catch {
        isUnavailable = true
        context = null
        master = null
    }

    return context
}

/** White noise, generated once and reused. Every burst is a window onto this same buffer. */
function ensureNoiseBuffer(target: AudioContext): AudioBuffer {
    if (noiseBuffer) return noiseBuffer

    const length = Math.floor(target.sampleRate * NOISE_BUFFER_SECONDS)
    const buffer = target.createBuffer(1, length, target.sampleRate)
    const samples = buffer.getChannelData(0)

    for (let index = 0; index < length; index += 1) {
        samples[index] = Math.random() * 2 - 1
    }

    noiseBuffer = buffer

    return buffer
}

function scheduleTone(target: AudioContext, bus: GainNode, tone: Tone, startTime: number): void {
    const start = startTime + (tone.delay ?? 0)
    const peak = start + tone.attack
    const end = peak + tone.decay

    const oscillator = target.createOscillator()
    oscillator.type = tone.wave
    oscillator.frequency.setValueAtTime(tone.from, start)

    if (tone.to !== undefined) {
        // Exponential, because pitch is perceived logarithmically: a linear ramp sounds like it
        // rushes the start and crawls the end.
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(tone.to, 1), end)
    }

    const envelope = target.createGain()
    // Ramps start from a real value, not 0: exponential ramps cannot leave zero, and a linear
    // attack into an exponential decay is what keeps the tail from clicking.
    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.linearRampToValueAtTime(tone.gain, peak)
    envelope.gain.exponentialRampToValueAtTime(0.0001, end)

    oscillator.connect(envelope)
    envelope.connect(bus)
    oscillator.start(start)
    oscillator.stop(end + .02)
}

function scheduleNoise(target: AudioContext, bus: GainNode, burst: NoiseBurst, startTime: number): void {
    const start = startTime + (burst.delay ?? 0)
    const end = start + burst.decay

    const source = target.createBufferSource()
    source.buffer = ensureNoiseBuffer(target)

    const filter = target.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(burst.cutoff, start)

    const envelope = target.createGain()
    envelope.gain.setValueAtTime(burst.gain, start)
    envelope.gain.exponentialRampToValueAtTime(0.0001, end)

    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(bus)
    source.start(start)
    source.stop(end + .02)
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Lays a recipe onto an audio graph. Exported for tests: it is the whole synthesis decision, and it
 * is worth asserting against a stub context rather than trusting it by ear alone.
 */
export function scheduleRecipe(target: AudioContext, bus: GainNode, recipe: SoundRecipe, startTime: number): void {
    for (const tone of recipe.tones) {
        scheduleTone(target, bus, tone, startTime)
    }

    if (recipe.noise) {
        scheduleNoise(target, bus, recipe.noise, startTime)
    }
}

/** Plays a cue, or does nothing at all if this environment cannot. Never throws. */
export function playSound(cue: Cue): void {
    const target = ensureContext()

    if (!target || !master) return

    // iOS suspends the context whenever the app is backgrounded, so this is not only a first-run
    // concern. `resume` is a promise we deliberately do not await: the cue belongs to a press that
    // already happened, and a late sound is worse than a missing one.
    if (target.state === 'suspended') {
        void target.resume().catch(() => undefined)
    }

    try {
        scheduleRecipe(target, master, SOUND_RECIPES[cue], target.currentTime)
    } catch {
        // A throttled or closed context. Leave it: the next press will build a fresh one.
    }
}

/** Drops the audio graph. Only for tests — the app holds one context for its whole life. */
export function resetSoundForTests(): void {
    context = null
    master = null
    noiseBuffer = null
    isUnavailable = false
}
