import { useEffect, useMemo, useRef, useState } from 'react'

import './App.css'
import { useAuth } from './auth/AuthProvider'
import { AuthScreen } from './components/auth/AuthScreen'
import { HomeScreen } from './components/home/HomeScreen'
import { buildAuthenticatedHomeViewModel, buildGuestHomeViewModel } from './components/home/buildHomeViewModel'
import { buildMatchResultViewModel } from './components/game-results/buildMatchResultViewModel'
import { MatchResultScreen } from './components/game-results/MatchResultScreen'
import { GeneSelectionScreenV2 } from './components/game-v2/GeneSelectionScreenV2'
import { useGeneSelectionV2Controller } from './components/game-v2/controller/useGeneSelectionV2Controller'
import { useGameCreatureVisualResource } from './components/game-v2/controller/useGameCreatureVisualResource'
import { ProfileScreen } from './components/profile/ProfileScreen'
import { CreatureTransformationLab } from './components/creature-transformation-lab/CreatureTransformationLab'
import { CREATURE_TRANSFORMATION_LAB_HASH } from './components/creature-transformation-lab/lab-route'
import { CreatureVisualProgressionScreen } from './components/creature-visual-progression/CreatureVisualProgressionScreen'
import { VisualBackgroundCleanupScreen } from './components/visual-background-cleanup/VisualBackgroundCleanupScreen'
import { TOTAL_ROUNDS, TRAIT_LABELS } from './game/config'
import { PRODUCTION_CATALOG_AUDIT, RULE_VERSION } from '../shared/game-rules/catalog.ts'
import { getRoundExplanation } from './game/round-result-explainer'
import { getRoundEventLabel } from './game/ui-context'
import { type RoundValueBreakdown, type TraitType } from './game/types'
import { hasSupabaseConfig } from './lib/supabase'
import { GameSnapshotSync } from './lib/game-snapshot-sync'
import { getCurrentCreatureVisual, getCreatureVisualProgress, rollbackCreatureVisualVersion } from './lib/creature-transformations-api'
import { fetchMatchReward, fetchProfileMatchHistory, type MatchRewardRecord, type ProfileMatchHistoryItem } from './lib/profile-api'
import {
  acknowledgeReveal,
  advanceToNextRound,
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
  type PlayerRecord,
} from './lib/game-api'
import { clearStoredSession, createPlayerId, loadStoredSession, saveStoredSession } from './lib/storage'
import type { CreatureVisual } from './components/game-v2/gameSelectionAssets'

type BusyAction = 'CREATE' | 'CREATE_BOT' | 'JOIN' | null
type CurrentScreen = 'home' | 'profile' | 'creature-transformation-lab' | 'creature-evolution' | 'visual-background-cleanup'

const isCreatureTransformationLabEnabled = import.meta.env.VITE_CREATURE_TRANSFORMATION_LAB_ENABLED === 'true'
const isCreatureVisualProgressionEnabled = import.meta.env.VITE_CREATURE_VISUAL_PROGRESSION_ENABLED === 'true'
const isVisualBackgroundCleanupEnabled = import.meta.env.VITE_CREATURE_VISUAL_BACKGROUND_CLEANUP_ENABLED === 'true'
const CREATURE_VISUAL_PROGRESSION_HASH = '#creature-evolution'
const VISUAL_BACKGROUND_CLEANUP_HASH = '#visual-background-cleanup'

function getInitialScreen(): CurrentScreen {
  if (isCreatureTransformationLabEnabled && window.location.hash === CREATURE_TRANSFORMATION_LAB_HASH) return 'creature-transformation-lab'
  if (isCreatureVisualProgressionEnabled && window.location.hash === CREATURE_VISUAL_PROGRESSION_HASH) return 'creature-evolution'
  if (isVisualBackgroundCleanupEnabled && window.location.hash === VISUAL_BACKGROUND_CLEANUP_HASH) return 'visual-background-cleanup'
  return 'home'
}

type OfficialVisual = { signedUrl: string; expiresAt: string; versionNumber: number; versionId: string; visualTraitId?: string | null }
type VisualProgressSummary = { track: { progress: number; target: number; status: string } | null; currentVersion: { id: string; versionNumber: number; visualTraitId: string | null }; history: ReadonlyArray<{ id: string; versionNumber: number; visualTraitId: string | null; conceptName: string | null; signedUrl: string; expiresAt: string }> }

type ResolutionData = {
  ruleVersion?: string
  catalogSignature?: string
  awardedPoints?: number
  player1PointsAwarded?: number
  player2PointsAwarded?: number
  player1Action?: { trait: TraitType; actionType: 'USE' | 'EVOLVE'; playerId: string }
  player2Action?: { trait: TraitType; actionType: 'USE' | 'EVOLVE'; playerId: string }
  player1Breakdown?: RoundValueBreakdown
  player2Breakdown?: RoundValueBreakdown
  matchEndReason?: 'CLINCH' | 'SCORE' | 'ROUND_VALUE_TIEBREAK' | 'DRAW' | null
  player1RoundValueTotal?: number
  player2RoundValueTotal?: number
}

