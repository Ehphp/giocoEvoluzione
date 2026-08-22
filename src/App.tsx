import { useEffect, useMemo, useRef, useState } from 'react'

import { useAuth } from './auth/AuthProvider'
import { AuthScreen } from './screens/auth/AuthScreen'
import { HomeScreen } from './screens/home/HomeScreen'
import { buildAuthenticatedHomeViewModel, buildGuestHomeViewModel } from './screens/home/buildHomeViewModel'
import { buildMatchResultViewModel } from './components/game-results/buildMatchResultViewModel'
import { MatchResultScreen } from './screens/results/MatchResultScreen'
import { BattleScreen } from './screens/battle/BattleScreen'
import { RoundResultOverlay, type RoundResolutionData } from './screens/battle/parts/RoundResultOverlay'
import { EvolutionDraftOverlay } from './screens/battle/parts/EvolutionDraftOverlay'
import { BootScreen, MissingConfigScreen, MissingResultScreen, WaitingRoomScreen } from './screens/system/SystemScreens'
import { useGeneSelectionV2Controller } from './components/game-v2/controller/useGeneSelectionV2Controller'
import { useGameCreatureVisualResource } from './components/game-v2/controller/useGameCreatureVisualResource'
import { ProfileScreen } from './screens/profile/ProfileScreen'
import { CollectionScreen } from './screens/collection/CollectionScreen'
import { LeaderboardScreen } from './screens/ranking/LeaderboardScreen'
import { CreatureTransformationLab } from './components/creature-transformation-lab/CreatureTransformationLab'
import { CREATURE_TRANSFORMATION_LAB_HASH } from './components/creature-transformation-lab/lab-route'
import { CreatureVisualProgressionScreen } from './components/creature-visual-progression/CreatureVisualProgressionScreen'
import { VisualBackgroundCleanupScreen } from './components/visual-background-cleanup/VisualBackgroundCleanupScreen'
import { type TraitType } from './game/types'
import type { EvolutionTargetId } from '../shared/creature-transformations/evolution-targets.ts'
import { hasSupabaseConfig } from './lib/supabase'
import { GameSnapshotSync } from './lib/game-snapshot-sync'
import { getCurrentCreatureVisual, getCreatureVisualProgress, rollbackCreatureVisualVersion } from './lib/creature-transformations-api'
import { fetchMatchReward, fetchProfileMatchHistory, setMyCreatureCombatMutationLoadout, type MatchRewardRecord, type ProfileMatchHistoryItem } from './lib/profile-api'
import type { CombatMutationLoadout } from '../shared/game-rules/types.ts'
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
  type PlayerRecord,
} from './lib/game-api'
import { clearStoredSession, createPlayerId, loadStoredSession, saveStoredSession } from './lib/storage'
import type { CreatureVisual } from './components/game-v2/gameSelectionAssets'
import { withResolvedCreatureImage } from './ui/assets'

function getPlayerScore(snapshot: GameSnapshot, player: PlayerRecord | null): number {
  if (!player) {
    return 0
  }

  return player.slot === 1 ? snapshot.game.player_1_score : snapshot.game.player_2_score
}

type BusyAction = 'CREATE' | 'CREATE_BOT' | 'JOIN' | null
type BattleSubmitAction = { trait: TraitType; actionType: 'USE' | 'EVOLVE' } | { actionType: 'ACTIVATE_MUTATION'; mutationId: 'SYMBIOSIS'; sourceTrait: TraitType; targetTrait: TraitType } | { actionType: 'ACTIVATE_MUTATION'; mutationId: 'FINE_DEL_MONDO' }
type CurrentScreen = 'home' | 'collection' | 'profile' | 'ranking' | 'creature-transformation-lab' | 'creature-evolution' | 'visual-background-cleanup'

const isCreatureTransformationLabEnabled = import.meta.env.VITE_CREATURE_TRANSFORMATION_LAB_ENABLED === 'true'
const isCreatureVisualProgressionEnabled = import.meta.env.VITE_CREATURE_VISUAL_PROGRESSION_ENABLED === 'true'
const isVisualBackgroundCleanupEnabled = import.meta.env.VITE_CREATURE_VISUAL_BACKGROUND_CLEANUP_ENABLED === 'true'
const CREATURE_VISUAL_PROGRESSION_HASH = '#creature-evolution'
const VISUAL_BACKGROUND_CLEANUP_HASH = '#visual-background-cleanup'

