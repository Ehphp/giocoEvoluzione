import { useCallback, useEffect, useRef, useState } from 'react'

import { TOTAL_ROUNDS } from '../game/config'
import type { TraitType } from '../game/types'
import type { EvolutionTargetId } from '../../shared/creature-transformations/evolution-targets.ts'
import {
    acknowledgeReveal,
    advanceToNextRound,
    chooseEvolutionDraftTarget,
    createGame,
    createVsBotGame,
    fetchGameSnapshot,
    isGameSnapshotPlayable,
    joinGame,
    maybeResolveRound,
    restoreGameSession,
    subscribeToGame,
    submitRoundAction,
    type GameSnapshot,
} from '../lib/game-api'
import { GameSnapshotSync } from '../lib/game-snapshot-sync'
import type { PlayerCreatureRecord, ProfileRecord } from '../lib/profile-api'
import { clearStoredSession, createPlayerId, loadStoredSession, saveStoredSession } from '../lib/storage'
import { hasSupabaseConfig } from '../lib/supabase'

export type BusyAction = 'CREATE' | 'CREATE_BOT' | 'JOIN' | null

export type BattleSubmitAction =
    | { trait: TraitType; actionType: 'USE' | 'EVOLVE' }
    | { actionType: 'ACTIVATE_MUTATION'; sourceTrait: TraitType; targetTrait: TraitType }

/** How long the round result stays on screen before the reveal is acknowledged. */
const REVEAL_ACKNOWLEDGE_DELAY_MS = 1000

function participantFrom(profile: ProfileRecord, creature: PlayerCreatureRecord, playerId: string) {
    return {
        nickname: profile.nickname,
        playerId,
        profileId: profile.id,
        creatureId: creature.id,
        creatureSnapshot: {
            id: creature.id,
            lineageId: creature.lineage_id,
            baseCreatureKey: creature.base_creature_key,
            name: creature.name,
            level: creature.level,
        },
    }
}

/**
 * Owns the live match: the snapshot, the sync that keeps it fresh, and every action that mutates
 * it. The realtime channel is only an invalidation stream — `GameSnapshotSync` is what actually
 * refetches — so a dropped subscription degrades to slower updates rather than a stuck board.
 */
