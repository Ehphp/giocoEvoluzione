import { useCallback, useEffect, useState } from 'react'

import {
    fetchMatchReward,
    fetchProfileMatchHistory,
    type MatchRewardRecord,
    type ProfileMatchHistoryItem,
} from '../lib/profile-api'

/**
 * The reward row is written by the match-completion trigger, so it can lag the snapshot reaching
 * FINISHED. Poll briefly rather than showing an empty result screen.
 */
const REWARD_POLL_ATTEMPTS = 5
const REWARD_POLL_INTERVAL_MS = 250

/**
 * Owns the read-only profile data the shell displays: the match history behind the profile screen
 * and the reward earned by a finished match. Neither drives gameplay, so a failure here degrades
 * to an error message rather than blocking the player.
 */
export function useProfileActivity(input: {
    profileId: string | undefined
    isProfileScreenOpen: boolean
    finishedGameId: string | undefined
    refreshProfile: () => Promise<void>
}) {
    // --- state -----------------------------------------------------------------
    const [history, setHistory] = useState<ProfileMatchHistoryItem[]>([])
    const [isLoadingHistory, setIsLoadingHistory] = useState(false)
    const [historyError, setHistoryError] = useState<string | null>(null)
    const [matchReward, setMatchReward] = useState<MatchRewardRecord | null>(null)

    const { profileId, isProfileScreenOpen, finishedGameId, refreshProfile } = input

    // --- effects ---------------------------------------------------------------
    useEffect(() => {
        if (!isProfileScreenOpen || !profileId) return

        let active = true
        setIsLoadingHistory(true)
        setHistoryError(null)

        void fetchProfileMatchHistory(profileId, null)
            .then((nextHistory) => {
                if (active) setHistory(nextHistory)
            })
            .catch((error) => {
                if (active) {
                    setHistoryError(error instanceof Error ? error.message : 'Impossibile caricare la cronologia.')
                }
            })
            .finally(() => {
                if (active) setIsLoadingHistory(false)
            })

        return () => {
            active = false
        }
    }, [isProfileScreenOpen, profileId])

    useEffect(() => {
        if (!finishedGameId || !profileId) {
            setMatchReward(null)
            return
        }

        let active = true
        setMatchReward(null)

        void (async () => {
            for (let attempt = 0; attempt < REWARD_POLL_ATTEMPTS; attempt += 1) {
                try {
                    const reward = await fetchMatchReward(finishedGameId, profileId)

                    if (reward) {
                        if (active) {
                            setMatchReward(reward)
                            await refreshProfile()
                        }

                        return
                    }
                } catch {
                    return
                }

                await new Promise((resolve) => window.setTimeout(resolve, REWARD_POLL_INTERVAL_MS))
            }
        })()

        return () => {
            active = false
        }
    }, [finishedGameId, profileId, refreshProfile])

    // --- handlers --------------------------------------------------------------
    /** Logging out must not leave the previous account's history or reward on screen. */
    const reset = useCallback(() => {
        setHistory([])
        setMatchReward(null)
    }, [])

    return { history, isLoadingHistory, historyError, matchReward, reset }
}
