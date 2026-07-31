import { useEffect, useMemo, useRef, useState } from 'react'

import './App.css'
import { HomeScreen } from './components/home/HomeScreen'
import { buildMatchResultViewModel } from './components/game-results/buildMatchResultViewModel'
import { MatchResultScreen } from './components/game-results/MatchResultScreen'
import { GeneSelectionScreenV2 } from './components/game-v2/GeneSelectionScreenV2'
import { useGeneSelectionV2Controller } from './components/game-v2/controller/useGeneSelectionV2Controller'
import { TOTAL_ROUNDS, TRAIT_LABELS } from './game/config'
import { PRODUCTION_CATALOG_AUDIT, RULE_VERSION } from '../shared/game-rules/catalog.ts'
import { getRoundExplanation } from './game/round-result-explainer'
import { getRoundEventLabel } from './game/ui-context'
import { type RoundValueBreakdown, type TraitType } from './game/types'
import { hasSupabaseConfig } from './lib/supabase'
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

type BusyAction = 'CREATE' | 'CREATE_BOT' | 'JOIN' | null

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

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setIsLoading(false)

      return
    }

    const session = loadStoredSession()

    if (!session) {
      setIsLoading(false)

      return
    }

    void (async () => {
      try {
        const restored = await restoreGameSession(session)

        if (!isGameSnapshotPlayable(restored)) {
          clearStoredSession()
          setErrorMessage('La partita salvata non è compatibile con questa versione. Crea una nuova partita.')
          setIsLoading(false)

          return
        }

        setSnapshot(restored)
        setStatusMessage('Sessione ripristinata.')
      } catch (error) {
        clearStoredSession()
        setErrorMessage(error instanceof Error ? error.message : 'Impossibile ripristinare la sessione.')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      setStatusMessage('Connessione ripristinata.')
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

    let unsubscribe: (() => void) | undefined

    void (async () => {
      unsubscribe = await subscribeToGame(gameId, () => {
        void refreshSnapshot(gameId, playerId)
      })
    })()

    return () => {
      unsubscribe?.()
    }
  }, [snapshot?.game.id, snapshot?.me?.id])

  useEffect(() => {
    const gameId = snapshot?.game.id
    const playerId = snapshot?.me?.id
    const currentStatus = snapshot?.game.status
    const actionsSubmitted = snapshot?.actionsSubmitted ?? 0
    const currentRoundResultId = snapshot?.currentRoundResult?.id
    const currentRound = snapshot?.game.current_round ?? 0
    const isVsBot = snapshot?.game.game_mode === 'VS_BOT'
    const hasHumanAction = Boolean(snapshot?.myCurrentAction)

    if (
      !gameId
      || !playerId
      || currentStatus !== 'CHOOSING'
      || currentRoundResultId
      || currentRound <= 0
      || (!(actionsSubmitted >= 2) && !(isVsBot && hasHumanAction))
    ) {
      return
    }

    void (async () => {
      try {
        await maybeResolveRound(gameId, currentRound)
        await refreshSnapshot(gameId, playerId)
      } catch {
        return
      }
    })()
  }, [snapshot?.actionsSubmitted, snapshot?.game.status, snapshot?.game.game_mode, snapshot?.myCurrentAction, snapshot?.currentRoundResult?.id, snapshot?.game.id, snapshot?.game.current_round, snapshot?.me?.id])

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
          await acknowledgeReveal(gameId)
          await refreshSnapshot(gameId, playerId)
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

  async function refreshSnapshot(gameId: string, playerId: string) {
    const nextSnapshot = await fetchGameSnapshot(gameId, playerId)
    setSnapshot(nextSnapshot)

    return nextSnapshot
  }

  async function settleVsBotRound(gameId: string, playerId: string, roundNumber: number) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await maybeResolveRound(gameId, roundNumber)
      } catch {
        // Keep retrying locally; the edge function is idempotent.
      }

      const nextSnapshot = await refreshSnapshot(gameId, playerId)

      if (nextSnapshot.currentRoundResult) {
        return nextSnapshot
      }

      await new Promise((resolve) => window.setTimeout(resolve, 200))
    }

    return refreshSnapshot(gameId, playerId)
  }

  async function startNewGame(mode: 'PVP' | 'VS_BOT', playerName: string, difficulty = botDifficulty) {
    if (!playerName.trim()) {
      setErrorMessage('Inserisci un nickname.')

      return
    }

    setIsBusy(true)
    setBusyAction(mode === 'VS_BOT' ? 'CREATE_BOT' : 'CREATE')
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const playerId = createPlayerId()
      const created = mode === 'VS_BOT'
        ? await createVsBotGame({ nickname: playerName, playerId, difficulty })
        : await createGame({ nickname: playerName, playerId })
      saveStoredSession({ playerId, gameId: created.game.id, roomCode: created.game.room_code })
      setSnapshot(created)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : mode === 'VS_BOT' ? 'Impossibile creare la partita contro il bot.' : 'Impossibile creare la partita.')
    } finally {
      setIsBusy(false)
      setBusyAction(null)
    }
  }

  async function handleCreateGame() {
    await startNewGame('PVP', nickname)
  }

  async function handleCreateBotGame() {
    await startNewGame('VS_BOT', nickname, botDifficulty)
  }

  async function handleNewMatch() {
    if (!snapshot?.me) {
      handleLeaveSession()
      return
    }

    const playerName = snapshot.me.nickname
    setNickname(playerName)
    await startNewGame(snapshot.game.game_mode, playerName, snapshot.game.bot_difficulty)
  }

  async function handleJoinGame() {
    if (!nickname.trim()) {
      setErrorMessage('Inserisci un nickname.')

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
      const joined = await joinGame({ roomCode, nickname, playerId })
      saveStoredSession({ playerId, gameId: joined.game.id, roomCode: joined.game.room_code })
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
      await submitRoundAction({
        gameId: snapshot.game.id,
        roundNumber: snapshot.game.current_round,
        playerId: snapshot.me.id,
        trait,
        actionType,
      })

      const submittedSnapshot = await refreshSnapshot(snapshot.game.id, snapshot.me.id)

      if (submittedSnapshot.game.game_mode === 'VS_BOT') {
        await settleVsBotRound(submittedSnapshot.game.id, submittedSnapshot.me?.id ?? snapshot.me.id, submittedSnapshot.game.current_round)
        return true
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
      await advanceToNextRound(snapshot.game.id)
      await refreshSnapshot(snapshot.game.id, snapshot.me.id)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossibile passare al round successivo.')
    } finally {
      setIsBusy(false)
    }
  }

  function handleLeaveSession() {
    clearStoredSession()
    setSnapshot(null)
    setRoomCode('')
    setStatusMessage('Sessione locale rimossa.')
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
      {isLoading ? (
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
      ) : (
        <section className={`panel app-panel ${isGamePresentation ? 'app-panel--game' : ''} ${snapshot ? 'app-panel--session' : ''} ${!snapshot ? 'app-panel--home' : ''}`}>
          {!snapshot ? (
            <HomeScreen
              nickname={nickname}
               roomCode={roomCode}
               botDifficulty={botDifficulty}
              isOnline={isOnline}
              errorMessage={errorMessage}
              statusMessage={statusMessage}
              isBusy={isBusy}
              busyAction={busyAction}
              onNicknameChange={setNickname}
               onRoomCodeChange={(value) => setRoomCode(value.toUpperCase())}
               onBotDifficultyChange={setBotDifficulty}
              onCreateGame={() => void handleCreateGame()}
              onCreateBotGame={() => void handleCreateBotGame()}
              onJoinGame={() => void handleJoinGame()}
              onLeaveSession={handleLeaveSession}
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
            />
          ) : resultViewModel ? (
            <MatchResultScreen
              viewModel={resultViewModel}
              onLeaveSession={handleLeaveSession}
              onNewGame={() => void handleNewMatch()}
              isBusy={isBusy}
              errorMessage={errorMessage}
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
        viewModel={viewModel}
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
