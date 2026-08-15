import { useEffect, useRef, useState } from 'react'

import type { GameSnapshot, PlayerRecord } from '../../../lib/game-api'
import { getGameCreatureVisuals } from '../../../lib/creature-transformations-api'
import { withResolvedCreatureImage } from '../../../ui/assets'
import { buildBattleParticipants } from './battleParticipants'

export type GameCreatureVisual = Readonly<{
    signedUrl: string
    expiresAt: string
    versionNumber: number
    versionId: string
    visualTraitId?: string | null
    isBaseVersion?: boolean
}>

export type GameVisualLoadStatus = 'loading' | 'ready' | 'unavailable' | 'error'

export type GameVisualSide = Readonly<{
    status: GameVisualLoadStatus
    visual: GameCreatureVisual | null
}>

export type GameCreatureVisualResource = Readonly<{
    fingerprint: string | null
    status: GameVisualLoadStatus
    player: GameVisualSide
    opponent: GameVisualSide
}>

type GameVisualResponse = Readonly<{
    player: GameCreatureVisual
    opponent: GameCreatureVisual | null
}>

type GameVisualLoader = (input: { gameId: string }) => Promise<GameVisualResponse>
type ImagePreloader = (signedUrl: string) => Promise<void>

export type GameVisualParticipants = Readonly<{
    gameId: string | null
    localPlayer: PlayerRecord | null
    remotePlayer: PlayerRecord | null
    fingerprint: string | null
}>

const unavailableSide: GameVisualSide = { status: 'unavailable', visual: null }
const loadingSide: GameVisualSide = { status: 'loading', visual: null }

function fingerprintPart(value: string | null | undefined) {
    return encodeURIComponent(value ?? '')
}

/**
 * The visual resource is keyed by participant identity, not just game identity.
 * Slot never appears here: local/remote comes exclusively from snapshot.me.
 */
export function getGameVisualParticipants(snapshot: GameSnapshot | null | undefined): GameVisualParticipants {
    const gameId = snapshot?.game.id ?? null
    const { localPlayer, remotePlayer } = buildBattleParticipants(snapshot?.players ?? [], snapshot?.me?.id)

    return {
        gameId,
        localPlayer,
        remotePlayer,
        fingerprint: gameId && localPlayer
            ? [
                fingerprintPart(gameId),
                fingerprintPart(localPlayer.id),
                fingerprintPart(localPlayer.creature_id),
                fingerprintPart(remotePlayer?.id),
                fingerprintPart(remotePlayer?.creature_id),
            ].join('|')
            : null,
    }
}

function defaultLoadVisuals({ gameId }: { gameId: string }): Promise<GameVisualResponse> {
    return getGameCreatureVisuals({ operation: 'GET_GAME_VISUALS', gameId })
}

async function defaultPreloadImage(signedUrl: string): Promise<void> {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Impossibile precaricare il visual della creatura.'))
        image.src = signedUrl
    })

    // decode avoids declaring the resource ready before the browser can render it.
    // Older browsers can load the image without supporting decode().
    if (typeof image.decode === 'function') await image.decode()
}

function statusFromSides(player: GameVisualSide, opponent: GameVisualSide): GameVisualLoadStatus {
    if (player.status === 'error' || opponent.status === 'error') return 'error'
    if (player.status === 'loading' || opponent.status === 'loading') return 'loading'
    if (player.status === 'unavailable' || opponent.status === 'unavailable') return 'unavailable'
    return 'ready'
}

function errorSide(previous: GameVisualSide): GameVisualSide {
    return { status: 'error', visual: previous.visual }
}

function preloadedSide(visual: GameCreatureVisual | null, result: PromiseSettledResult<void>): GameVisualSide {
    if (!visual) return unavailableSide
    return result.status === 'fulfilled'
        ? { status: 'ready', visual }
        : { status: 'error', visual: null }
}

function visualExpiryDelay(visuals: GameVisualResponse): number | null {
    const expiry = [visuals.player.expiresAt, visuals.opponent?.expiresAt]
        .filter((value): value is string => Boolean(value))
        .map((value) => Date.parse(value))
        .filter(Number.isFinite)
    if (!expiry.length) return null

    const delay = Math.min(...expiry) - Date.now() - 30_000
    return delay > 0 ? delay : null
}

function devLog(event: 'start' | 'success' | 'error' | 'ignored-stale', input: {
    fingerprint: string
    sequence: number
    participants: GameVisualParticipants
    playerSignedUrlPresent?: boolean
    opponentSignedUrlPresent?: boolean
    reason: 'initial' | 'participants-changed' | 'profile-refreshed' | 'signed-url-refresh'
}) {
    if (!import.meta.env.DEV) return
    console.debug('[game-creature-visuals]', {
        event,
        fingerprint: input.fingerprint,
        sequence: input.sequence,
        gameId: input.participants.gameId,
        localPlayerId: input.participants.localPlayer?.id ?? null,
        remotePlayerId: input.participants.remotePlayer?.id ?? null,
        localCreatureId: input.participants.localPlayer?.creature_id ?? null,
        remoteCreatureId: input.participants.remotePlayer?.creature_id ?? null,
        playerSignedUrlPresent: input.playerSignedUrlPresent,
        opponentSignedUrlPresent: input.opponentSignedUrlPresent,
        reason: input.reason,
    })
}

