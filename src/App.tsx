import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { hasSupabaseConfig } from './lib/supabase'

import { useAuth } from './auth/AuthProvider'
import { AuthScreen } from './screens/auth/AuthScreen'
import { HomeScreen } from './screens/home/HomeScreen'
import { buildAuthenticatedHomeViewModel, buildGuestHomeViewModel } from './screens/home/build-home-view-model'
import { buildMatchResultViewModel } from './screens/results/build-match-result-view-model'
import { MatchResultScreen } from './screens/results/MatchResultScreen'
import { BattleScreen } from './screens/battle/BattleScreen'
import { RoundResultOverlay, type RoundResolutionData } from './screens/battle/parts/RoundResultOverlay'
import { EvolutionDraftOverlay } from './screens/battle/parts/EvolutionDraftOverlay'
import { BootScreen, MissingConfigScreen, MissingResultScreen, WaitingRoomScreen } from './screens/system/SystemScreens'
import { useGeneSelectionV2Controller } from './screens/battle/controller/use-gene-selection-v2-controller'
import { useGameCreatureVisualResource } from './screens/battle/controller/use-game-creature-visual-resource'
import { ProfileScreen } from './screens/profile/ProfileScreen'
import { CollectionScreen } from './screens/collection/CollectionScreen'
import { LeaderboardScreen } from './screens/ranking/LeaderboardScreen'
import { CreatureVisualProgressionScreen } from './components/creature-visual-progression/CreatureVisualProgressionScreen'
import type { EvolutionTargetId } from '../shared/creature-transformations/evolution-targets.ts'
import { setMyCreatureCombatMutationLoadout } from './lib/profile-api'
import type { CombatMutationLoadout } from '../shared/game-rules/types.ts'
import type { GameSnapshot, PlayerRecord } from './lib/game-api'
import type { CreatureVisual } from './screens/battle/controller/gene-selection-assets'
import { isCreatureVisualProgressionEnabled, useEvolutionRoute } from './app/use-evolution-route'
import { useCreatureVisuals } from './app/use-creature-visuals'
import { useProfileActivity } from './app/use-profile-activity'
import { useMatchSession, type BattleSubmitAction } from './app/use-match-session'
import { ConfirmDialog } from './ui/components'
import { Dock } from './ui/Dock'
import { ScreenTransition } from './ui/ScreenTransition'
import { SCREEN_DEPTH, type ScreenId } from './app/screen-depth'
import { getDockPlacement } from './app/dock-tab'
import { isColdStart } from './app/cold-start'

type ResolvedScreen = Readonly<{ id: ScreenId; node: ReactNode }>

function getPlayerScore(snapshot: GameSnapshot, player: PlayerRecord | null): number {
  if (!player) {
    return 0
  }

  return player.slot === 1 ? snapshot.game.player_1_score : snapshot.game.player_2_score
}