function getPlayerScore(snapshot: GameSnapshot, player: PlayerRecord | null): number {
  if (!player) {
    return 0
  }

  return player.slot === 1 ? snapshot.game.player_1_score : snapshot.game.player_2_score
}

function getTraitLabel(trait: TraitType): string {
  return TRAIT_LABELS[trait]
}

function App() {
  const auth = useAuth()
  const authStatus = auth.status
  const profileId = auth.profile?.id
  const profileNickname = auth.profile?.nickname
  const refreshProfile = auth.refreshProfile
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)
  const [nickname, setNickname] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [botDifficulty, setBotDifficulty] = useState<'EASY' | 'NORMAL' | 'HARD'>('NORMAL')
  const [isBusy, setIsBusy] = useState(false)
  const [busyAction, setBusyAction] = useState<BusyAction>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [currentScreen, setCurrentScreen] = useState<CurrentScreen>(getInitialScreen)
  const [history, setHistory] = useState<ProfileMatchHistoryItem[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [matchReward, setMatchReward] = useState<MatchRewardRecord | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(window.navigator.onLine)
  const [officialVisual, setOfficialVisual] = useState<OfficialVisual | null>(null)
  const [visualProgress, setVisualProgress] = useState<VisualProgressSummary | null>(null)
  const snapshotSyncRef = useRef<GameSnapshotSync | null>(null)
  const recoverRestoredRoundRef = useRef(false)
  const { resource: gameVisualResource } = useGameCreatureVisualResource({
    enabled: isCreatureVisualProgressionEnabled && Boolean(auth.profile),
    snapshot,
    refreshKey: auth.profile,
  })

  useEffect(() => {
    if (!hasSupabaseConfig || authStatus !== 'ready' || !profileId) {
      setIsLoading(false)

      return
    }

    const session = loadStoredSession()

    if (!session || session.profileId !== profileId) {
      if (session) {
        clearStoredSession()
      }
      setIsLoading(false)

      return
    }

    let active = true

    void (async () => {
      try {
        const restored = await restoreGameSession(session)

        if (!active) {
          return
        }

        if (!isGameSnapshotPlayable(restored) || restored.me?.profile_id !== profileId) {
          clearStoredSession()
          setErrorMessage('La partita salvata non è compatibile con questa versione. Crea una nuova partita.')
          setIsLoading(false)

          return
        }

        recoverRestoredRoundRef.current = true
        setSnapshot(restored)
        setStatusMessage('Sessione ripristinata.')
      } catch (error) {
        if (!active) {
          return
        }

        clearStoredSession()
        setErrorMessage(error instanceof Error ? error.message : 'Impossibile ripristinare la sessione.')
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      active = false
      snapshotSyncRef.current?.dispose()
      snapshotSyncRef.current = null
    }
  }, [authStatus, profileId])

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      clearStoredSession()
      setSnapshot(null)
      setCurrentScreen('home')
    }
  }, [authStatus])

  useEffect(() => {
    if (!isCreatureTransformationLabEnabled && !isCreatureVisualProgressionEnabled && !isVisualBackgroundCleanupEnabled) {
      return
    }

    const syncTechnicalRoute = () => {
      setCurrentScreen(
        isCreatureTransformationLabEnabled && window.location.hash === CREATURE_TRANSFORMATION_LAB_HASH
          ? 'creature-transformation-lab'
          : isCreatureVisualProgressionEnabled && window.location.hash === CREATURE_VISUAL_PROGRESSION_HASH
            ? 'creature-evolution'
            : isVisualBackgroundCleanupEnabled && window.location.hash === VISUAL_BACKGROUND_CLEANUP_HASH
              ? 'visual-background-cleanup'
              : 'home',
      )
    }

    window.addEventListener('hashchange', syncTechnicalRoute)
    return () => window.removeEventListener('hashchange', syncTechnicalRoute)
  }, [])

  useEffect(() => {
    if (profileNickname) {
      setNickname(profileNickname)
    }
  }, [profileNickname])

  useEffect(() => {
    if (!isCreatureVisualProgressionEnabled || !auth.profile || !auth.creature) {
      setOfficialVisual(null)
      setVisualProgress(null)
      return
    }
    let active = true
    let refreshTimer: number | undefined
    const load = async () => {
      try {
        const [visual, progression] = await Promise.all([
          getCurrentCreatureVisual({ operation: 'GET_CURRENT_VISUAL', creatureId: auth.creature!.id }),
          getCreatureVisualProgress({ operation: 'GET_VISUAL_PROGRESS', creatureId: auth.creature!.id }),
        ])
        if (!active) return
        setOfficialVisual(visual.visual)
        setVisualProgress({ track: progression.track, currentVersion: progression.currentVersion, history: progression.history })
        const wait = Math.max(15_000, Date.parse(visual.visual.expiresAt) - Date.now() - 30_000)
        refreshTimer = window.setTimeout(() => { void load() }, wait)
      } catch {
        // The stable base asset remains the UI fallback during rollout or URL errors.
        if (active) setOfficialVisual(null)
      }
    }
    void load()
    return () => { active = false; if (refreshTimer) window.clearTimeout(refreshTimer) }
  }, [auth.creature, auth.profile])

  useEffect(() => {
    if (currentScreen !== 'profile' || !profileId) {
      return
    }

    let active = true
    setIsLoadingHistory(true)
    setHistoryError(null)

    void fetchProfileMatchHistory(profileId, null)
      .then((nextHistory) => {
        if (active) {
          setHistory(nextHistory)
        }
      })
      .catch((error) => {
        if (active) {
          setHistoryError(error instanceof Error ? error.message : 'Impossibile caricare la cronologia.')
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingHistory(false)
        }
      })

    return () => {
      active = false
    }
  }, [currentScreen, profileId])

  useEffect(() => {
    const gameId = snapshot?.game.id

    if (snapshot?.game.status !== 'FINISHED' || !gameId || !profileId) {
      setMatchReward(null)
      return
    }

    let active = true
    setMatchReward(null)

    void (async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const reward = await fetchMatchReward(gameId, profileId)

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

        await new Promise((resolve) => window.setTimeout(resolve, 250))
      }
    })()

    return () => {
      active = false
    }
  }, [profileId, refreshProfile, snapshot?.game.id, snapshot?.game.status])

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

    if (!gameId || !playerId) {
      return
    }

    const sync = new GameSnapshotSync({
      fetchSnapshot: () => fetchGameSnapshot(gameId, playerId),
      onSnapshot: (nextSnapshot) => {
        setSnapshot((current) => current?.game.id === gameId && current.me?.id === playerId ? nextSnapshot : current)
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

    void subscribeToGame(gameId, (revision) => {
      sync.invalidate(revision)
    }, () => {
      // Realtime is only an invalidation stream. This closes bootstrap/reconnect gaps.
      sync.reconcile()
    }).then((nextUnsubscribe) => {
      if (active) {
        unsubscribe = nextUnsubscribe
      } else {
        nextUnsubscribe()
      }
    }).catch(() => {
      if (active) {
        setErrorMessage('Impossibile mantenere la sincronizzazione realtime. Riprovo al prossimo aggiornamento.')
      }
    })

    return () => {
      active = false
      unsubscribe?.()
      sync.dispose()
      if (snapshotSyncRef.current === sync) snapshotSyncRef.current = null
    }
  }, [snapshot?.game.id, snapshot?.me?.id])

  useEffect(() => {
    const gameId = snapshot?.game.id
    const playerId = snapshot?.me?.id
    if (!recoverRestoredRoundRef.current || !gameId || !playerId) {
      return
    }
    recoverRestoredRoundRef.current = false

    const resolveNeeded = snapshot?.game.status === 'CHOOSING'
      && !snapshot.currentRoundResult
      && snapshot.game.current_round > 0
      && (snapshot.actionsSubmitted >= 2 || (snapshot.game.game_mode === 'VS_BOT' && Boolean(snapshot.myCurrentAction)))
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

    if (!gameId || !playerId || currentStatus !== 'REVEALING' || !currentRoundResultId || currentRound >= TOTAL_ROUNDS) {
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
    }, 1000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [snapshot?.game.id, snapshot?.game.status, snapshot?.currentRoundResult?.id, snapshot?.game.current_round, snapshot?.me?.id])

  useEffect(() => {
    const gameStatus = snapshot?.game.status

    if (gameStatus && gameStatus !== 'WAITING' && gameStatus !== 'CHOOSING') {
      setStatusMessage(null)
    }
  }, [snapshot?.game.status])

  const myScore = snapshot ? getPlayerScore(snapshot, snapshot.me) : 0
  const opponentScore = snapshot ? getPlayerScore(snapshot, snapshot.opponent) : 0
  const isGameScreen = snapshot?.game.status === 'CHOOSING'
    || snapshot?.game.status === 'REVEALING'
    || snapshot?.game.status === 'ROUND_RESULT'
  const isResultScreen = snapshot?.game.status === 'FINISHED'
  const isGamePresentation = isGameScreen || isResultScreen
  const resolutionData = useMemo(
    () => (snapshot?.currentRoundResult?.resolution_data as ResolutionData | undefined) ?? undefined,
    [snapshot?.currentRoundResult?.resolution_data],
  )
  const resultViewModel = useMemo(
    () => snapshot ? buildMatchResultViewModel(snapshot, myScore, opponentScore) : null,
    [myScore, opponentScore, snapshot],
  )
  const homeViewModel = useMemo(() => {
    const input = {
      nickname,
      roomCode,
      botDifficulty,
      isOnline,
      errorMessage,
      statusMessage,
      isBusy,
      busyAction,
    }

    return auth.profile && auth.creature
      ? buildAuthenticatedHomeViewModel({ ...input, profile: auth.profile, creature: auth.creature, officialVisualUrl: officialVisual?.signedUrl })
      : buildGuestHomeViewModel(input)
  }, [auth.creature, auth.profile, botDifficulty, busyAction, errorMessage, isBusy, isOnline, nickname, officialVisual?.signedUrl, roomCode, statusMessage])

  async function startNewGame(mode: 'PVP' | 'VS_BOT', difficulty = botDifficulty) {
    if (!auth.profile || !auth.creature) {
      setErrorMessage('Accedi e attendi l’inizializzazione del profilo prima di giocare.')

      return
    }

    setIsBusy(true)
    setBusyAction(mode === 'VS_BOT' ? 'CREATE_BOT' : 'CREATE')
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const playerId = createPlayerId()
      const participant = {
        nickname: auth.profile.nickname,
        playerId,
        profileId: auth.profile.id,
        creatureId: auth.creature.id,
        creatureSnapshot: {
          id: auth.creature.id,
          baseCreatureKey: auth.creature.base_creature_key,
          name: auth.creature.name,
          level: auth.creature.level,
        },
      }
      const created = mode === 'VS_BOT'
        ? await createVsBotGame({ ...participant, difficulty })
        : await createGame(participant)
      if (!created.me) throw new Error('Impossibile identificare il partecipante della partita appena creata.')
      saveStoredSession({ playerId: created.me.id, gameId: created.game.id, roomCode: created.game.room_code, profileId: auth.profile.id })
      setSnapshot(created)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : mode === 'VS_BOT' ? 'Impossibile creare la partita contro il bot.' : 'Impossibile creare la partita.')
    } finally {
      setIsBusy(false)
      setBusyAction(null)
    }
  }

  async function handleCreateGame() {
    await startNewGame('PVP')
  }

  async function handleCreateBotGame() {
    await startNewGame('VS_BOT', botDifficulty)
  }

  async function handleNewMatch() {
    if (!snapshot?.me) {
      handleLeaveSession()
      return
    }

    await startNewGame(snapshot.game.game_mode, snapshot.game.bot_difficulty)
  }

  async function handleJoinGame() {
    if (!auth.profile || !auth.creature) {
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
      const playerId = createPlayerId()
      const joined = await joinGame({
        roomCode,
        nickname: auth.profile.nickname,
        playerId,
        profileId: auth.profile.id,
        creatureId: auth.creature.id,
        creatureSnapshot: {
          id: auth.creature.id,
          baseCreatureKey: auth.creature.base_creature_key,
          name: auth.creature.name,
          level: auth.creature.level,
        },
      })
      if (!joined.me) throw new Error('Impossibile identificare il partecipante della partita.')
      saveStoredSession({ playerId: joined.me.id, gameId: joined.game.id, roomCode: joined.game.room_code, profileId: auth.profile.id })
      setSnapshot(joined)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossibile entrare nella partita.')
    } finally {
      setIsBusy(false)
      setBusyAction(null)
    }
  }

  async function handleSubmitAction(actionType: 'USE' | 'EVOLVE', trait: TraitType): Promise<boolean> {
    if (!snapshot?.me || !trait) {
      return false
    }

    setIsBusy(true)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const mutation = await submitRoundAction({
        gameId: snapshot.game.id,
        roundNumber: snapshot.game.current_round,
        trait,
        actionType,
      })

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
  }

  async function handleAdvanceRound() {
    if (!snapshot?.me) {
      return
    }

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
  }

  function handleLeaveSession() {
    snapshotSyncRef.current?.dispose()
    snapshotSyncRef.current = null
    clearStoredSession()
    setSnapshot(null)
    setRoomCode('')
    setStatusMessage('Sessione locale rimossa.')
  }

  function handleLeaveCreatureTransformationLab() {
    if (window.location.hash === CREATURE_TRANSFORMATION_LAB_HASH) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    setCurrentScreen('home')
  }

  function handleLeaveCreatureEvolution() {
    if (window.location.hash === CREATURE_VISUAL_PROGRESSION_HASH) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    setCurrentScreen('home')
  }

  function handleLeaveVisualBackgroundCleanup() {
    if (window.location.hash === VISUAL_BACKGROUND_CLEANUP_HASH) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    setCurrentScreen('profile')
  }

  function handleOpenCreatureEvolution() {
    if (!isCreatureVisualProgressionEnabled) return
    window.location.hash = CREATURE_VISUAL_PROGRESSION_HASH
    setCurrentScreen('creature-evolution')
  }

  function handleOpenVisualBackgroundCleanup() {
    if (!isVisualBackgroundCleanupEnabled) return
    window.location.hash = VISUAL_BACKGROUND_CLEANUP_HASH
    setCurrentScreen('visual-background-cleanup')
  }

  async function handleVisualChanged() {
    setOfficialVisual(null)
    await refreshProfile()
  }

  async function handleSelectVisualVersion(targetVersionId: string) {
    if (!auth.creature || !visualProgress) return
    await rollbackCreatureVisualVersion({ operation: 'ROLLBACK_CREATURE_VISUAL_VERSION', creatureId: auth.creature.id, targetVersionId, expectedCurrentVisualVersionId: visualProgress.currentVersion.id })
    const [visual, progression] = await Promise.all([
      getCurrentCreatureVisual({ operation: 'GET_CURRENT_VISUAL', creatureId: auth.creature.id }),
      getCreatureVisualProgress({ operation: 'GET_VISUAL_PROGRESS', creatureId: auth.creature.id }),
    ])
    setOfficialVisual(visual.visual)
    setVisualProgress({ track: progression.track, currentVersion: progression.currentVersion, history: progression.history })
    await refreshProfile()
  }

  async function handleLogout() {
    clearStoredSession()
    setSnapshot(null)
    setCurrentScreen('home')
    setHistory([])
    setMatchReward(null)
    setErrorMessage(null)

    try {
      await auth.signOut()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Logout non riuscito.')
    }
  }

  async function handleCopyRoomCode() {
    if (!snapshot?.game.room_code) {
      return
    }

    try {
      await navigator.clipboard.writeText(snapshot.game.room_code)
      setStatusMessage('Codice copiato.')
    } catch {
      setErrorMessage('Copia automatica non disponibile: seleziona il codice e copialo manualmente.')
    }
  }

  return (
    <main className={`shell ${isGamePresentation ? 'shell--game' : ''} ${snapshot ? 'shell--session' : ''} ${!snapshot ? 'shell--home' : ''}`}>
      {isLoading || auth.status === 'loading' || auth.status === 'initializing' ? (
        <section className="panel centered-panel home-state-panel" role="status" aria-live="polite" aria-busy="true">
          <span className="eyebrow">Connessione alla partita</span>
          <h1>Gioco Evoluzione</h1>
          <p className="lead">Preparazione sessione multiplayer in corso...</p>
        </section>
      ) : !hasSupabaseConfig ? (
        <section className="panel intro-panel home-state-panel">
          <span className="eyebrow">Multiplayer 1v1</span>
          <h1>Gioco Evoluzione</h1>
          <p className="lead">
            L’app è pronta, ma per il multiplayer serve configurare Supabase prima di poter creare o entrare in una stanza.
          </p>
          <div className="message warning" role="alert" aria-live="assertive">
            Imposta <strong>VITE_SUPABASE_URL</strong> e <strong>VITE_SUPABASE_ANON_KEY</strong>, poi applica lo schema SQL e deploya la funzione <strong>resolve-round</strong>.
          </div>
        </section>
      ) : !snapshot && (auth.status !== 'ready' || !auth.profile || !auth.creature) ? (
        <AuthScreen
          initialError={auth.error}
          onSignIn={auth.signIn}
          onSignUp={auth.signUp}
        />
      ) : (
        <section className={`panel app-panel ${isGamePresentation ? 'app-panel--game' : ''} ${snapshot ? 'app-panel--session' : ''} ${!snapshot ? 'app-panel--home' : ''}`}>
          {!snapshot && currentScreen === 'creature-transformation-lab' && isCreatureTransformationLabEnabled && auth.profile && auth.creature ? (
            <CreatureTransformationLab
              creature={auth.creature}
              onBack={handleLeaveCreatureTransformationLab}
            />
          ) : !snapshot && currentScreen === 'creature-evolution' && isCreatureVisualProgressionEnabled && auth.creature ? (
            <CreatureVisualProgressionScreen
              creature={auth.creature}
              onBack={handleLeaveCreatureEvolution}
              onVisualChanged={handleVisualChanged}
            />
          ) : !snapshot && currentScreen === 'visual-background-cleanup' && isVisualBackgroundCleanupEnabled ? (
            <VisualBackgroundCleanupScreen
              onBack={handleLeaveVisualBackgroundCleanup}
              onVisualChanged={handleVisualChanged}
            />
          ) : !snapshot && currentScreen === 'profile' && auth.profile && auth.creature ? (
            <ProfileScreen
              profile={auth.profile}
              creature={auth.creature}
              history={history}
              isLoadingHistory={isLoadingHistory}
              errorMessage={historyError}
              onBack={() => setCurrentScreen('home')}
              onLogout={() => void handleLogout()}
              visualUrl={officialVisual?.signedUrl}
              visualVersionNumber={visualProgress?.currentVersion.versionNumber ?? officialVisual?.versionNumber}
              visualTrait={visualProgress?.currentVersion.visualTraitId ?? null}
              visualProgress={visualProgress?.track}
              visualHistory={visualProgress?.history}
              currentVisualVersionId={visualProgress?.currentVersion.id ?? officialVisual?.versionId}
              onSelectVisualVersion={isCreatureVisualProgressionEnabled && visualProgress ? handleSelectVisualVersion : undefined}
              onOpenEvolution={isCreatureVisualProgressionEnabled ? handleOpenCreatureEvolution : undefined}
              onOpenBackgroundCleanup={isVisualBackgroundCleanupEnabled ? handleOpenVisualBackgroundCleanup : undefined}
            />
          ) : !snapshot ? (
            <HomeScreen
              viewModel={homeViewModel}
              actions={{
                onNicknameChange: setNickname,
                onRoomCodeChange: (value) => setRoomCode(value.toUpperCase()),
                onBotDifficultyChange: setBotDifficulty,
                onCreateGame: () => void handleCreateGame(),
                onCreateBotGame: () => void handleCreateBotGame(),
                onJoinGame: () => void handleJoinGame(),
                onLeaveSession: handleLeaveSession,
                onOpenProfile: () => setCurrentScreen('profile'),
                onLogout: () => void handleLogout(),
              }}
            />
          ) : snapshot.game.status === 'WAITING' ? (
            <>
              <header className="topbar">
                <div>
                  <span className="eyebrow">Multiplayer 1v1</span>
                  <h1>Gioco Evoluzione</h1>
                </div>
                <button type="button" className="ghost-button" onClick={handleLeaveSession} aria-label="Esci dalla partita">
                  Esci
                </button>
              </header>

              {!isOnline ? <div className="message warning" role="alert">Connessione offline. La sincronizzazione riprende appena torna la rete.</div> : null}
              {errorMessage ? <div className="message error" role="alert">{errorMessage}</div> : null}
              {statusMessage ? <div className="message success" role="status">{statusMessage}</div> : null}

              <section className="stack-lg">
                <div className="room-code-card">
                  <span className="eyebrow">Codice stanza</span>
                  <p className="room-code">{snapshot.game.room_code}</p>
                  <p>Condividilo con il secondo giocatore. La partita parte appena entra nella stanza.</p>
                  <div className="button-row">
                    <button type="button" className="secondary-button" onClick={handleCopyRoomCode}>
                      Copia codice
                    </button>
                  </div>
                </div>

                <div className="status-card">
                  <strong>{snapshot.me?.nickname}</strong> è pronto.
                  <p>In attesa dell’avversario...</p>
                </div>
              </section>
            </>
          ) : isGameScreen ? (
            <ConnectedGeneSelectionScreenV2
              snapshot={snapshot}
              myScore={myScore}
              opponentScore={opponentScore}
              onSubmitAction={handleSubmitAction}
              onLeaveSession={handleLeaveSession}
              resolutionData={resolutionData}
              onContinue={() => void handleAdvanceRound()}
              isBusy={isBusy}
              errorMessage={errorMessage}
              playerVisual={gameVisualResource.player.visual ? { src: gameVisualResource.player.visual.signedUrl, alt: 'Creatura del giocatore', nativeFacing: 'right', scale: .82, offsetX: -10, offsetY: 25 } : undefined}
              opponentVisual={gameVisualResource.opponent.visual
                ? { src: gameVisualResource.opponent.visual.signedUrl, alt: 'Creatura avversaria', nativeFacing: 'right', scale: .72, offsetX: 6, offsetY: 25 }
                : gameVisualResource.opponent.status === 'loading' ? null : undefined}
            />
          ) : resultViewModel ? (
            <MatchResultScreen
              viewModel={resultViewModel}
              onLeaveSession={handleLeaveSession}
              onNewGame={() => void handleNewMatch()}
              isBusy={isBusy}
              errorMessage={errorMessage}
              reward={matchReward}
              creature={auth.creature}
            />
          ) : (
            <section className="state-message" role="alert">Risultato finale non disponibile.</section>
          )}
        </section>
      )}
    </main>
  )
}