export function useGameCreatureVisualResource(input: {
    enabled: boolean
    snapshot: GameSnapshot | null | undefined
    refreshKey?: unknown
    loadVisuals?: GameVisualLoader
    preloadImage?: ImagePreloader
}) {
    const nextParticipants = getGameVisualParticipants(input.snapshot)
    // Snapshot revisions happen for every round action. Keep the resource stable
    // unless a visual-relevant participant identity actually changes.
    const participantsRef = useRef(nextParticipants)
    if (participantsRef.current.gameId !== nextParticipants.gameId || participantsRef.current.fingerprint !== nextParticipants.fingerprint) {
        participantsRef.current = nextParticipants
    }
    const participants = participantsRef.current
    const loadVisuals = input.loadVisuals ?? defaultLoadVisuals
    const preloadImage = input.preloadImage ?? defaultPreloadImage
    const [resource, setResource] = useState<GameCreatureVisualResource>({
        fingerprint: null,
        status: 'unavailable',
        player: unavailableSide,
        opponent: unavailableSide,
    })
    const sequenceRef = useRef(0)
    const desiredFingerprintRef = useRef<string | null>(participants.fingerprint)
    const previousFingerprintRef = useRef<string | null>(null)
    desiredFingerprintRef.current = participants.fingerprint

    useEffect(() => {
        const fingerprint = participants.fingerprint
        const sequence = ++sequenceRef.current

        if (!input.enabled || !fingerprint || !participants.gameId) {
            setResource({
                fingerprint: null,
                status: 'unavailable',
                player: unavailableSide,
                opponent: unavailableSide,
            })
            previousFingerprintRef.current = null
            return
        }

        const reason: 'initial' | 'participants-changed' | 'profile-refreshed' = previousFingerprintRef.current === null
            ? 'initial'
            : previousFingerprintRef.current !== fingerprint
                ? 'participants-changed'
                : 'profile-refreshed'
        previousFingerprintRef.current = fingerprint
        let active = true
        let refreshTimer: number | undefined

        const isLatest = () => active
            && sequence === sequenceRef.current
            && desiredFingerprintRef.current === fingerprint

        const applyLoading = () => {
            setResource((previous) => previous.fingerprint === fingerprint
                ? {
                    ...previous,
                    status: 'loading',
                    player: previous.player.visual ? previous.player : loadingSide,
                    opponent: previous.opponent.visual ? previous.opponent : loadingSide,
                }
                : {
                    fingerprint,
                    status: 'loading',
                    player: loadingSide,
                    opponent: loadingSide,
                })
        }

        const load = async (loadReason: 'initial' | 'participants-changed' | 'profile-refreshed' | 'signed-url-refresh') => {
            applyLoading()
            devLog('start', { fingerprint, sequence, participants, reason: loadReason })
            try {
                const loadedVisuals = await loadVisuals({ gameId: participants.gameId! })
                const visuals = {
                    player: withResolvedCreatureImage(loadedVisuals.player),
                    opponent: loadedVisuals.opponent ? withResolvedCreatureImage(loadedVisuals.opponent) : null,
                }
                const preloadResults = await Promise.allSettled([
                    preloadImage(visuals.player.signedUrl),
                    visuals.opponent ? preloadImage(visuals.opponent.signedUrl) : Promise.resolve(),
                ])
                if (!isLatest()) {
                    devLog('ignored-stale', {
                        fingerprint,
                        sequence,
                        participants,
                        playerSignedUrlPresent: Boolean(visuals.player.signedUrl),
                        opponentSignedUrlPresent: Boolean(visuals.opponent?.signedUrl),
                        reason: loadReason,
                    })
                    return
                }

                const player = preloadedSide(visuals.player, preloadResults[0])
                const opponent = visuals.opponent
                    ? preloadedSide(visuals.opponent, preloadResults[1])
                    : unavailableSide
                setResource({ fingerprint, status: statusFromSides(player, opponent), player, opponent })
                devLog('success', {
                    fingerprint,
                    sequence,
                    participants,
                    playerSignedUrlPresent: Boolean(visuals.player.signedUrl),
                    opponentSignedUrlPresent: Boolean(visuals.opponent?.signedUrl),
                    reason: loadReason,
                })

                const delay = visualExpiryDelay(visuals)
                if (delay !== null) {
                    refreshTimer = window.setTimeout(() => { void load('signed-url-refresh') }, delay)
                }
            } catch {
                if (!isLatest()) {
                    devLog('ignored-stale', { fingerprint, sequence, participants, reason: loadReason })
                    return
                }
                setResource((previous) => {
                    const player = previous.fingerprint === fingerprint ? errorSide(previous.player) : errorSide(unavailableSide)
                    const opponent = previous.fingerprint === fingerprint ? errorSide(previous.opponent) : errorSide(unavailableSide)
                    return { fingerprint, status: 'error', player, opponent }
                })
                devLog('error', { fingerprint, sequence, participants, reason: loadReason })
            }
        }

        void load(reason)
        return () => {
            active = false
            if (refreshTimer) window.clearTimeout(refreshTimer)
        }
    }, [input.enabled, input.refreshKey, loadVisuals, participants, preloadImage])

    // A render with a new roster happens before its effect can launch the next
    // request. Expose it as loading immediately, never as the old remote fallback.
    const isCurrentFingerprint = resource.fingerprint === participants.fingerprint
    return {
        participants,
        resource: isCurrentFingerprint
            ? resource
            : {
                fingerprint: participants.fingerprint,
                status: 'loading' as const,
                player: loadingSide,
                opponent: loadingSide,
            },
    }
}