function App() {
  const auth = useAuth()
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
  const activeCreature = auth.activeLineage?.creature ?? null
  const { currentScreen, setCurrentScreen, evolutionTarget, openEvolution, leaveEvolution } = useEvolutionRoute()
  const evolutionCreature = evolutionTarget === null
    ? activeCreature
    : auth.lineages.find((lineage) => lineage.id === evolutionTarget.lineageId && lineage.creature.id === evolutionTarget.creatureId)?.creature ?? null
  const authStatus = auth.status
  const profileId = auth.profile?.id
  const profileNickname = auth.profile?.nickname
  const refreshProfile = auth.refreshProfile
  const session = useMatchSession({ profile: auth.profile, activeCreature, authStatus, profileNickname })
  const {
    snapshot, isLoading, isBusy, busyAction, errorMessage, setErrorMessage, statusMessage,
    isOnline, nickname, setNickname, roomCode, setRoomCode, botDifficulty, setBotDifficulty,
  } = session
  const { setStatusMessage } = session
  const { history, isLoadingHistory, historyError, matchReward, reset: resetProfileActivity } = useProfileActivity({
    profileId,
    isProfileScreenOpen: currentScreen === 'profile',
    finishedGameId: snapshot?.game.status === 'FINISHED' ? snapshot.game.id : undefined,
    refreshProfile,
  })
  const { officialVisual, visualProgress, lineageVisuals, onVisualChanged, selectVisualVersion } = useCreatureVisuals({
    profile: auth.profile,
    activeCreature,
    lineages: auth.lineages,
    refreshProfile,
  })
  const { resource: gameVisualResource } = useGameCreatureVisualResource({
    enabled: isCreatureVisualProgressionEnabled && Boolean(auth.profile),
    snapshot,
    refreshKey: auth.profile,
  })

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      session.reset()
      setCurrentScreen('home')
    }
  }, [authStatus, session, setCurrentScreen])

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
        visualHistory: visualProgress?.history,
        currentVisualVersionId: visualProgress?.currentVersion.id ?? officialVisual?.versionId,
      })
      : buildGuestHomeViewModel(input)
  }, [activeCreature, auth.profile, botDifficulty, busyAction, errorMessage, isBusy, isOnline, nickname, officialVisual?.signedUrl, officialVisual?.versionId, officialVisual?.versionNumber, officialVisual?.visualTraitId, roomCode, statusMessage, visualProgress])

  function handleOpenCreatureEvolution(lineageId: string) {
    const target = auth.lineages.find((lineage) => lineage.id === lineageId)
    if (!target) {
      setErrorMessage('La stirpe selezionata non e piu disponibile.')
      return
    }
    openEvolution({ lineageId: target.id, creatureId: target.creature.id })
  }

  async function handleSetCreatureCombatMutationLoadout(loadout: CombatMutationLoadout) {
    if (!activeCreature) return
    await setMyCreatureCombatMutationLoadout(activeCreature.id, loadout)
    await refreshProfile()
  }

  /**
   * Signing out is asked for on four screens and confirmed in one place, so the question reads the
   * same wherever it is triggered — and so the confirmation survives the screen unmounting under it.
   */
  async function handleLogout() {
    setIsLogoutConfirmOpen(false)
    session.reset()
    setCurrentScreen('home')
    resetProfileActivity()

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

  /**
   * Picks the screen to show. Returns it with its identity rather than rendering it directly, so
   * the transition layer can tell a genuine screen change from an ordinary re-render.
   */
  function resolveScreen(): ResolvedScreen {
    if (isColdStart({ isRestoringSession: isLoading, authStatus: auth.status, hasProfile: Boolean(auth.profile) })) {
      return { id: 'boot', node: <BootScreen /> }
    }

    if (!hasSupabaseConfig) {
      return { id: 'missing-config', node: <MissingConfigScreen /> }
    }

    if (!snapshot && (auth.status !== 'ready' || !auth.profile || !activeCreature)) {
      return {
        id: 'auth',
        node: (
          <AuthScreen
            initialError={auth.error}
            onSignIn={auth.signIn}
            onSignUp={auth.signUp}
          />
        ),
      }
    }

    if (!snapshot && currentScreen === 'creature-evolution' && isCreatureVisualProgressionEnabled && evolutionCreature) {
      return {
        id: 'creature-evolution',
        node: (
          <CreatureVisualProgressionScreen
            creature={evolutionCreature}
            onBack={leaveEvolution}
            onVisualChanged={onVisualChanged}
          />
        ),
      }
    }

    if (!snapshot && currentScreen === 'profile' && auth.profile && activeCreature) {
      return {
        id: 'profile',
        node: (
          <ProfileScreen
            profile={auth.profile}
            creature={activeCreature}
            history={history}
            isLoadingHistory={isLoadingHistory}
            errorMessage={historyError}
            visualUrl={officialVisual?.signedUrl}
            visualVersionNumber={visualProgress?.currentVersion.versionNumber ?? officialVisual?.versionNumber}
            visualTrait={visualProgress?.currentVersion.visualTraitId ?? null}
            onSetCombatMutationLoadout={handleSetCreatureCombatMutationLoadout}
            onOpenEvolution={isCreatureVisualProgressionEnabled && auth.activeLineage ? () => handleOpenCreatureEvolution(auth.activeLineage!.id) : undefined}
          />
        ),
      }
    }

    if (!snapshot && currentScreen === 'collection' && auth.profile && activeCreature) {
      return {
        id: 'collection',
        node: (
          <CollectionScreen
            profile={auth.profile}
            creature={activeCreature}
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
            onSelectVisualVersion={isCreatureVisualProgressionEnabled ? ({ creatureId, versionId, currentVersionId }) => selectVisualVersion({ creatureId, targetVersionId: versionId, currentVersionId }) : undefined}
          />
        ),
      }
    }

    if (!snapshot && currentScreen === 'ranking' && auth.profile) {
      return {
        id: 'ranking',
        node: (
          <LeaderboardScreen />
        ),
      }
    }

    if (!snapshot) {
      return {
        id: 'home',
        node: (
          <HomeScreen
            viewModel={homeViewModel}
            actions={{
              onNicknameChange: setNickname,
              onRoomCodeChange: (value) => setRoomCode(value.toUpperCase()),
              onBotDifficultyChange: setBotDifficulty,
              onCreateGame: () => void session.createPvpGame(),
              onCreateBotGame: () => void session.createBotGame(),
              onJoinGame: () => void session.joinRoom(),
              onLeaveSession: session.leaveSession,
              onLogout: () => setIsLogoutConfirmOpen(true),
            }}
          />
        ),
      }
    }

    if (snapshot.game.status === 'WAITING') {
      return {
        id: 'waiting',
        node: (
          <WaitingRoomScreen
            roomCode={snapshot.game.room_code}
            nickname={snapshot.me?.nickname ?? 'Il tuo profilo'}
            isOnline={isOnline}
            errorMessage={errorMessage}
            statusMessage={statusMessage}
            onCopyRoomCode={() => void handleCopyRoomCode()}
            onLeaveSession={session.leaveSession}
          />
        ),
      }
    }

    // One identity for the whole duel: the rounds inside it are not screen changes.
    if (isGameScreen) {
      return {
        id: 'battle',
        node: (
          <ConnectedBattleScreen
            snapshot={snapshot}
            myScore={myScore}
            opponentScore={opponentScore}
            onSubmitAction={session.submitAction}
            onChooseEvolutionTarget={session.chooseEvolutionTarget}
            onLeaveSession={session.leaveSession}
            resolutionData={resolutionData}
            onContinue={() => void session.advanceRound()}
            isBusy={isBusy}
            errorMessage={errorMessage}
            playerVisual={gameVisualResource.player.visual ? { src: gameVisualResource.player.visual.signedUrl, alt: 'Creatura del giocatore', nativeFacing: 'right', scale: .95, offsetX: 0, offsetY: 18 } : undefined}
            opponentVisual={gameVisualResource.opponent.visual
              ? { src: gameVisualResource.opponent.visual.signedUrl, alt: 'Creatura avversaria', nativeFacing: 'right', scale: .95, offsetX: 0, offsetY: 18 }
              : gameVisualResource.opponent.status === 'loading' ? null : undefined}
          />
        ),
      }
    }

    if (resultViewModel) {
      return {
        id: 'result',
        node: (
          <MatchResultScreen
            viewModel={resultViewModel}
            onLeaveSession={session.leaveSession}
            onNewGame={() => void session.newMatch()}
            isBusy={isBusy}
            errorMessage={errorMessage}
            reward={matchReward}
            creature={activeCreature}
          />
        ),
      }
    }

    return { id: 'missing-result', node: <MissingResultScreen onLeaveSession={session.leaveSession} /> }
  }

  const screen = resolveScreen()
  const dock = getDockPlacement(screen.id)
  const isSignedIn = Boolean(auth.profile && activeCreature)

  return (
    <>
      <ScreenTransition screenKey={screen.id} depth={SCREEN_DEPTH[screen.id]}>
        {screen.node}
      </ScreenTransition>
      {dock.isShown ? (
        <Dock
          active={dock.active}
          /* Battle is always reachable; the rest need an account behind them. No shop has shipped. */
          capabilities={{ shop: false, collection: isSignedIn, ranking: isSignedIn, profile: isSignedIn }}
          onNavigate={(tab) => {
            if (tab === 'battle') setCurrentScreen('home')
            if (tab === 'collection') setCurrentScreen('collection')
            if (tab === 'ranking') setCurrentScreen('ranking')
            if (tab === 'profile') setCurrentScreen('profile')
          }}
        />
      ) : null}
      {isLogoutConfirmOpen ? (
        <ConfirmDialog
          label="Conferma uscita dall account"
          title="Uscire dall account?"
          description="La sessione locale viene chiusa. Per tornare a giocare devi accedere di nuovo."
          confirmLabel="Esci dall account"
          cancelLabel="Resta collegato"
          onConfirm={() => void handleLogout()}
          onCancel={() => setIsLogoutConfirmOpen(false)}
        />
      ) : null}
    </>
  )
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
