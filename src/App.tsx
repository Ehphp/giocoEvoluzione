import { useEffect, useMemo, useState } from 'react'

import './App.css'
import { HomeScreen } from './components/home/HomeScreen'
import { GeneSelectionScreenV2 } from './components/game-v2/GeneSelectionScreenV2'
import { useGeneSelectionV2Controller } from './components/game-v2/controller/useGeneSelectionV2Controller'
import { ActionDock } from './components/game/ActionDock'
import { ChoosingDuelHeader } from './components/game/ChoosingDuelHeader'
import { RoundEventCard } from './components/game/RoundEventCard'
import { TraitSelector } from './components/game/TraitSelector'
import { TOTAL_ROUNDS, TRAIT_LABELS } from './game/config'
import { getTraitRoundValue, isTraitUsable } from './game/engine'
import { getRoundEventById } from './game/round-events'
import { getRoundExplanation } from './game/round-result-explainer'
import {
  getRoundEventLabel,
  getRoundEventPressures,
} from './game/ui-context'
import { TRAIT_CATALOG } from './game/traits-catalog'
import { TRAITS, type RoundEventDefinition, type RoundValueBreakdown, type TraitCollection, type TraitType } from './game/types'
import { hasSupabaseConfig } from './lib/supabase'
import {
  acknowledgeReveal,
  advanceToNextRound,
  createGame,
  createVsBotGame,
  fetchGameSnapshot,
  joinGame,
  maybeResolveRound,
  restoreGameSession,
  subscribeToGame,
  submitRoundAction,
  type GameSnapshot,
  type PlayerRecord,
  type RoundResultRecord,
} from './lib/game-api'
import { clearStoredSession, createPlayerId, loadStoredSession, saveStoredSession } from './lib/storage'

type PendingAction = 'USE' | 'EVOLVE' | null
type BusyAction = 'CREATE' | 'CREATE_BOT' | 'JOIN' | null