type EvolutionRouteTarget = Readonly<{ lineageId: string; creatureId: string }>

function evolutionTargetFromHash(): EvolutionRouteTarget | null {
  if (!window.location.hash.startsWith(CREATURE_VISUAL_PROGRESSION_HASH)) return null
  const query = window.location.hash.slice(CREATURE_VISUAL_PROGRESSION_HASH.length)
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : '')
  const lineageId = params.get('lineageId')?.trim()
  const creatureId = params.get('creatureId')?.trim()
  return lineageId && creatureId ? { lineageId, creatureId } : null
}

function creatureEvolutionHash(target: EvolutionRouteTarget): string {
  return `${CREATURE_VISUAL_PROGRESSION_HASH}?${new URLSearchParams(target).toString()}`
}

function getInitialScreen(): CurrentScreen {
  if (isCreatureTransformationLabEnabled && window.location.hash === CREATURE_TRANSFORMATION_LAB_HASH) return 'creature-transformation-lab'
  if (isCreatureVisualProgressionEnabled && evolutionTargetFromHash()) return 'creature-evolution'
  if (isVisualBackgroundCleanupEnabled && window.location.hash === VISUAL_BACKGROUND_CLEANUP_HASH) return 'visual-background-cleanup'
  return 'home'
}

type OfficialVisual = { signedUrl: string; expiresAt: string; versionNumber: number; versionId: string; visualTraitId?: string | null; isBaseVersion?: boolean }
type VisualProgressSummary = { track: { progress: number; target: number; status: string } | null; currentVersion: { id: string; versionNumber: number; visualTraitId: string | null; shortDescription?: string | null }; history: ReadonlyArray<{ id: string; versionNumber: number; visualTraitId: string | null; conceptName: string | null; signedUrl: string; expiresAt: string }> }
type LineageVisualSummary = Record<string, { visualUrl: string; visualVersionNumber: number; visualTrait: string | null; currentVisualVersionId: string; visualHistory: VisualProgressSummary['history'] }>

