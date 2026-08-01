import { useState } from 'react'

import { TRAIT_LABELS } from '../../game/config'
import { getGeneAssetByTrait } from '../game-v2/gameSelectionAssets'
import { getResultActionLabel } from './buildMatchResultViewModel'
import type { MatchResultOutcome, MatchResultRound, MatchResultViewModel, ResultAction, ResultRoundParticipant } from './types'
import type { MatchRewardRecord, PlayerCreatureRecord } from '../../lib/profile-api'
import { getExperienceProgress, PROGRESSION } from '../../lib/progression'

import './MatchResultScreen.css'

type MatchResultScreenProps = {
    viewModel: MatchResultViewModel
    onLeaveSession: () => void
    onNewGame: () => void
    isBusy?: boolean
    errorMessage?: string | null
    reward?: MatchRewardRecord | null
    creature?: PlayerCreatureRecord | null
}

function outcomeCopy(outcome: MatchResultOutcome) {
    if (outcome === 'win') {
        return { title: 'HAI VINTO!', label: 'Vittoria' }
    }

    if (outcome === 'loss') {
        return { title: 'HAI PERSO', label: 'Sconfitta' }
    }

    return { title: 'PAREGGIO', label: 'Pareggio' }
}

function opposingOutcome(outcome: MatchResultOutcome): MatchResultOutcome {
    if (outcome === 'win') return 'loss'
    if (outcome === 'loss') return 'win'
    return 'draw'
}

function Avatar({ name, creatureUrl }: { name: string; creatureUrl: string }) {
    return (
        <span className="match-result-avatar" role="img" aria-label={`Creatura di ${name}`}>
            <img src={creatureUrl} alt="" />
        </span>
    )
}

function ResultHud({ viewModel, onLeaveSession }: Pick<MatchResultScreenProps, 'viewModel' | 'onLeaveSession'>) {
    const playerResult = outcomeCopy(viewModel.outcome)
    const opponentResult = outcomeCopy(opposingOutcome(viewModel.outcome))

    return (
        <header className="match-result-hud" aria-label="Risultato finale della partita">
            <article className="match-result-hud__player match-result-hud__player--me">
                <Avatar name={viewModel.player.name} creatureUrl={viewModel.player.creature.src} />
                <div className="match-result-hud__copy">
                    <span>TU</span>
                    <strong title={viewModel.player.name}>{viewModel.player.name}</strong>
                    <small className={`is-${viewModel.outcome}`}>{playerResult.label}</small>
                </div>
                <span className="match-result-hud__score" aria-label={`Punteggio finale ${viewModel.player.score}`}>
                    <b>{viewModel.player.score}</b>
                    {viewModel.player.tiebreakTotal !== null ? <small>TB {viewModel.player.tiebreakTotal}</small> : null}
                </span>
            </article>
            <div className="match-result-hud__round" aria-label={`Round conclusivo ${viewModel.finalRoundNumber} di ${viewModel.totalRounds}`}>
                <span>ROUND</span>
                <strong>{viewModel.finalRoundNumber}/{viewModel.totalRounds}</strong>
            </div>
            <article className="match-result-hud__player match-result-hud__player--opponent">
                <span className="match-result-hud__score" aria-label={`Punteggio finale ${viewModel.opponent.score}`}>
                    <b>{viewModel.opponent.score}</b>
                    {viewModel.opponent.tiebreakTotal !== null ? <small>TB {viewModel.opponent.tiebreakTotal}</small> : null}
                </span>
                <div className="match-result-hud__copy">
                    <span>AVVERSARIO</span>
                    <strong title={viewModel.opponent.name}>{viewModel.opponent.name}</strong>
                    <small className={`is-${opposingOutcome(viewModel.outcome)}`}>{opponentResult.label}</small>
                </div>
                <Avatar name={viewModel.opponent.name} creatureUrl={viewModel.opponent.creature.src} />
            </article>
            <button type="button" className="match-result-hud__leave" onClick={onLeaveSession} aria-label="Esci dalla partita">×</button>
        </header>
    )
}

