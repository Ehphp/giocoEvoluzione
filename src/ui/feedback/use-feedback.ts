import { useCallback, useSyncExternalStore } from 'react'

import { isFeedbackEnabled, setFeedbackEnabled, subscribeToFeedback } from './feedback'

/**
 * Reads and flips the feedback preference.
 *
 * The preference lives outside React because cues fire from primitives that have no business
 * subscribing to anything — see `feedback.ts`. This hook exists only for the control that toggles it.
 */
export function useFeedbackPreference() {
    const isEnabled = useSyncExternalStore(subscribeToFeedback, isFeedbackEnabled, () => true)

    const toggle = useCallback(() => {
        setFeedbackEnabled(!isFeedbackEnabled())
    }, [])

    return { isEnabled, toggle }
}
