import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SOUND_RECIPES } from './cues'
import { isFeedbackEnabled, playCue, resetFeedbackForTests, setFeedbackEnabled } from './feedback'
import { isHapticsSupported, playHaptic } from './haptics'
import { resetSoundForTests, scheduleRecipe } from './sound'

/**
 * A stub Web Audio graph. jsdom has none, which is itself the first thing worth asserting: the app
 * must stay silent rather than throw where audio is unavailable.
 */
function stubAudioContext() {
    const started: number[] = []
    const stopped: number[] = []
    const ramps: Array<{ value: number; time: number }> = []

    const param = () => ({
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn((value: number, time: number) => ramps.push({ value, time })),
        exponentialRampToValueAtTime: vi.fn((value: number, time: number) => ramps.push({ value, time })),
        value: 0,
    })

    const context = {
        currentTime: 0,
        sampleRate: 48_000,
        state: 'running' as AudioContextState,
        destination: {},
        createGain: vi.fn(() => ({ gain: param(), connect: vi.fn() })),
        createOscillator: vi.fn(() => ({
            type: 'sine' as OscillatorType,
            frequency: param(),
            connect: vi.fn(),
            start: vi.fn((time: number) => started.push(time)),
            stop: vi.fn((time: number) => stopped.push(time)),
        })),
        createBiquadFilter: vi.fn(() => ({ type: 'lowpass', frequency: param(), connect: vi.fn() })),
        createBufferSource: vi.fn(() => ({
            buffer: null,
            connect: vi.fn(),
            start: vi.fn((time: number) => started.push(time)),
            stop: vi.fn((time: number) => stopped.push(time)),
        })),
        createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(64) })),
        resume: vi.fn(() => Promise.resolve()),
    }

    return { context, started, stopped, ramps }
}

/**
 * jsdom 29 hands back `undefined` from its own `localStorage` getter, so the test supplies storage
 * rather than relying on the environment. That is not only a workaround: the app has to survive
 * storage being absent — private mode does the same thing — and this keeps both paths visible.
 */
function stubLocalStorage() {
    const entries = new Map<string, string>()

    vi.stubGlobal('localStorage', {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => entries.set(key, value),
        removeItem: (key: string) => entries.delete(key),
        clear: () => entries.clear(),
    })

    return entries
}

describe('feedback', () => {
    beforeEach(() => {
        resetFeedbackForTests()
        resetSoundForTests()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('is on by default and remembers being switched off', () => {
        const entries = stubLocalStorage()
        resetFeedbackForTests()

        expect(isFeedbackEnabled()).toBe(true)

        setFeedbackEnabled(false)

        expect(isFeedbackEnabled()).toBe(false)
        expect(entries.get('evori-feedback-enabled')).toBe('false')

        resetFeedbackForTests()

        expect(isFeedbackEnabled()).toBe(false)
    })

    it('works with no storage at all — the preference just does not survive a reload', () => {
        // No stub here: jsdom has no reachable localStorage, which is also private mode's behaviour.
        expect(() => resetFeedbackForTests()).not.toThrow()
        expect(isFeedbackEnabled()).toBe(true)
        expect(() => setFeedbackEnabled(false)).not.toThrow()
        expect(isFeedbackEnabled()).toBe(false)
    })

    it('stays silent where the browser has no audio and no vibration', () => {
        // jsdom: no AudioContext, no navigator.vibrate. Nothing here may throw.
        expect(isHapticsSupported()).toBe(false)
        expect(() => playCue('confirm')).not.toThrow()
        expect(() => playHaptic('impact')).not.toThrow()
    })

    it('never builds an AudioContext until a cue actually plays', () => {
        const construct = vi.fn()
        vi.stubGlobal('AudioContext', class {
            constructor() {
                construct()
            }
        })

        // Importing and toggling the preference must not touch audio: a context created outside a
        // user gesture is left suspended forever on iOS.
        setFeedbackEnabled(true)

        expect(construct).not.toHaveBeenCalled()
    })

    it('vibrates with the cue pattern, and not at all once switched off', () => {
        const vibrate = vi.fn(() => true)
        vi.stubGlobal('navigator', { ...navigator, vibrate })

        playCue('tap')
        expect(vibrate).toHaveBeenCalledWith(8)

        playCue('alert')
        expect(vibrate).toHaveBeenLastCalledWith([12, 70, 12])

        vibrate.mockClear()
        setFeedbackEnabled(false)
        playCue('tap')

        expect(vibrate).not.toHaveBeenCalled()
    })

    it('resumes a suspended context instead of giving up on it', () => {
        const { context } = stubAudioContext()
        context.state = 'suspended'
        vi.stubGlobal('AudioContext', function AudioContextStub() {
            return context
        })

        playCue('tap')

        // iOS suspends the context on every backgrounding, so this is not only a first-run path.
        expect(context.resume).toHaveBeenCalled()
    })

    it('schedules one oscillator per tone, in the order the recipe spells out', () => {
        const { context, started, stopped } = stubAudioContext()
        const bus = context.createGain()

        scheduleRecipe(context as unknown as AudioContext, bus as unknown as GainNode, SOUND_RECIPES.win, 0)

        expect(context.createOscillator).toHaveBeenCalledTimes(SOUND_RECIPES.win.tones.length)
        expect(started).toEqual([0, .1, .2])
        // Each voice outlives its envelope slightly, so the tail cannot click.
        for (const [index, stop] of stopped.entries()) {
            expect(stop).toBeGreaterThan(started[index]!)
        }
    })

    it('adds a noise burst only where the recipe asks for one', () => {
        const withNoise = stubAudioContext()
        scheduleRecipe(
            withNoise.context as unknown as AudioContext,
            withNoise.context.createGain() as unknown as GainNode,
            SOUND_RECIPES.impact,
            0,
        )

        expect(withNoise.context.createBufferSource).toHaveBeenCalledTimes(1)
        expect(withNoise.context.createBiquadFilter).toHaveBeenCalledTimes(1)

        const withoutNoise = stubAudioContext()
        scheduleRecipe(
            withoutNoise.context as unknown as AudioContext,
            withoutNoise.context.createGain() as unknown as GainNode,
            SOUND_RECIPES.tap,
            0,
        )

        expect(withoutNoise.context.createBufferSource).not.toHaveBeenCalled()
    })
})