type ResolutionData = {
  awardedPoints?: number
  player1PointsAwarded?: number
  player2PointsAwarded?: number
  player1Action?: { trait: TraitType; actionType: 'USE' | 'EVOLVE'; playerId: string }
  player2Action?: { trait: TraitType; actionType: 'USE' | 'EVOLVE'; playerId: string }
  player1Breakdown?: RoundValueBreakdown
  player2Breakdown?: RoundValueBreakdown
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

function isTransientChoosingStatusMessage(message: string | null): boolean {
  return message === 'Sessione ripristinata.' || message === 'Scelta confermata. In attesa dell avversario.'
}

const isGeneSelectionV2Enabled = import.meta.env.VITE_GENE_SELECTION_V2 === 'true'

function App() {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)
  const [nickname, setNickname] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [selectedTrait, setSelectedTrait] = useState<TraitType | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
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
  }, [snapshot?.actionsSubmitted, snapshot?.game.status, snapshot?.currentRoundResult?.id, snapshot?.game.id, snapshot?.game.current_round, snapshot?.me?.id])

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
    setSelectedTrait(null)
    setPendingAction(null)
  }, [snapshot?.game.current_round, snapshot?.game.status])

  const myTraits = snapshot?.me?.traits ?? null
  const myScore = snapshot ? getPlayerScore(snapshot, snapshot.me) : 0
  const opponentScore = snapshot ? getPlayerScore(snapshot, snapshot.opponent) : 0
  const isChoosingScreen = snapshot?.game.status === 'CHOOSING'
  const resolutionData = useMemo(
    () => (snapshot?.currentRoundResult?.resolution_data as ResolutionData | undefined) ?? undefined,
    [snapshot?.currentRoundResult?.resolution_data],
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

  async function handleCreateGame() {
    if (!nickname.trim()) {
      setErrorMessage('Inserisci un nickname.')

      return
    }

    setIsBusy(true)
    setBusyAction('CREATE')
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const playerId = createPlayerId()
      const created = await createGame({ nickname, playerId })
      saveStoredSession({ playerId, gameId: created.game.id, roomCode: created.game.room_code })
      setSnapshot(created)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossibile creare la partita.')
    } finally {
      setIsBusy(false)
      setBusyAction(null)
    }
  }

  async function handleCreateBotGame() {
    if (!nickname.trim()) {
      setErrorMessage('Inserisci un nickname.')

      return
    }

    setIsBusy(true)
    setBusyAction('CREATE_BOT')
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const playerId = createPlayerId()
      const created = await createVsBotGame({ nickname, playerId })
      saveStoredSession({ playerId, gameId: created.game.id, roomCode: created.game.room_code })
      setSnapshot(created)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossibile creare la partita contro il bot.')
    } finally {
      setIsBusy(false)
      setBusyAction(null)
    }
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

  async function handleSubmitAction(actionType: 'USE' | 'EVOLVE', traitOverride?: TraitType): Promise<boolean> {
    const traitToSubmit = traitOverride ?? selectedTrait

    if (!snapshot?.me || !traitToSubmit || !myTraits) {
      return false
    }

    if (actionType === 'USE' && !isTraitUsable(myTraits, traitToSubmit)) {
      setErrorMessage('Questo tratto e in cooldown e non puo essere usato in questo round.')

      return false
    }

    setIsBusy(true)
    setErrorMessage(null)
    setStatusMessage(null)
    setPendingAction(actionType)

    try {
      await submitRoundAction({
        gameId: snapshot.game.id,
        roundNumber: snapshot.game.current_round,
        playerId: snapshot.me.id,
        trait: traitToSubmit,
        actionType,
      })

      const submittedSnapshot = await refreshSnapshot(snapshot.game.id, snapshot.me.id)

      if (submittedSnapshot.game.game_mode === 'VS_BOT') {
        await settleVsBotRound(submittedSnapshot.game.id, submittedSnapshot.me?.id ?? snapshot.me.id, submittedSnapshot.game.current_round)
        setStatusMessage('Scelta confermata. Il bot sta completando il round.')
        return true
      }

      setStatusMessage('Scelta confermata. In attesa dell avversario.')
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
    setSelectedTrait(null)
    setPendingAction(null)
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
    <main className={`shell ${isChoosingScreen ? 'shell--game' : ''} ${!snapshot ? 'shell--home' : ''}`}>
      {isLoading ? (
        <section className="panel centered-panel home-state-panel" aria-live="polite" aria-busy="true">
          <span className="eyebrow">Connessione alla partita</span>
          <h1>Gioco Evoluzione</h1>
          <p className="lead">Preparazione sessione multiplayer in corso...</p>
        </section>
      ) : !hasSupabaseConfig ? (
        <section className="panel intro-panel home-state-panel">
          <span className="eyebrow">MVP multiplayer 1v1</span>
          <h1>Gioco Evoluzione</h1>
          <p className="lead">
            L app e pronta, ma per il multiplayer serve configurare Supabase prima di poter creare o entrare in una stanza.
          </p>
          <div className="message warning" role="alert" aria-live="assertive">
            Imposta <strong>VITE_SUPABASE_URL</strong> e <strong>VITE_SUPABASE_ANON_KEY</strong>, poi applica lo schema SQL e deploya la funzione <strong>resolve-round</strong>.
          </div>
        </section>
      ) : (
        <section className={`panel app-panel ${isChoosingScreen ? 'app-panel--game' : ''} ${!snapshot ? 'app-panel--home' : ''}`}>
          {!snapshot ? (
            <HomeScreen
              nickname={nickname}
              roomCode={roomCode}
              isOnline={isOnline}
              errorMessage={errorMessage}
              statusMessage={statusMessage}
              isBusy={isBusy}
              busyAction={busyAction}
              onNicknameChange={setNickname}
              onRoomCodeChange={(value) => setRoomCode(value.toUpperCase())}
              onCreateGame={() => void handleCreateGame()}
              onCreateBotGame={() => void handleCreateBotGame()}
              onJoinGame={() => void handleJoinGame()}
              onLeaveSession={handleLeaveSession}
            />
          ) : snapshot.game.status === 'WAITING' ? (
            <>
              <header className="topbar">
                <div>
                  <span className="eyebrow">MVP multiplayer 1v1</span>
                  <h1>Gioco Evoluzione</h1>
                </div>
                <button type="button" className="ghost-button" onClick={handleLeaveSession}>
                  Esci
                </button>
              </header>

              {!isOnline ? <div className="message warning">Connessione offline. La sincronizzazione riprende appena torna la rete.</div> : null}
              {errorMessage ? <div className="message error">{errorMessage}</div> : null}
              {statusMessage ? <div className="message success">{statusMessage}</div> : null}

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
                  <strong>{snapshot.me?.nickname}</strong> e pronto.
                  <p>In attesa dell avversario...</p>
                </div>
              </section>
            </>
          ) : snapshot.game.status === 'CHOOSING' ? (
            isGeneSelectionV2Enabled ? (
              <ConnectedGeneSelectionScreenV2
                snapshot={snapshot}
                myScore={myScore}
                opponentScore={opponentScore}
                onSubmitAction={handleSubmitAction}
                onLeaveSession={handleLeaveSession}
              />
            ) : (
              <GameScreen
                snapshot={snapshot}
                myTraits={myTraits}
                myScore={myScore}
                opponentScore={opponentScore}
                selectedTrait={selectedTrait}
                onSelectTrait={setSelectedTrait}
                onUse={() => void handleSubmitAction('USE')}
                onEvolve={() => void handleSubmitAction('EVOLVE')}
                isBusy={isBusy}
                pendingAction={pendingAction}
                isOnline={isOnline}
                errorMessage={errorMessage}
                statusMessage={statusMessage}
                onLeaveSession={handleLeaveSession}
              />
            )
          ) : snapshot.game.status === 'REVEALING' || snapshot.game.status === 'ROUND_RESULT' ? (
            <>
              <header className="topbar">
                <div>
                  <span className="eyebrow">MVP multiplayer 1v1</span>
                  <h1>Gioco Evoluzione</h1>
                </div>
                <button type="button" className="ghost-button" onClick={handleLeaveSession}>
                  Esci
                </button>
              </header>

              {!isOnline ? <div className="message warning">Connessione offline. La sincronizzazione riprende appena torna la rete.</div> : null}
              {errorMessage ? <div className="message error">{errorMessage}</div> : null}
              {statusMessage ? <div className="message success">{statusMessage}</div> : null}

              <RoundResultScreen
                snapshot={snapshot}
                resolutionData={resolutionData}
                onContinue={() => void handleAdvanceRound()}
                isBusy={isBusy}
              />
            </>
          ) : (
            <>
              <header className="topbar">
                <div>
                  <span className="eyebrow">MVP multiplayer 1v1</span>
                  <h1>Gioco Evoluzione</h1>
                </div>
                <button type="button" className="ghost-button" onClick={handleLeaveSession}>
                  Esci
                </button>
              </header>

              {!isOnline ? <div className="message warning">Connessione offline. La sincronizzazione riprende appena torna la rete.</div> : null}
              {errorMessage ? <div className="message error">{errorMessage}</div> : null}
              {statusMessage ? <div className="message success">{statusMessage}</div> : null}

              <FinalScreen snapshot={snapshot} myScore={myScore} opponentScore={opponentScore} result={snapshot.currentRoundResult} />
            </>
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
  onSubmitAction: (actionType: 'USE' | 'EVOLVE', traitOverride?: TraitType) => Promise<boolean>
  onLeaveSession: () => void
}

function ConnectedGeneSelectionScreenV2({ snapshot, myScore, opponentScore, onSubmitAction, onLeaveSession }: ConnectedGeneSelectionScreenV2Props) {
  const { viewModel, onSelectGene, onUseGene, onEvolveGene } = useGeneSelectionV2Controller({
    snapshot,
    myScore,
    opponentScore,
    onSubmitAction: async (trait, actionType) => {
      return onSubmitAction(actionType, trait)
    },
  })

  return (
    <GeneSelectionScreenV2
      viewModel={viewModel}
      onSelectGene={onSelectGene}
      onUseGene={onUseGene}
      onEvolveGene={onEvolveGene}
      onLeaveSession={onLeaveSession}
    />
  )
}

type GameScreenProps = {
  snapshot: GameSnapshot
  myTraits: TraitCollection | null
  myScore: number
  opponentScore: number
  selectedTrait: TraitType | null
  onSelectTrait: (trait: TraitType) => void
  onUse: () => void
  onEvolve: () => void
  isBusy: boolean
  pendingAction: PendingAction
  isOnline: boolean
  errorMessage: string | null
  statusMessage: string | null
  onLeaveSession: () => void
}

function GameScreen({
  snapshot,
  myTraits,
  myScore,
  opponentScore,
  selectedTrait,
  onSelectTrait,
  onUse,
  onEvolve,
  isBusy,
  pendingAction,
  isOnline,
  errorMessage,
  statusMessage,
  onLeaveSession,
}: GameScreenProps) {
  const myActionSubmitted = Boolean(snapshot.myCurrentAction)
  const selectedTraitState = selectedTrait && myTraits ? myTraits[selectedTrait] : null
  const currentRoundEvent = snapshot.currentRoundEvent
  const roundEventLabel = getRoundEventLabel(currentRoundEvent)
  const roundEventPressures = getRoundEventPressures(currentRoundEvent)
  const primaryThreats = [...roundEventPressures].sort((a, b) => b.score - a.score).slice(0, 3)
  const selectedTraitLabel = selectedTrait ? getTraitLabel(selectedTrait) : null
  const selectedTraitDescription = selectedTrait ? TRAIT_CATALOG[selectedTrait].description : null
  const selectedTraitLevel = selectedTraitState?.level ?? null
  const useValue = selectedTrait && myTraits && currentRoundEvent
    ? getTraitRoundValue(currentRoundEvent, myTraits, selectedTrait)
    : null
  const evolveNextLevel = selectedTraitState ? selectedTraitState.level + 1 : null
  const roundEventBrief = currentRoundEvent?.shortDescription ?? 'L evento del round richiede una risposta adattiva rapida.'
  const mySelectionStatus = myActionSubmitted ? 'Scelta effettuata' : 'Sta scegliendo'
  const myName = snapshot.me?.nickname ?? 'Tu'
  const opponentName = snapshot.opponent?.nickname ?? 'Rivale'
  const opponentSelectionStatus = !snapshot.opponent
    ? 'In attesa'
    : snapshot.actionsSubmitted >= 2 || (!myActionSubmitted && snapshot.actionsSubmitted === 1)
      ? 'Scelta effettuata'
      : 'Sta scegliendo'
  const choosingSystemMessage = errorMessage
    ? errorMessage
    : !isOnline
      ? 'Connessione assente: la sincronizzazione riparte appena torna la rete.'
      : myActionSubmitted
        ? `Scelta inviata · azioni ricevute ${snapshot.actionsSubmitted}/2`
        : statusMessage && !isTransientChoosingStatusMessage(statusMessage)
          ? statusMessage
          : null
  const actionHelper = !selectedTrait
    ? 'Tocca un gene, poi scegli USE o EVOLVE'
    : selectedTraitState?.cooldown
      ? 'USE è bloccato dal cooldown, EVOLVE resta disponibile'
      : 'USE applica effetto ora, EVOLVE aumenta il livello per i prossimi round'
  const submittedTitle = snapshot.myCurrentAction ? 'Scelta inviata' : pendingAction ? 'Invio in corso' : null
  const submittedActionType = snapshot.myCurrentAction?.action_type ?? pendingAction
  const submittedTraitLabel = snapshot.myCurrentAction ? getTraitLabel(snapshot.myCurrentAction.trait) : selectedTraitLabel
  const submittedProgressLabel = myActionSubmitted ? `${snapshot.actionsSubmitted}/2` : pendingAction ? 'Invio...' : null
  const waitingDetail = myActionSubmitted
    ? `In attesa dell’avversario · ${snapshot.actionsSubmitted}/2`
    : 'Sincronizzazione scelta'

  return (
    <section className="game-screen">
      <ChoosingDuelHeader
        myName={myName}
        opponentName={opponentName}
        myScore={myScore}
        opponentScore={opponentScore}
        roundNumber={snapshot.game.current_round}
        totalRounds={TOTAL_ROUNDS}
        myStatus={mySelectionStatus}
        opponentStatus={opponentSelectionStatus}
        actionsSubmitted={snapshot.actionsSubmitted}
        isOnline={isOnline}
        opponentConnected={snapshot.opponent?.connected ?? false}
        onLeaveSession={onLeaveSession}
      />

      <RoundEventCard
        roundEvent={currentRoundEvent}
        eventLabel={roundEventLabel}
        description={roundEventBrief}
      />

      <section className="choosing-intro" aria-label="Obiettivo del round">
        <h2>Scegli un gene</h2>
        <p>Confronta tutti i geni, apri il dettaglio del selezionato e invia una sola scelta.</p>
        {choosingSystemMessage ? (
          <p className={`choosing-intro__system ${errorMessage ? 'is-error' : !isOnline ? 'is-warning' : ''}`} aria-live="polite">
            {choosingSystemMessage}
          </p>
        ) : null}
        <div className="choosing-intro__tags" aria-label="Pressioni principali dell ambiente">
          {primaryThreats.map((threat) => (
            <span key={threat.id} className="choosing-intro__tag">
              {threat.label}
            </span>
          ))}
        </div>
      </section>

      <div className="game-main-scroll game-main-scroll--choosing">
        {myTraits ? (
          <TraitSelector
            traits={Object.fromEntries(TRAITS.map((trait) => [trait, myTraits[trait]])) as TraitCollection}
            selectedTrait={selectedTrait}
            currentRoundEvent={currentRoundEvent}
            onSelectTrait={onSelectTrait}
            isSubmitted={myActionSubmitted || Boolean(pendingAction)}
          />
        ) : null}
      </div>

      <ActionDock
        isBusy={isBusy}
        pendingAction={pendingAction}
        hasSelection={Boolean(selectedTrait)}
        useDisabled={isBusy || myActionSubmitted || !selectedTrait || Boolean(selectedTraitState?.cooldown)}
        evolveDisabled={isBusy || myActionSubmitted || !selectedTrait}
        onUse={onUse}
        onEvolve={onEvolve}
        selectedTraitLabel={selectedTraitLabel}
        selectedTraitDescription={selectedTraitDescription}
        selectedTraitLevel={selectedTraitLevel}
        nextTraitLevel={evolveNextLevel}
        useDetail={selectedTrait && useValue !== null ? `USA — ottieni ${useValue}` : 'USA — ottieni n/d'}
        evolveDetail={selectedTrait ? `EVOLVI — passa al livello ${evolveNextLevel}` : 'EVOLVI — passa al livello n/d'}
        useBlockedReason={selectedTraitState?.cooldown ? 'USE disabilitato: gene in cooldown per questo round.' : null}
        helperText={actionHelper}
        submittedTitle={submittedTitle ?? 'Scelta effettuata'}
        submittedActionType={submittedActionType}
        submittedTraitLabel={submittedTraitLabel}
        submittedProgressLabel={submittedProgressLabel}
        isSubmitted={myActionSubmitted || Boolean(pendingAction)}
        waitingDetail={waitingDetail}
      />
    </section>
  )
}

type RoundResultScreenProps = {
  snapshot: GameSnapshot
  resolutionData: ResolutionData | undefined
  onContinue: () => void
  isBusy: boolean
}

function RoundResultScreen({ snapshot, resolutionData, onContinue, isBusy }: RoundResultScreenProps) {
  const result = snapshot.currentRoundResult
  const roundEvent = snapshot.currentRoundEvent
  const roundEventLabel = getRoundEventLabel(roundEvent)
  const [animationPhase, setAnimationPhase] = useState(snapshot.game.status === 'REVEALING' ? 0 : 3)
  const iAmPlayer1 = snapshot.me?.slot === 1
  const winnerNickname = snapshot.players.find((player) => player.id === result?.winner_id)?.nickname ?? null
  const player1Action = resolutionData?.player1Action
  const player2Action = resolutionData?.player2Action
  const player1Breakdown = resolutionData?.player1Breakdown
  const player2Breakdown = resolutionData?.player2Breakdown
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

  function skipRevealAnimation() {
    setAnimationPhase(3)
  }

  return (
    <section className="round-result-screen" aria-label="Risultato del round" onPointerDown={skipRevealAnimation}>
      <div className={`round-result-hero ${snapshot.game.status === 'REVEALING' ? 'is-revealing' : ''}`}>
        <span className="eyebrow">Round {snapshot.game.current_round} · {roundEventLabel}</span>
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
        {animationPhase < 3 ? <small className="round-result-hero__skip">Tocca per saltare l animazione</small> : null}
      </div>

      <div className={`round-result-cards ${animationPhase < 2 ? 'is-hidden' : ''}`}>
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

      <div className="button-row">
        <button type="button" className="primary-button" onClick={onContinue} disabled={isBusy || snapshot.game.status === 'REVEALING'}>
          {continueLabel}
        </button>
      </div>
    </section>
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
  const actionLabel = action?.actionType ?? 'N/D'
  const traitLabel = action ? getTraitLabel(action.trait) : 'N/D'

  return (
    <article className={`round-breakdown-card ${isMe ? 'round-breakdown-card--me' : ''}`}>
      <header>
        <span className="eyebrow">{title}</span>
        <strong>{traitLabel}</strong>
        <small>Azione: {actionLabel}</small>
      </header>

      {breakdown ? (
        <div className={`round-breakdown-card__math ${showContributions ? '' : 'is-hidden'}`}>
          <p>Effetti evento {roundEventLabel}: {breakdown.eventModifierTotal} × {breakdown.eventWeight} = {breakdown.eventContribution}</p>
          <p>Livello: +{breakdown.levelContribution}</p>
          {breakdown.originalLevel > breakdown.effectiveLevel ? (
            <p>Livello posseduto: {breakdown.originalLevel} · Livello effettivo: {breakdown.effectiveLevel}</p>
          ) : (
            <p>Livello effettivo: {breakdown.effectiveLevel}</p>
          )}
        </div>
      ) : (
        <p className="round-breakdown-card__legacy">Dettaglio calcolo non disponibile per questo risultato storico.</p>
      )}

      <footer>
        <strong className={showTotal ? 'is-highlighted' : ''}>Totale: {total}</strong>
        <span>Punti round: +{awardedPoints}</span>
      </footer>
    </article>
  )
}

function FinalScreen({
  snapshot,
  myScore,
  opponentScore,
  result,
}: {
  snapshot: GameSnapshot
  myScore: number
  opponentScore: number
  result: RoundResultRecord | null
}) {
  const winnerNickname = snapshot.players.find((player) => player.id === snapshot.game.winner_id)?.nickname ?? null
  const resolutionData = (result?.resolution_data as ResolutionData | undefined) ?? undefined
  const iAmPlayer1 = snapshot.me?.slot === 1
  const player1Action = resolutionData?.player1Action
  const player2Action = resolutionData?.player2Action
  const player1Breakdown = resolutionData?.player1Breakdown
  const player2Breakdown = resolutionData?.player2Breakdown
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
  const roundEventFromResult = result
    ? getRoundEventFromSequence(snapshot.game.round_event_sequence, result.round_number)
    : null
  const roundEventLabel = getRoundEventLabel(roundEventFromResult)
  const explanation = getRoundExplanation({
    roundEventTitle: roundEventFromResult?.title ?? null,
    meWon: result?.winner_id ? result.winner_id === snapshot.me?.id : null,
    meActionType: myResolvedAction?.actionType ?? null,
    opponentActionType: opponentResolvedAction?.actionType ?? null,
    myBreakdown,
    opponentBreakdown,
  })

  return (
    <section className="stack-lg">
      <Scoreboard snapshot={snapshot} myScore={myScore} opponentScore={opponentScore} />

      <div className="final-card">
        <span className="eyebrow">Partita conclusa</span>
        <h2>{winnerNickname ? `${winnerNickname} vince la partita` : 'Pareggio finale'}</h2>
        <p>
          Punteggio finale: {myScore} - {opponentScore}
        </p>
        <p>Durata: {snapshot.game.started_at && snapshot.game.finished_at ? formatDuration(snapshot.game.started_at, snapshot.game.finished_at) : 'n/d'}</p>
      </div>

      {result ? (
        <section className="final-round-recap" aria-label="Dettaglio ultimo round">
          <header className="final-round-recap__header">
            <span className="eyebrow">Ultimo round</span>
            <strong>Round {result.round_number} · {roundEventLabel}</strong>
          </header>

          <div className="round-result-cards">
            <RoundBreakdownCard
              title={snapshot.me?.nickname ?? 'Tu'}
              action={myResolvedAction}
              breakdown={myBreakdown}
              total={myRoundValue}
              awardedPoints={myRoundPoints}
              roundEventLabel={roundEventLabel}
              showContributions
              showTotal
              isMe
            />
            <RoundBreakdownCard
              title={snapshot.opponent?.nickname ?? 'Avversario'}
              action={opponentResolvedAction}
              breakdown={opponentBreakdown}
              total={opponentRoundValue}
              awardedPoints={opponentRoundPoints}
              roundEventLabel={roundEventLabel}
              showContributions
              showTotal
            />
          </div>

          <p className="round-result-explanation">{explanation}</p>
        </section>
      ) : null}

      {result ? (
        <div className="status-card">
          Ultimo round registrato alle {new Date(result.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}.
        </div>
      ) : null}
    </section>
  )
}

function Scoreboard({ snapshot, myScore, opponentScore }: { snapshot: GameSnapshot; myScore: number; opponentScore: number }) {
  return (
    <div className="scoreboard">
      <div>
        <span className="eyebrow">Tu</span>
        <strong>{snapshot.me?.nickname ?? '-'}</strong>
        <span>{myScore} pt</span>
      </div>
      <div>
        <span className="eyebrow">Avversario</span>
        <strong>{snapshot.opponent?.nickname ?? 'In attesa'}</strong>
        <span>{opponentScore} pt</span>
      </div>
    </div>
  )
}

function formatDuration(startedAt: string, finishedAt: string): string {
  const elapsedMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime()

  if (elapsedMs <= 0) {
    return 'meno di 1 minuto'
  }

  const totalMinutes = Math.max(1, Math.round(elapsedMs / 60000))

  return `${totalMinutes} min`
}

function getRoundEventFromSequence(eventSequence: string[], roundNumber: number): RoundEventDefinition | null {
  const eventId = eventSequence[roundNumber - 1]

  if (!eventId) {
    return null
  }

  try {
    return getRoundEventById(eventId)
  } catch {
    return null
  }
}

export default App