type ConnectedGeneSelectionScreenV2Props = {
  snapshot: GameSnapshot
  myScore: number
  opponentScore: number
  onSubmitAction: (actionType: 'USE' | 'EVOLVE', trait: TraitType) => Promise<boolean>
  onLeaveSession: () => void
  resolutionData: ResolutionData | undefined
  onContinue: () => void
  isBusy: boolean
  errorMessage: string | null
  playerVisual?: CreatureVisual
  opponentVisual?: CreatureVisual | null
}

function ConnectedGeneSelectionScreenV2({
  snapshot,
  myScore,
  opponentScore,
  onSubmitAction,
  onLeaveSession,
  resolutionData,
  onContinue,
  isBusy,
  errorMessage,
  playerVisual,
  opponentVisual,
}: ConnectedGeneSelectionScreenV2Props) {
  const { viewModel, onSelectGene, onUseGene, onEvolveGene } = useGeneSelectionV2Controller({
    snapshot,
    myScore,
    opponentScore,
    onSubmitAction: async (trait, actionType) => {
      return onSubmitAction(actionType, trait)
    },
  })
  const isResolutionOpen = snapshot.game.status === 'REVEALING' || snapshot.game.status === 'ROUND_RESULT'

  return (
    <>
      <GeneSelectionScreenV2
        viewModel={{
          ...viewModel,
          player: { ...viewModel.player, creatureVisual: playerVisual ?? viewModel.player.creatureVisual },
          opponent: { ...viewModel.opponent, creatureVisual: opponentVisual === undefined ? viewModel.opponent.creatureVisual : opponentVisual },
        }}
        onSelectGene={onSelectGene}
        onUseGene={onUseGene}
        onEvolveGene={onEvolveGene}
        onLeaveSession={onLeaveSession}
        isInteractionLocked={isResolutionOpen}
      />
      {isResolutionOpen ? (
        <RoundResultModal
          snapshot={snapshot}
          resolutionData={resolutionData}
          onContinue={onContinue}
          isBusy={isBusy}
          errorMessage={errorMessage}
        />
      ) : null}
    </>
  )
}