function App() {
  const auth = useAuth()
  const activeCreature = auth.activeLineage?.creature ?? null
  const [evolutionTarget, setEvolutionTarget] = useState<EvolutionRouteTarget | null>(evolutionTargetFromHash)
  const evolutionCreature = evolutionTarget === null
    ? activeCreature
    : auth.lineages.find((lineage) => lineage.id === evolutionTarget.lineageId && lineage.creature.id === evolutionTarget.creatureId)?.creature ?? null
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
  const [lineageVisuals, setLineageVisuals] = useState<LineageVisualSummary>({})
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
      const target = evolutionTargetFromHash()

      if (isCreatureTransformationLabEnabled && window.location.hash === CREATURE_TRANSFORMATION_LAB_HASH) {
        setEvolutionTarget(null)
        setCurrentScreen('creature-transformation-lab')
        return
      }

      if (isCreatureVisualProgressionEnabled && target) {
        setEvolutionTarget(target)
        setCurrentScreen('creature-evolution')
        return
      }

      if (isVisualBackgroundCleanupEnabled && window.location.hash === VISUAL_BACKGROUND_CLEANUP_HASH) {
        setEvolutionTarget(null)
        setCurrentScreen('visual-background-cleanup')
        return
      }

      setEvolutionTarget(null)
      setCurrentScreen('home')
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
    if (!isCreatureVisualProgressionEnabled || !auth.profile || !activeCreature) {
      setOfficialVisual(null)
      setVisualProgress(null)
      return
    }
    let active = true
    let refreshTimer: number | undefined
    const load = async () => {
      try {
        const [visual, progression] = await Promise.all([
          getCurrentCreatureVisual({ operation: 'GET_CURRENT_VISUAL', creatureId: activeCreature.id }),
          getCreatureVisualProgress({ operation: 'GET_VISUAL_PROGRESS', creatureId: activeCreature.id }),
        ])
        if (!active) return
        setOfficialVisual(withResolvedCreatureImage(visual.visual))
        setVisualProgress({ track: progression.track, currentVersion: progression.currentVersion, history: progression.history.map(withResolvedCreatureImage) })
        const wait = Math.max(15_000, Date.parse(visual.visual.expiresAt) - Date.now() - 30_000)
        refreshTimer = window.setTimeout(() => { void load() }, wait)
      } catch {
        // The stable base asset remains the UI fallback during rollout or URL errors.
        if (active) setOfficialVisual(null)
      }
    }
    void load()
    return () => { active = false; if (refreshTimer) window.clearTimeout(refreshTimer) }
  }, [activeCreature, auth.profile])

  useEffect(() => {
    if (!isCreatureVisualProgressionEnabled || !auth.lineages.length) {
      setLineageVisuals({})
      return
    }
    let active = true
    void Promise.all(auth.lineages.map(async (lineage) => {
      const [visual, progression] = await Promise.all([
        getCurrentCreatureVisual({ operation: 'GET_CURRENT_VISUAL', creatureId: lineage.creature.id }),
        getCreatureVisualProgress({ operation: 'GET_VISUAL_PROGRESS', creatureId: lineage.creature.id }),
      ])
      return [lineage.id, {
        visualUrl: withResolvedCreatureImage(visual.visual).signedUrl,
        visualVersionNumber: progression.currentVersion.versionNumber,
        visualTrait: progression.currentVersion.visualTraitId,
        currentVisualVersionId: progression.currentVersion.id,
        visualHistory: progression.history.map(withResolvedCreatureImage),
      }] as const
    })).then((entries) => {
      if (active) setLineageVisuals(Object.fromEntries(entries))
    }).catch(() => {
      if (active) setLineageVisuals({})
    })
    return () => { active = false }
  }, [auth.lineages])

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

    if (!gameId || !playerId || currentStatus !== 'REVEALING' || !currentRoundResultId || currentRound >= (snapshot?.game.scheduled_rounds ?? 0)) {
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
  }, [snapshot?.game.id, snapshot?.game.status, snapshot?.currentRoundResult?.id, snapshot?.game.current_round, snapshot?.game.scheduled_rounds, snapshot?.me?.id])

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
  const resolutionData = useMemo(
    () => (snapshot?.currentRoundResult?.resolution_data as RoundResolutionData | undefined) ?? undefined,
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

    return auth.profile && activeCreature
      ? buildAuthenticatedHomeViewModel({
        ...input,
        profile: auth.profile,
        creature: activeCreature,
        officialVisualUrl: officialVisual?.signedUrl,
        visualVersionNumber: visualProgress?.currentVersion.versionNumber ?? officialVisual?.versionNumber,
        visualTrait: visualProgress?.currentVersion.visualTraitId ?? officialVisual?.visualTraitId ?? null,
        currentVisualShortDescription: visualProgress?.currentVersion.shortDescription ?? null,
        visualHistory: visualProgress?.history,
        currentVisualVersionId: visualProgress?.currentVersion.id ?? officialVisual?.versionId,
      })
      : buildGuestHomeViewModel(input)
  }, [activeCreature, auth.profile, botDifficulty, busyAction, errorMessage, isBusy, isOnline, nickname, officialVisual?.signedUrl, officialVisual?.versionId, officialVisual?.versionNumber, officialVisual?.visualTraitId, roomCode, statusMessage, visualProgress])

  async function startNewGame(mode: 'PVP' | 'VS_BOT', difficulty = botDifficulty) {
    if (!auth.profile || !activeCreature) {
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
        creatureId: activeCreature.id,
        creatureSnapshot: {
          id: activeCreature.id,
          lineageId: activeCreature.lineage_id,
          baseCreatureKey: activeCreature.base_creature_key,
          name: activeCreature.name,
          level: activeCreature.level,
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
    if (!auth.profile || !activeCreature) {
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
        creatureId: activeCreature.id,
        creatureSnapshot: {
          id: activeCreature.id,
          lineageId: activeCreature.lineage_id,
          baseCreatureKey: activeCreature.base_creature_key,
          name: activeCreature.name,
          level: activeCreature.level,
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

  async function handleSubmitAction(action: BattleSubmitAction): Promise<boolean> {
    if (!snapshot?.me) {
      return false
    }

    setIsBusy(true)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const mutation = await submitRoundAction(action.actionType === 'ACTIVATE_MUTATION'
        ? { gameId: snapshot.game.id, roundNumber: snapshot.game.current_round, ...action }
        : { gameId: snapshot.game.id, roundNumber: snapshot.game.current_round, ...action })

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

  async function handleChooseEvolutionTarget(evolutionTargetId: EvolutionTargetId) {
    if (!snapshot) {
      return
    }

    await chooseEvolutionDraftTarget(snapshot.game.id, evolutionTargetId)
    await snapshotSyncRef.current?.reconcile()
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
    // No confirmation notice: landing back on the home screen is the feedback, and a banner about
    // local session plumbing is not something the player should be reading there.
    setStatusMessage(null)
  }

  function handleLeaveCreatureTransformationLab() {
    if (window.location.hash === CREATURE_TRANSFORMATION_LAB_HASH) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    setCurrentScreen('home')
  }

  function handleLeaveCreatureEvolution() {
    if (window.location.hash.startsWith(CREATURE_VISUAL_PROGRESSION_HASH)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    setEvolutionTarget(null)
    setCurrentScreen('home')
  }

  function handleLeaveVisualBackgroundCleanup() {
    if (window.location.hash === VISUAL_BACKGROUND_CLEANUP_HASH) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    setCurrentScreen('profile')
  }

  function handleOpenCreatureEvolution(lineageId: string) {
    if (!isCreatureVisualProgressionEnabled) return
    const target = auth.lineages.find((lineage) => lineage.id === lineageId)
    if (!target) {
      setErrorMessage('La stirpe selezionata non e piu disponibile.')
      return
    }
    const evolutionTarget = { lineageId: target.id, creatureId: target.creature.id }
    setEvolutionTarget(evolutionTarget)
    window.location.hash = creatureEvolutionHash(evolutionTarget)
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

  async function handleSelectVisualVersion(input: { creatureId: string; targetVersionId: string; currentVersionId: string }) {
    await rollbackCreatureVisualVersion({ operation: 'ROLLBACK_CREATURE_VISUAL_VERSION', creatureId: input.creatureId, targetVersionId: input.targetVersionId, expectedCurrentVisualVersionId: input.currentVersionId })
    if (activeCreature?.id === input.creatureId) {
      const [visual, progression] = await Promise.all([
        getCurrentCreatureVisual({ operation: 'GET_CURRENT_VISUAL', creatureId: input.creatureId }),
        getCreatureVisualProgress({ operation: 'GET_VISUAL_PROGRESS', creatureId: input.creatureId }),
      ])
      setOfficialVisual(withResolvedCreatureImage(visual.visual))
      setVisualProgress({ track: progression.track, currentVersion: progression.currentVersion, history: progression.history.map(withResolvedCreatureImage) })
    }
    await refreshProfile()
  }

  async function handleSetCreatureCombatMutationLoadout(loadout: CombatMutationLoadout) {
    if (!activeCreature) return
    await setMyCreatureCombatMutationLoadout(activeCreature.id, loadout)
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

  if (isLoading || auth.status === 'loading' || auth.status === 'initializing') {
    return <BootScreen />
  }

  if (!hasSupabaseConfig) {
    return <MissingConfigScreen />
  }

  if (!snapshot && (auth.status !== 'ready' || !auth.profile || !activeCreature)) {
    return (
      <AuthScreen
        initialError={auth.error}
        onSignIn={auth.signIn}
        onSignUp={auth.signUp}
      />
    )
  }

  if (!snapshot && currentScreen === 'creature-transformation-lab' && isCreatureTransformationLabEnabled && auth.profile && activeCreature) {
    return <CreatureTransformationLab creature={activeCreature} onBack={handleLeaveCreatureTransformationLab} />
  }

  if (!snapshot && currentScreen === 'creature-evolution' && isCreatureVisualProgressionEnabled && evolutionCreature) {
    return (
      <CreatureVisualProgressionScreen
        creature={evolutionCreature}
        onBack={handleLeaveCreatureEvolution}
        onVisualChanged={handleVisualChanged}
      />
    )
  }

  if (!snapshot && currentScreen === 'visual-background-cleanup' && isVisualBackgroundCleanupEnabled) {
    return (
      <VisualBackgroundCleanupScreen
        onBack={handleLeaveVisualBackgroundCleanup}
        onVisualChanged={handleVisualChanged}
      />
    )
  }

  if (!snapshot && currentScreen === 'profile' && auth.profile && activeCreature) {
    return (
      <ProfileScreen
        profile={auth.profile}
        creature={activeCreature}
        history={history}
        isLoadingHistory={isLoadingHistory}
        errorMessage={historyError}
        onBack={() => setCurrentScreen('home')}
        onOpenCollection={() => setCurrentScreen('collection')}
        onOpenRanking={() => setCurrentScreen('ranking')}
        onLogout={() => void handleLogout()}
        visualUrl={officialVisual?.signedUrl}
        visualVersionNumber={visualProgress?.currentVersion.versionNumber ?? officialVisual?.versionNumber}
        visualTrait={visualProgress?.currentVersion.visualTraitId ?? null}
        onSetCombatMutationLoadout={handleSetCreatureCombatMutationLoadout}
        onOpenEvolution={isCreatureVisualProgressionEnabled && auth.activeLineage ? () => handleOpenCreatureEvolution(auth.activeLineage!.id) : undefined}
        onOpenBackgroundCleanup={isVisualBackgroundCleanupEnabled ? handleOpenVisualBackgroundCleanup : undefined}
      />
    )
  }

  if (!snapshot && currentScreen === 'collection' && auth.profile && activeCreature) {
    return (
      <CollectionScreen
        profile={auth.profile}
        creature={activeCreature}
        isOnline={isOnline}
        onBack={() => setCurrentScreen('home')}
        onOpenProfile={() => setCurrentScreen('profile')}
        onOpenRanking={() => setCurrentScreen('ranking')}
        onLogout={() => void handleLogout()}
        visualUrl={officialVisual?.signedUrl}
        visualVersionNumber={visualProgress?.currentVersion.versionNumber ?? officialVisual?.versionNumber}
        visualTrait={visualProgress?.currentVersion.visualTraitId ?? null}
        visualHistory={visualProgress?.history}
        currentVisualVersionId={visualProgress?.currentVersion.id ?? officialVisual?.versionId}
        lineages={auth.lineages}
        activeLineageId={auth.activeLineage?.id}
        lineageVisuals={lineageVisuals}
        onCreateLineage={() => auth.createLineage()}
        onDeleteLineage={(lineageId) => auth.deleteLineage(lineageId)}
        onSetActiveLineage={(lineageId) => void auth.setActiveLineage(lineageId)}
        onOpenEvolution={isCreatureVisualProgressionEnabled ? handleOpenCreatureEvolution : undefined}
        onSelectVisualVersion={isCreatureVisualProgressionEnabled ? ({ creatureId, versionId, currentVersionId }) => handleSelectVisualVersion({ creatureId, targetVersionId: versionId, currentVersionId }) : undefined}
      />
    )
  }

  if (!snapshot && currentScreen === 'ranking' && auth.profile) {
    return (
      <LeaderboardScreen
        onBack={() => setCurrentScreen('home')}
        onOpenCollection={() => setCurrentScreen('collection')}
        onOpenProfile={() => setCurrentScreen('profile')}
        onLogout={() => void handleLogout()}
      />
    )
  }

  if (!snapshot) {
    return (
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
          onOpenCollection: () => setCurrentScreen('collection'),
          onOpenRanking: () => setCurrentScreen('ranking'),
          onLogout: () => void handleLogout(),
        }}
      />
    )
  }

  if (snapshot.game.status === 'WAITING') {
    return (
      <WaitingRoomScreen
        roomCode={snapshot.game.room_code}
        nickname={snapshot.me?.nickname ?? 'Il tuo profilo'}
        isOnline={isOnline}
        errorMessage={errorMessage}
        statusMessage={statusMessage}
        onCopyRoomCode={() => void handleCopyRoomCode()}
        onLeaveSession={handleLeaveSession}
      />
    )
  }

  if (isGameScreen) {
    return (
      <ConnectedBattleScreen
        snapshot={snapshot}
        myScore={myScore}
        opponentScore={opponentScore}
        onSubmitAction={handleSubmitAction}
        onChooseEvolutionTarget={handleChooseEvolutionTarget}
        onLeaveSession={handleLeaveSession}
        resolutionData={resolutionData}
        onContinue={() => void handleAdvanceRound()}
        isBusy={isBusy}
        errorMessage={errorMessage}
        playerVisual={gameVisualResource.player.visual ? { src: gameVisualResource.player.visual.signedUrl, alt: 'Creatura del giocatore', nativeFacing: 'right', scale: .95, offsetX: 0, offsetY: 18 } : undefined}
        opponentVisual={gameVisualResource.opponent.visual
          ? { src: gameVisualResource.opponent.visual.signedUrl, alt: 'Creatura avversaria', nativeFacing: 'right', scale: .95, offsetX: 0, offsetY: 18 }
          : gameVisualResource.opponent.status === 'loading' ? null : undefined}
      />
    )
  }

  if (resultViewModel) {
    return (
      <MatchResultScreen
        viewModel={resultViewModel}
        onLeaveSession={handleLeaveSession}
        onNewGame={() => void handleNewMatch()}
        isBusy={isBusy}
        errorMessage={errorMessage}
        reward={matchReward}
        creature={activeCreature}
      />
    )
  }

  return <MissingResultScreen onLeaveSession={handleLeaveSession} />
}

type ConnectedBattleScreenProps = {
  snapshot: GameSnapshot
  myScore: number
  opponentScore: number
  onSubmitAction: (action: BattleSubmitAction) => Promise<boolean>
  onChooseEvolutionTarget: (evolutionTargetId: EvolutionTargetId) => Promise<void>
  onLeaveSession: () => void
  resolutionData: RoundResolutionData | undefined
  onContinue: () => void
  isBusy: boolean
  errorMessage: string | null
  playerVisual?: CreatureVisual
  opponentVisual?: CreatureVisual | null
}

/** Binds the battle presentation to the round controller and the reveal overlay. */
function ConnectedBattleScreen({
  snapshot,
  myScore,
  opponentScore,
  onSubmitAction,
  onChooseEvolutionTarget,
  onLeaveSession,
  resolutionData,
  onContinue,
  isBusy,
  errorMessage,
  playerVisual,
  opponentVisual,
}: ConnectedBattleScreenProps) {
  const { viewModel, onSelectGene, onUseGene, onEvolveGene, onActivateSymbiosis, onActivateFineDelMondo } = useGeneSelectionV2Controller({
    snapshot,
    myScore,
    opponentScore,
    onSubmitAction,
  })
  const isResolutionOpen = snapshot.game.status === 'REVEALING' || snapshot.game.status === 'ROUND_RESULT'
  // The draft blocks the first round: the server must know which counter a win credits.
  const draftOptions = snapshot.me?.evolution_draft_options ?? []
  const isDraftOpen = Boolean(snapshot.me) && !snapshot.me?.chosen_evolution_target_id && draftOptions.length > 0

  return (
    <>
      <BattleScreen
        viewModel={{
          ...viewModel,
          player: { ...viewModel.player, creatureVisual: playerVisual ?? viewModel.player.creatureVisual },
          opponent: { ...viewModel.opponent, creatureVisual: opponentVisual === undefined ? viewModel.opponent.creatureVisual : opponentVisual },
        }}
        onSelectGene={onSelectGene}
        onUseGene={onUseGene}
        onEvolveGene={onEvolveGene}
        onActivateSymbiosis={onActivateSymbiosis}
        onActivateFineDelMondo={onActivateFineDelMondo}
        onLeaveSession={onLeaveSession}
        isInteractionLocked={isResolutionOpen || isDraftOpen}
      />
      {isDraftOpen ? (
        <EvolutionDraftOverlay options={draftOptions} creatureId={snapshot.me?.creature_id} onChoose={onChooseEvolutionTarget} />
      ) : null}
      {!isDraftOpen && isResolutionOpen ? (
        <RoundResultOverlay
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

export default App