export function useMatchSession(input: {
    profile: ProfileRecord | null
    activeCreature: PlayerCreatureRecord | null
    authStatus: string
    profileNickname: string | undefined
}) {
    const { profile, activeCreature, authStatus, profileNickname } = input

    // --- state -----------------------------------------------------------------
    const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)
    const [nickname, setNickname] = useState('')
    const [roomCode, setRoomCode] = useState('')
    const [botDifficulty, setBotDifficulty] = useState<'EASY' | 'NORMAL' | 'HARD'>('NORMAL')
    const [isBusy, setIsBusy] = useState(false)
    const [busyAction, setBusyAction] = useState<BusyAction>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [statusMessage, setStatusMessage] = useState<string | null>(null)
    const [isOnline, setIsOnline] = useState(window.navigator.onLine)

    // --- derived ---------------------------------------------------------------
    const snapshotSyncRef = useRef<GameSnapshotSync | null>(null)
    const recoverRestoredRoundRef = useRef(false)

    // --- effects ---------------------------------------------------------------
    useEffect(() => {
        if (!hasSupabaseConfig || authStatus !== 'ready' || !profile?.id) {
            setIsLoading(false)
            return
        }

        const session = loadStoredSession()

        if (!session || session.profileId !== profile.id) {
            if (session) clearStoredSession()
            setIsLoading(false)
            return
        }

        let active = true

        void (async () => {
            try {
                const restored = await restoreGameSession(session)
                if (!active) return

                if (!isGameSnapshotPlayable(restored) || restored.me?.profile_id !== profile.id) {
                    clearStoredSession()
                    setErrorMessage(
                        'La partita salvata non è compatibile con questa versione. Crea una nuova partita.',
                    )
                    setIsLoading(false)
                    return
                }

                recoverRestoredRoundRef.current = true
                setSnapshot(restored)
                setStatusMessage('Sessione ripristinata.')
            } catch (error) {
                if (!active) return
                clearStoredSession()
                setErrorMessage(error instanceof Error ? error.message : 'Impossibile ripristinare la sessione.')
            } finally {
                if (active) setIsLoading(false)
            }
        })()

        return () => {
            active = false
            snapshotSyncRef.current?.dispose()
            snapshotSyncRef.current = null
        }
    }, [authStatus, profile?.id])

    useEffect(() => {
        if (profileNickname) setNickname(profileNickname)
    }, [profileNickname])

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true)
            setStatusMessage('Connessione ripristinata.')
            snapshotSyncRef.current?.reconcile()
        }

        const handleOffline = () => {
            setIsOnline(false)
            setErrorMessage('Connessione persa. Riprovo a sincronizzare appena torna la rete.')
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

    useEffect(() => {
        const gameId = snapshot?.game.id
        const playerId = snapshot?.me?.id

        if (!gameId || !playerId) return

        const sync = new GameSnapshotSync({
            fetchSnapshot: () => fetchGameSnapshot(gameId, playerId),
            onSnapshot: (nextSnapshot) => {
                setSnapshot((current) =>
                    current?.game.id === gameId && current.me?.id === playerId ? nextSnapshot : current,
                )
            },
            onError: () => setErrorMessage('Impossibile aggiornare lo stato della partita.'),
            onMetrics: (metrics) => {
                if (import.meta.env.DEV) console.debug('[game-snapshot-sync]', metrics)
            },
        })
        sync.seed(snapshot)
        snapshotSyncRef.current?.dispose()
        snapshotSyncRef.current = sync

        let active = true
        let unsubscribe: (() => void) | undefined

        void subscribeToGame(
            gameId,
            (revision) => sync.invalidate(revision),
            () => {
                // Realtime is only an invalidation stream. This closes bootstrap/reconnect gaps.
                sync.reconcile()
            },
        )
            .then((nextUnsubscribe) => {
                if (active) unsubscribe = nextUnsubscribe
                else nextUnsubscribe()
            })
            .catch(() => {
                if (active) {
                    setErrorMessage(
                        'Impossibile mantenere la sincronizzazione realtime. Riprovo al prossimo aggiornamento.',
                    )
                }
            })

        return () => {
            active = false
            unsubscribe?.()
            sync.dispose()
            if (snapshotSyncRef.current === sync) snapshotSyncRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- seeded once per game/player pair
    }, [snapshot?.game.id, snapshot?.me?.id])

    useEffect(() => {
        const gameId = snapshot?.game.id
        const playerId = snapshot?.me?.id
        if (!recoverRestoredRoundRef.current || !gameId || !playerId) return
        recoverRestoredRoundRef.current = false

        // A round both players had answered before the reload never got resolved.
        const resolveNeeded =
            snapshot?.game.status === 'CHOOSING' &&
            !snapshot.currentRoundResult &&
            snapshot.game.current_round > 0 &&
            (snapshot.actionsSubmitted >= 2 ||
                (snapshot.game.game_mode === 'VS_BOT' && Boolean(snapshot.myCurrentAction)))

        if (resolveNeeded) {
            void maybeResolveRound(gameId, snapshot.game.current_round)
                .catch(() => undefined)
                .finally(() => snapshotSyncRef.current?.reconcile())
        }
    }, [snapshot])

    useEffect(() => {
        const gameId = snapshot?.game.id
        const playerId = snapshot?.me?.id
        const currentStatus = snapshot?.game.status
        const currentRoundResultId = snapshot?.currentRoundResult?.id
        const currentRound = snapshot?.game.current_round ?? 0

        if (
            !gameId ||
            !playerId ||
            currentStatus !== 'REVEALING' ||
            !currentRoundResultId ||
            currentRound >= TOTAL_ROUNDS
        ) {
            return
        }

        const timeoutId = window.setTimeout(() => {
            void (async () => {
                try {
                    const mutation = await acknowledgeReveal(gameId)
                    snapshotSyncRef.current?.invalidate(mutation.stateRevision, 'mutation')
                } catch {
                    return
                }
            })()
        }, REVEAL_ACKNOWLEDGE_DELAY_MS)

        return () => window.clearTimeout(timeoutId)
    }, [
        snapshot?.game.id,
        snapshot?.game.status,
        snapshot?.currentRoundResult?.id,
        snapshot?.game.current_round,
        snapshot?.me?.id,
    ])

    useEffect(() => {
        const gameStatus = snapshot?.game.status
        if (gameStatus && gameStatus !== 'WAITING' && gameStatus !== 'CHOOSING') setStatusMessage(null)
    }, [snapshot?.game.status])

    // --- handlers --------------------------------------------------------------
    const startNewGame = useCallback(
        async (mode: 'PVP' | 'VS_BOT', difficulty: 'EASY' | 'NORMAL' | 'HARD') => {
            if (!profile || !activeCreature) {
                setErrorMessage('Accedi e attendi l’inizializzazione del profilo prima di giocare.')
                return
            }

            setIsBusy(true)
            setBusyAction(mode === 'VS_BOT' ? 'CREATE_BOT' : 'CREATE')
            setErrorMessage(null)
            setStatusMessage(null)

            try {
                const participant = participantFrom(profile, activeCreature, createPlayerId())
                const created =
                    mode === 'VS_BOT' ? await createVsBotGame({ ...participant, difficulty }) : await createGame(participant)
                if (!created.me) throw new Error('Impossibile identificare il partecipante della partita appena creata.')
                saveStoredSession({
                    playerId: created.me.id,
                    gameId: created.game.id,
                    roomCode: created.game.room_code,
                    profileId: profile.id,
                })
                setSnapshot(created)
            } catch (error) {
                setErrorMessage(
                    error instanceof Error
                        ? error.message
                        : mode === 'VS_BOT'
                          ? 'Impossibile creare la partita contro il bot.'
                          : 'Impossibile creare la partita.',
                )
            } finally {
                setIsBusy(false)
                setBusyAction(null)
            }
        },
        [activeCreature, profile],
    )

    const leaveSession = useCallback(() => {
        snapshotSyncRef.current?.dispose()
        snapshotSyncRef.current = null
        clearStoredSession()
        setSnapshot(null)
        setRoomCode('')
        // No confirmation notice: landing back on the home screen is the feedback, and a banner
        // about local session plumbing is not something the player should be reading there.
        setStatusMessage(null)
    }, [])

    const createPvpGame = useCallback(() => startNewGame('PVP', botDifficulty), [botDifficulty, startNewGame])
    const createBotGame = useCallback(() => startNewGame('VS_BOT', botDifficulty), [botDifficulty, startNewGame])

    /** Replays the same mode and difficulty; without a participant there is nothing to replay. */
    const newMatch = useCallback(async () => {
        if (!snapshot?.me) {
            leaveSession()
            return
        }
        await startNewGame(snapshot.game.game_mode, snapshot.game.bot_difficulty)
    }, [leaveSession, snapshot, startNewGame])

    const joinRoom = useCallback(async () => {
        if (!profile || !activeCreature) {
            setErrorMessage('Accedi e attendi l’inizializzazione del profilo prima di entrare in una stanza.')
            return
        }

        if (!roomCode.trim()) {
            setErrorMessage('Inserisci il codice stanza.')
            return
        }

        setIsBusy(true)
        setBusyAction('JOIN')
        setErrorMessage(null)
        setStatusMessage(null)

        try {
            const joined = await joinGame({ roomCode, ...participantFrom(profile, activeCreature, createPlayerId()) })
            if (!joined.me) throw new Error('Impossibile identificare il partecipante della partita.')
            saveStoredSession({
                playerId: joined.me.id,
                gameId: joined.game.id,
                roomCode: joined.game.room_code,
                profileId: profile.id,
            })
            setSnapshot(joined)
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Impossibile entrare nella partita.')
        } finally {
            setIsBusy(false)
            setBusyAction(null)
        }
    }, [activeCreature, profile, roomCode])

    const submitAction = useCallback(
        async (action: BattleSubmitAction): Promise<boolean> => {
            if (!snapshot?.me) return false

            setIsBusy(true)
            setErrorMessage(null)
            setStatusMessage(null)

            try {
                const mutation = await submitRoundAction(
                    action.actionType === 'ACTIVATE_MUTATION'
                        ? {
                              gameId: snapshot.game.id,
                              roundNumber: snapshot.game.current_round,
                              ...action,
                              mutationId: 'SYMBIOSIS',
                          }
                        : { gameId: snapshot.game.id, roundNumber: snapshot.game.current_round, ...action },
                )

                snapshotSyncRef.current?.invalidate(mutation.stateRevision, 'mutation')
                if (mutation.resolveRequired) {
                    try {
                        await maybeResolveRound(snapshot.game.id, snapshot.game.current_round)
                    } finally {
                        snapshotSyncRef.current?.reconcile()
                    }
                }

                setStatusMessage('Scelta confermata. In attesa dell’avversario.')
                return true
            } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : 'Invio azione non riuscito.')
                return false
            } finally {
                setIsBusy(false)
            }
        },
        [snapshot],
    )

    const chooseEvolutionTarget = useCallback(
        async (evolutionTargetId: EvolutionTargetId) => {
            if (!snapshot) return
            await chooseEvolutionDraftTarget(snapshot.game.id, evolutionTargetId)
            await snapshotSyncRef.current?.reconcile()
        },
        [snapshot],
    )

    const advanceRound = useCallback(async () => {
        if (!snapshot?.me) return

        setIsBusy(true)
        setErrorMessage(null)

        try {
            const mutation = await advanceToNextRound(snapshot.game.id)
            snapshotSyncRef.current?.invalidate(mutation.stateRevision, 'mutation')
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Impossibile passare al round successivo.')
        } finally {
            setIsBusy(false)
        }
    }, [snapshot])

    /** Logging out must drop the session without the "left the match" messaging. */
    const reset = useCallback(() => {
        clearStoredSession()
        setSnapshot(null)
        setErrorMessage(null)
    }, [])

    return {
        snapshot,
        isLoading,
        isBusy,
        busyAction,
        errorMessage,
        setErrorMessage,
        statusMessage,
        setStatusMessage,
        isOnline,
        nickname,
        setNickname,
        roomCode,
        setRoomCode,
        botDifficulty,
        setBotDifficulty,
        createPvpGame,
        createBotGame,
        newMatch,
        joinRoom,
        submitAction,
        chooseEvolutionTarget,
        advanceRound,
        leaveSession,
        reset,
    }
}