type RoundResultModalProps = {
  snapshot: GameSnapshot
  resolutionData: ResolutionData | undefined
  onContinue: () => void
  isBusy: boolean
  errorMessage: string | null
}

function RoundResultModal({ snapshot, resolutionData, onContinue, isBusy, errorMessage }: RoundResultModalProps) {
  const result = snapshot.currentRoundResult
  const roundEvent = snapshot.currentRoundEvent
  const roundEventLabel = getRoundEventLabel(roundEvent)
  const [animationPhase, setAnimationPhase] = useState(snapshot.game.status === 'REVEALING' ? 0 : 3)
  const contentRef = useRef<HTMLElement>(null)
  const iAmPlayer1 = snapshot.me?.slot === 1
  const winnerNickname = snapshot.players.find((player) => player.id === result?.winner_id)?.nickname ?? null
  const player1Action = resolutionData?.player1Action
  const player2Action = resolutionData?.player2Action
  const player1Breakdown = resolutionData?.player1Breakdown
  const player2Breakdown = resolutionData?.player2Breakdown
  const hasCurrentRuleVersion = resolutionData?.ruleVersion === RULE_VERSION
    && resolutionData.catalogSignature === PRODUCTION_CATALOG_AUDIT.catalogSignature
  const myResolvedAction = player1Action?.playerId === snapshot.me?.id ? player1Action : player2Action
  const opponentResolvedAction = player1Action?.playerId === snapshot.opponent?.id ? player1Action : player2Action
  const myBreakdown = iAmPlayer1 ? player1Breakdown : player2Breakdown
  const opponentBreakdown = iAmPlayer1 ? player2Breakdown : player1Breakdown
  const myRoundValue = iAmPlayer1 ? result?.player_1_value ?? 0 : result?.player_2_value ?? 0
  const opponentRoundValue = iAmPlayer1 ? result?.player_2_value ?? 0 : result?.player_1_value ?? 0
  const myRoundPoints = iAmPlayer1
    ? resolutionData?.player1PointsAwarded ?? (result?.winner_id === snapshot.me?.id ? resolutionData?.awardedPoints ?? 0 : 0)
    : resolutionData?.player2PointsAwarded ?? (result?.winner_id === snapshot.me?.id ? resolutionData?.awardedPoints ?? 0 : 0)
  const opponentRoundPoints = iAmPlayer1
    ? resolutionData?.player2PointsAwarded ?? (result?.winner_id === snapshot.opponent?.id ? resolutionData?.awardedPoints ?? 0 : 0)
    : resolutionData?.player1PointsAwarded ?? (result?.winner_id === snapshot.opponent?.id ? resolutionData?.awardedPoints ?? 0 : 0)
  const iWon = result?.winner_id ? result.winner_id === snapshot.me?.id : null
  const bothEvolved = myResolvedAction?.actionType === 'EVOLVE' && opponentResolvedAction?.actionType === 'EVOLVE'
  const iEvolved = myResolvedAction?.actionType === 'EVOLVE'
  const outcomeTitle = bothEvolved || iEvolved
    ? 'Evoluzione completata'
    : iWon === null
      ? 'Pareggio'
      : iWon
        ? 'Round vinto'
        : 'Round perso'
  const explanation = getRoundExplanation({
    roundEventTitle: roundEvent?.title ?? null,
    meWon: iWon,
    meActionType: myResolvedAction?.actionType ?? null,
    opponentActionType: opponentResolvedAction?.actionType ?? null,
    myBreakdown,
    opponentBreakdown,
  })
  const continueLabel = snapshot.game.status === 'REVEALING'
    ? 'Continua'
    : snapshot.game.current_round < TOTAL_ROUNDS
      ? 'Prossimo round'
      : 'Risultato finale'

  useEffect(() => {
    if (snapshot.game.status !== 'REVEALING') {
      setAnimationPhase(3)

      return
    }

    setAnimationPhase(0)

    const step1 = window.setTimeout(() => setAnimationPhase(1), 220)
    const step2 = window.setTimeout(() => setAnimationPhase(2), 540)
    const step3 = window.setTimeout(() => setAnimationPhase(3), 860)

    return () => {
      window.clearTimeout(step1)
      window.clearTimeout(step2)
      window.clearTimeout(step3)
    }
  }, [snapshot.game.status, snapshot.currentRoundResult?.id])

  useEffect(() => {
    contentRef.current?.focus()
  }, [snapshot.currentRoundResult?.id])

  function skipRevealAnimation() {
    setAnimationPhase(3)
  }

  return (
    <div
      className="round-result-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Risultato del round"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
        }
      }}
    >
      <section ref={contentRef} className="round-result-screen" aria-live="polite" onPointerDown={skipRevealAnimation} tabIndex={-1}>
        <div className={`round-result-hero ${snapshot.game.status === 'REVEALING' ? 'is-revealing' : ''}`}>
          <span className="eyebrow">Esito round {snapshot.game.current_round} · {roundEventLabel}</span>
          <h2>{outcomeTitle}</h2>
          <div
            className={`round-result-hero__values ${animationPhase < 1 ? 'is-hidden' : ''}`}
            aria-label={`Valore tuo ${myRoundValue}, avversario ${opponentRoundValue}`}
          >
            <p>
              <span>Tu</span>
              <strong>{myRoundValue}</strong>
            </p>
            <p>
              <span>Avversario</span>
              <strong>{opponentRoundValue}</strong>
            </p>
          </div>
          <p className="round-result-hero__subtitle">{winnerNickname ? `${winnerNickname} vince il round.` : 'Nessun vincitore nel round.'}</p>
          {animationPhase < 3 ? <small className="round-result-hero__skip">Tocca per saltare l’animazione</small> : null}
        </div>

        {errorMessage ? <p className="message error" role="alert">{errorMessage}</p> : null}

        <div className={`round-result-cards ${animationPhase < 2 ? 'is-hidden' : ''}`}>
          {!hasCurrentRuleVersion ? (
            <p className="round-breakdown-card__legacy" role="status">
              Risultato calcolato con regole non riconosciute. Distribuisci la Edge Function aggiornata e avvia una nuova partita.
            </p>
          ) : null}
          <RoundBreakdownCard
            title={snapshot.me?.nickname ?? 'Tu'}
            action={myResolvedAction}
            breakdown={myBreakdown}
            total={myRoundValue}
            awardedPoints={myRoundPoints}
            roundEventLabel={roundEventLabel}
            showContributions={animationPhase >= 2}
            showTotal={animationPhase >= 3}
            isMe
          />
          <RoundBreakdownCard
            title={snapshot.opponent?.nickname ?? 'Avversario'}
            action={opponentResolvedAction}
            breakdown={opponentBreakdown}
            total={opponentRoundValue}
            awardedPoints={opponentRoundPoints}
            roundEventLabel={roundEventLabel}
            showContributions={animationPhase >= 2}
            showTotal={animationPhase >= 3}
          />
        </div>

        <p className={`round-result-explanation ${animationPhase < 3 ? 'is-hidden' : ''}`}>{explanation}</p>

        <div className="button-row round-result-screen__actions">
          <button
            type="button"
            className="primary-button"
            onClick={onContinue}
            aria-describedby={snapshot.game.status === 'REVEALING' ? 'round-continue-reason' : undefined}
            disabled={isBusy || snapshot.game.status === 'REVEALING'}
          >
            {continueLabel}
          </button>
          {snapshot.game.status === 'REVEALING' ? (
            <span id="round-continue-reason" className="button-row__reason" role="status">
              Disponibile al termine della rivelazione.
            </span>
          ) : null}
        </div>
      </section>
    </div>
  )
}