function CalculationDetails({ action, participant, eventLabel, open, onToggle, id }: {
    action: ResultAction | null
    participant: ResultRoundParticipant
    eventLabel: string | null
    open: boolean
    onToggle: () => void
    id: string
}) {
    return (
        <div className="result-calculation">
            <button type="button" className="result-calculation__toggle" aria-expanded={open} aria-controls={id} onClick={onToggle}>
                <span>{open ? 'Nascondi calcolo' : 'Dettaglio calcolo'}</span><b aria-hidden="true">⌄</b>
            </button>
            {open ? (
                <div id={id} className="result-calculation__content">
                    {participant.breakdown ? (
                        action?.actionType === 'EVOLVE' ? (
                            <p>EVOLVI: valore fisso {participant.breakdown.total}. Affinità e vantaggio naturale non si applicano.</p>
                        ) : (
                            <dl>
                                <div><dt>Uso base</dt><dd>+{participant.breakdown.baseContribution}</dd></div>
                                <div><dt>Evento{eventLabel ? ` · ${eventLabel}` : ''}</dt><dd>+{participant.breakdown.eventModifier}</dd></div>
                                <div><dt>Livello</dt><dd>+{participant.breakdown.levelContribution}</dd></div>
                                <div><dt>Vantaggio naturale</dt><dd>+{participant.breakdown.matchupBonus}</dd></div>
                            </dl>
                        )
                    ) : <p>Dettaglio calcolo non disponibile per questo risultato storico.</p>}
                </div>
            ) : null}
        </div>
    )
}

function ResultRoundCard({ side, round, participant, open, onToggle }: {
    side: 'player' | 'opponent'
    round: MatchResultRound
    participant: ResultRoundParticipant
    open: boolean
    onToggle: () => void
}) {
    const action = participant.action
    const title = side === 'player' ? 'TU' : 'AVVERSARIO'
    const detailId = `result-round-${round.id}-${side}`

    return (
        <article className={`result-round-card result-round-card--${side}`}>
            <header>
                <span>{title}</span>
                <div>
                    {action ? <img src={getGeneAssetByTrait(action.trait)} alt="" aria-hidden="true" /> : null}
                    <strong>{action ? TRAIT_LABELS[action.trait] : 'Dati non disponibili'}</strong>
                </div>
                <small>Azione: {action ? (action.actionType === 'USE' ? 'USA' : 'EVOLVI') : 'n/d'}</small>
            </header>
            <CalculationDetails action={action} participant={participant} eventLabel={round.eventLabel} open={open} onToggle={onToggle} id={detailId} />
            <footer>
                <strong>{participant.value} valore</strong>
                <span>{participant.points === null ? 'Punti n/d' : `+${participant.points} punti`}</span>
            </footer>
        </article>
    )
}

function LastRound({ round }: { round: MatchResultRound }) {
    const [openDetail, setOpenDetail] = useState<'player' | 'opponent' | null>(null)

    return (
        <section className="match-result-last-round" aria-labelledby="last-round-heading">
            <header className="match-result-section-heading">
                <span aria-hidden="true" />
                <div><small>ROUND {round.number}</small><h2 id="last-round-heading">Ultimo round</h2>{round.eventLabel ? <p>{round.eventLabel}</p> : null}</div>
                <span aria-hidden="true" />
            </header>
            <div className="match-result-last-round__cards">
                <ResultRoundCard side="player" round={round} participant={round.player} open={openDetail === 'player'} onToggle={() => setOpenDetail((current) => current === 'player' ? null : 'player')} />
                <ResultRoundCard side="opponent" round={round} participant={round.opponent} open={openDetail === 'opponent'} onToggle={() => setOpenDetail((current) => current === 'opponent' ? null : 'opponent')} />
            </div>
            <p className="match-result-last-round__explanation">{round.explanation}</p>
        </section>
    )
}

function HistoryRow({ round, open, onToggle }: { round: MatchResultRound; open: boolean; onToggle: () => void }) {
    const outcome = outcomeCopy(round.outcome)

    return (
        <li className={`match-result-history__item is-${round.outcome}`}>
            <button type="button" className="match-result-history__row" aria-expanded={open} aria-controls={`round-history-${round.id}`} onClick={onToggle}>
                <span className="match-result-history__number">Round {round.number}</span>
                <span className="match-result-history__outcome">{outcome.label}</span>
                <span className="match-result-history__move"><b>Tu</b> {getResultActionLabel(round.player.action)} <strong>{round.player.value}</strong></span>
                <span className="match-result-history__move"><b>Avversario</b> {getResultActionLabel(round.opponent.action)} <strong>{round.opponent.value}</strong></span>
                <span className="match-result-history__points">{round.player.points === null ? 'n/d' : `+${round.player.points}`}</span>
                <span className="match-result-history__chevron" aria-hidden="true">›</span>
            </button>
            {open ? <div id={`round-history-${round.id}`} className="match-result-history__detail"><p>{round.explanation}</p><CalculationDetails action={round.player.action} participant={round.player} eventLabel={round.eventLabel} open={true} onToggle={onToggle} id={`round-history-detail-${round.id}`} /></div> : null}
        </li>
    )
}

