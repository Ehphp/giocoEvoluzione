import { HAPTIC_PATTERNS, type Cue } from './cues'

/**
 * Vibration for the cue vocabulary.
 *
 * **iOS Safari does not implement `navigator.vibrate`, and will not.** Haptics there need the native
 * layer — a Capacitor `Haptics` call once the app is wrapped for the stores. So this module is a
 * no-op on roughly half the target audience, by design: it is the web half of one capability, and
 * the swap point is `vibrate` below rather than every call site.
 */

type Vibrator = { vibrate: (pattern: number | number[]) => boolean }

function vibrator(): Vibrator | null {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return null

    return navigator as Vibrator
}

/** True where the browser can vibrate at all. Chrome/Android yes, iOS Safari no. */
export function isHapticsSupported(): boolean {
    return vibrator() !== null
}

/** Fires a cue's pattern, or does nothing where vibration is unavailable. Never throws. */
export function playHaptic(cue: Cue): void {
    const target = vibrator()

    if (!target) return

    const pattern = HAPTIC_PATTERNS[cue]

    try {
        target.vibrate(Array.isArray(pattern) ? [...pattern] : (pattern as number))
    } catch {
        // Some browsers refuse without a prior user gesture, or while the page is hidden.
    }
}