type RoundBreakdownCardProps = {
  title: string
  action: { trait: TraitType; actionType: 'USE' | 'EVOLVE'; playerId: string } | undefined
  breakdown: RoundValueBreakdown | undefined
  total: number
  awardedPoints: number
  roundEventLabel: string
  showContributions: boolean
  showTotal: boolean
  isMe?: boolean
}

function RoundBreakdownCard({
  title,
  action,
  breakdown,
  total,
  awardedPoints,
  roundEventLabel,
  showContributions,
  showTotal,
  isMe = false,
}: RoundBreakdownCardProps) {
  const actionLabel = action
    ? action.actionType === 'USE' ? 'USA' : 'EVOLVI'
    : 'N/D'
  const traitLabel = action ? getTraitLabel(action.trait) : 'N/D'

  return (
    <article className={`round-breakdown-card ${isMe ? 'round-breakdown-card--me' : ''}`}>
      <header>
        <span className="eyebrow">{title}</span>
        <strong>{traitLabel}</strong>
        <small>Azione: {actionLabel}</small>
      </header>

      {breakdown ? (
        <details className={`round-breakdown-card__details ${showContributions ? '' : 'is-hidden'}`}>
          <summary>Dettaglio calcolo</summary>
          <div className="round-breakdown-card__math">
            {action?.actionType === 'EVOLVE' ? (
              <p>EVOLVE: valore fisso {breakdown.total}; evoluzione e recupero ignorano affinita e matchup.</p>
            ) : (
              <>
                <p>Uso base: +{breakdown.baseContribution ?? 0}</p>
                <p>Affinita ambientale {roundEventLabel}: +{breakdown.eventModifier}</p>
                <p>Livello: +{breakdown.levelContribution}</p>
                <p>Vantaggio naturale: +{breakdown.matchupBonus ?? 0}</p>
              </>
            )}
            {breakdown.originalLevel > breakdown.effectiveLevel ? (
              <p>Livello posseduto: {breakdown.originalLevel} · Livello effettivo: {breakdown.effectiveLevel}</p>
            ) : (
              <p>Livello effettivo: {breakdown.effectiveLevel}</p>
            )}
          </div>
        </details>
      ) : (
        <p className="round-breakdown-card__legacy">Dettaglio calcolo non disponibile per questo risultato storico.</p>
      )}

      <footer>
        <strong className={showTotal ? 'is-highlighted' : ''}>{total} valore</strong>
        <span>+{awardedPoints} punti</span>
      </footer>
    </article>
  )
}

export default App
