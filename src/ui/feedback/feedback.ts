import type { Cue } from './cues'
import { playHaptic } from './haptics'
import { playSound } from './sound'

/**
 * The one entry point for feedback: `playCue('confirm')` and both the sound and the vibration follow.
 *
 * One preference governs both. Sound and vibration are arguably separate wants — muting in public
 * does not mean giving up the buzz — but two switches need two places to put them, and there is one
 * slot in the profile header today. Splitting them means splitting `isEnabled` below; nothing else
 * in the app reads it directly.
 */

const STORAGE_KEY = 'evori-feedback-enabled'

/** On by default: this is a game. Nothing ever plays unprompted — every cue answers a player action. */
const DEFAULT_ENABLED = true

type Listener = () => void

const listeners = new Set<Listener>()
let enabled = readStoredPreference()

function readStoredPreference(): boolean {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)

        return stored === null ? DEFAULT_ENABLED : stored === 'true'
    } catch {
        // Private mode, or storage disabled. The preference just does not persist.
        return DEFAULT_ENABLED
    }
}

export function isFeedbackEnabled(): boolean {
    return enabled
}

export function setFeedbackEnabled(next: boolean): void {
    if (next === enabled) return

    enabled = next

    try {
        localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
        // Not persisting is survivable; the toggle still works for this session.
    }

    for (const listener of listeners) {
        listener()
    }
}

/** Subscribes to preference changes. Shaped for `useSyncExternalStore`. */
export function subscribeToFeedback(listener: Listener): () => void {
    listeners.add(listener)

    return () => {
        listeners.delete(listener)
    }
}

/** Plays a cue's sound and vibration together, unless the player has switched feedback off. */
export function playCue(cue: Cue): void {
    if (!enabled) return

    playSound(cue)
    playHaptic(cue)
}

/** Restores module state between tests. */
export function resetFeedbackForTests(): void {
    listeners.clear()
    enabled = readStoredPreference()
}