function RoundHistory({ rounds }: { rounds: MatchResultRound[] }) {
    const [openRoundId, setOpenRoundId] = useState<string | null>(null)

    if (!rounds.length) {
        return null
    }

    return (
        <section className="match-result-history" aria-labelledby="round-history-heading">
            <header className="match-result-section-heading">
                <span aria-hidden="true" />
                <h2 id="round-history-heading">Andamento round</h2>
                <span aria-hidden="true" />
            </header>
            <ol>{rounds.map((round) => <HistoryRow key={round.id} round={round} open={openRoundId === round.id} onToggle={() => setOpenRoundId((current) => current === round.id ? null : round.id)} />)}</ol>
        </section>
    )
}

function RewardSummary({ outcome, reward, creature }: {
    outcome: MatchResultOutcome
    reward: MatchRewardRecord | null | undefined
    creature: PlayerCreatureRecord | null | undefined
}) {
    if (!reward || !creature) {
        return <p className="match-reward match-reward--pending">Registrazione ricompensa in corso…</p>
    }

    const progress = getExperienceProgress(creature.experience)
    const bonus = outcome === 'win' ? PROGRESSION.WIN_BONUS_XP : outcome === 'draw' ? PROGRESSION.DRAW_BONUS_XP : 0

    return (
        <section className="match-reward" aria-label="Esperienza ottenuta">
            <span>Esperienza ottenuta</span>
            <p>+{PROGRESSION.COMPLETED_MATCH_XP} XP partita completata</p>
            {bonus ? <p>+{bonus} XP {outcome === 'win' ? 'vittoria' : 'pareggio'}</p> : null}
            <strong>+{reward.experience_awarded} XP · Esperienza: {progress.current} / {progress.required}</strong>
        </section>
    )
}

export function MatchResultScreen({ viewModel, onLeaveSession, onNewGame, isBusy = false, errorMessage, reward, creature }: MatchResultScreenProps) {
    const outcome = outcomeCopy(viewModel.outcome)

    return (
        <section className={`match-result-screen is-${viewModel.outcome}`} aria-label="Risultato della partita">
            <div className="match-result-frame">
                <ResultHud viewModel={viewModel} onLeaveSession={onLeaveSession} />
                {errorMessage ? <p className="match-result-message" role="alert">{errorMessage}</p> : null}
                <section className="match-result-hero" aria-live="polite">
                    <img className="match-result-hero__background" src={viewModel.background} alt="" />
                    <div className="match-result-hero__atmosphere" aria-hidden="true" />
                    <img className="match-result-hero__creature match-result-hero__creature--player" src={viewModel.player.creature.src} alt="" />
                    <img className="match-result-hero__creature match-result-hero__creature--opponent" src={viewModel.opponent.creature.src} alt="" />
                    <div className="match-result-hero__content">
                        <span className="match-result-hero__eyebrow">Esito finale</span>
                        <h1>{outcome.title}</h1>
                        <strong className="match-result-hero__score">{viewModel.player.score} – {viewModel.opponent.score}</strong>
                        {viewModel.metrics.length ? <div className="match-result-hero__metrics">{viewModel.metrics.map((metric) => <p key={metric.id}><span>{metric.label}</span><strong>{metric.value}</strong></p>)}</div> : null}
                    </div>
                </section>
                <RewardSummary outcome={viewModel.outcome} reward={reward} creature={creature} />
                {viewModel.lastRound ? <LastRound round={viewModel.lastRound} /> : null}
                <RoundHistory rounds={viewModel.rounds} />
                <footer className="match-result-actions">
                    <button type="button" className="match-result-actions__home" onClick={onLeaveSession} disabled={isBusy}><span aria-hidden="true">⌂</span><b>Torna alla home</b><small>Esci al menu principale</small></button>
                    <button type="button" className="match-result-actions__new" onClick={onNewGame} disabled={isBusy}><span aria-hidden="true">↻</span><b>Nuova partita</b><small>{isBusy ? 'Preparazione in corso…' : 'Crea una nuova sfida'}</small></button>
                </footer>
            </div>
        </section>
    )
}
