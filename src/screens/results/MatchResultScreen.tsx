import { useState } from 'react'

import { TRAIT_LABELS } from '../../game/config'
import { GAME_SELECTION_ASSETS } from '../../components/game-v2/gameSelectionAssets'
import { getResultActionLabel } from '../../components/game-results/buildMatchResultViewModel'
import { getCombatMutationEffectDescription } from '../../game/round-result-explainer'
import type { MatchResultOutcome, MatchResultRound, MatchResultViewModel, ResultAction, ResultRoundParticipant } from '../../components/game-results/types'
import type { MatchRewardRecord, PlayerCreatureRecord } from '../../lib/profile-api'
import { getExperienceProgress, PROGRESSION } from '../../lib/progression'
import { AppShell, Avatar, Button, Chip, IconButton, Notice, Panel, Pill, ProgressBar, SectionLabel } from '../../ui/components'
import { ChevronIcon, CloseIcon, GeneIcon, SparkIcon, TrophyIcon } from '../../ui/icons'

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

const OUTCOME_COPY: Record<MatchResultOutcome, { title: string; label: string }> = {
    win: { title: 'HAI VINTO!', label: 'Vittoria' },
    loss: { title: 'HAI PERSO', label: 'Sconfitta' },
    draw: { title: 'PAREGGIO', label: 'Pareggio' },
}

const OUTCOME_TONE = { win: 'good', loss: 'bad', draw: 'info' } as const

function opposingOutcome(outcome: MatchResultOutcome): MatchResultOutcome {
    if (outcome === 'win') return 'loss'
    if (outcome === 'loss') return 'win'
    return 'draw'
}

function CalculationDetails({ action, participant, eventLabel }: {
    action: ResultAction | null
    participant: ResultRoundParticipant
    eventLabel: string | null
}) {
    if (!participant.breakdown) {
        return <p className="result-calc__empty">Dettaglio calcolo non disponibile per questo risultato storico.</p>
    }

    if (action?.actionType === 'EVOLVE') {
        return <>
            <p className="result-calc__empty">EVOLVI: valore fisso {participant.breakdown.total}. Affinita e vantaggio naturale non si applicano.</p>
            {participant.mutationEffects.map((effect) => <p key={`${effect.id}-${effect.effect}`} className="result-calc__empty">{getCombatMutationEffectDescription(effect)}</p>)}
        </>
    }

    return <>
        <dl className="result-calc">
            <div><dt>Uso base</dt><dd>+{participant.breakdown.baseContribution}</dd></div>
            <div><dt>Ambiente{eventLabel ? ` · ${eventLabel}` : ''}</dt><dd>+{participant.breakdown.eventModifier}</dd></div>
            <div><dt>Livello</dt><dd>+{participant.breakdown.levelContribution}</dd></div>
            <div><dt>Vantaggio naturale</dt><dd>+{participant.breakdown.matchupBonus}</dd></div>
            {participant.breakdown.mutationBonus ? <div><dt>Nucleo adattivo</dt><dd>+{participant.breakdown.mutationBonus}</dd></div> : null}
        </dl>
        {participant.mutationEffects.map((effect) => <p key={`${effect.id}-${effect.effect}`} className="result-calc__empty">{getCombatMutationEffectDescription(effect)}</p>)}
    </>
}

function RoundSideCard({ side, round, participant }: { side: 'player' | 'opponent'; round: MatchResultRound; participant: ResultRoundParticipant }) {
    const [isOpen, setIsOpen] = useState(false)
    const action = participant.action
    const detailId = `result-round-${round.id}-${side}`

    return (
        <article className="result-side" data-gene={action?.trait}>
            <header className="result-side__header">
                <span className="result-side__glyph" aria-hidden="true">{action ? <GeneIcon trait={action.trait} /> : null}</span>
                <div>
                    <span className="ev-eyebrow">{side === 'player' ? 'Tu' : 'Avversario'}</span>
                    <strong>{action ? TRAIT_LABELS[action.trait] : 'Dati non disponibili'}</strong>
                </div>
            </header>
            <Chip tone={action?.actionType === 'EVOLVE' ? 'info' : 'good'}>
                {action ? (action.actionType === 'USE' ? 'USA' : 'EVOLVI') : 'n/d'}
            </Chip>
            <button type="button" className="result-side__toggle" aria-expanded={isOpen} aria-controls={detailId} onClick={() => setIsOpen((current) => !current)}>
                {isOpen ? 'Nascondi calcolo' : 'Dettaglio calcolo'}
                <ChevronIcon aria-hidden="true" style={{ transform: isOpen ? 'rotate(90deg)' : undefined }} />
            </button>
            {isOpen ? <div id={detailId}><CalculationDetails action={action} participant={participant} eventLabel={round.eventLabel} /></div> : null}
            <footer className="result-side__footer">
                <strong>{participant.value} valore</strong>
                <span>{participant.points === null ? 'Punti n/d' : `+${participant.points} punti`}</span>
            </footer>
        </article>
    )
}

function HistoryRow({ round, isOpen, onToggle }: { round: MatchResultRound; isOpen: boolean; onToggle: () => void }) {
    const detailId = `round-history-${round.id}`

    return (
        <li>
            <Panel className={`result-history-row result-history-row--${round.outcome}`} flat>
                <button type="button" className="result-history-row__summary" aria-expanded={isOpen} aria-controls={detailId} onClick={onToggle}>
                    <span className="result-history-row__number">R{round.number}</span>
                    <span className="result-history-row__moves">
                        <b>Tu</b> {getResultActionLabel(round.player.action)} <strong>{round.player.value}</strong>
                        <em>vs</em>
                        <b>Avv.</b> {getResultActionLabel(round.opponent.action)} <strong>{round.opponent.value}</strong>
                    </span>
                    <Chip tone={OUTCOME_TONE[round.outcome]}>{round.player.points === null ? 'n/d' : `+${round.player.points}`}</Chip>
                    <ChevronIcon aria-hidden="true" style={{ transform: isOpen ? 'rotate(90deg)' : undefined }} />
                </button>
                {isOpen ? (
                    <div id={detailId} className="result-history-row__detail">
                        <p>{round.explanation}</p>
                        <CalculationDetails action={round.player.action} participant={round.player} eventLabel={round.eventLabel} />
                    </div>
                ) : null}
            </Panel>
        </li>
    )
}

function RewardSummary({ outcome, reward, creature }: {
    outcome: MatchResultOutcome
    reward: MatchRewardRecord | null | undefined
    creature: PlayerCreatureRecord | null | undefined
}) {
    if (!reward || !creature) {
        return <Panel className="result-reward result-reward--pending">Registrazione ricompensa in corso...</Panel>
    }

    const progress = getExperienceProgress(creature.experience)
    const bonus = outcome === 'win' ? PROGRESSION.WIN_BONUS_XP : outcome === 'draw' ? PROGRESSION.DRAW_BONUS_XP : 0

    return (
        <Panel className="result-reward" aria-label="Esperienza ottenuta">
            <div className="result-reward__head">
                <span className="ev-eyebrow">Esperienza ottenuta</span>
                <strong>+{reward.experience_awarded} XP</strong>
            </div>
            <div className="result-reward__chips">
                <Chip tone="good" icon={<SparkIcon />}>+{PROGRESSION.COMPLETED_MATCH_XP} partita</Chip>
                {bonus ? <Chip tone="warn" icon={<TrophyIcon />}>+{bonus} {outcome === 'win' ? 'vittoria' : 'pareggio'}</Chip> : null}
            </div>
            <ProgressBar current={progress.current} total={progress.required} label={`Esperienza ${progress.current} su ${progress.required}`} />
            <small>{progress.current} / {progress.required} XP verso il livello successivo</small>
        </Panel>
    )
}

export function MatchResultScreen({ viewModel, onLeaveSession, onNewGame, isBusy = false, errorMessage, reward, creature }: MatchResultScreenProps) {
    const outcome = OUTCOME_COPY[viewModel.outcome]
    const opponentLabel = OUTCOME_COPY[opposingOutcome(viewModel.outcome)].label
    const [openRoundId, setOpenRoundId] = useState<string | null>(null)

    return (
        <AppShell sceneryUrl={viewModel.background} sceneryFallbackUrl={GAME_SELECTION_ASSETS.backgroundFallback} scroll>
            <section className={`result-screen result-screen--${viewModel.outcome}`} aria-label="Risultato della partita">
                <header className="result-topbar">
                    <Pill>Round <strong>{viewModel.finalRoundNumber}/{viewModel.totalRounds}</strong></Pill>
                    <IconButton label="Esci dalla partita" variant="danger" onClick={onLeaveSession}>
                        <CloseIcon />
                    </IconButton>
                </header>

                <Panel className="result-hero" aria-live="polite">
                    <span className="ev-eyebrow">Esito finale</span>
                    <h1>{outcome.title}</h1>
                    <div className="result-hero__scoreline">
                        <div className="result-hero__side">
                            <Avatar name={viewModel.player.name} src={viewModel.player.creature.src} size={54} />
                            <strong className="ev-truncate">{viewModel.player.name}</strong>
                            <Chip tone={OUTCOME_TONE[viewModel.outcome]}>{outcome.label}</Chip>
                            {viewModel.player.tiebreakTotal !== null ? <small className="result-hero__tiebreak">TB {viewModel.player.tiebreakTotal}</small> : null}
                        </div>
                        <p className="result-hero__score">
                            <b>{viewModel.player.score}</b>
                            <span>–</span>
                            <b>{viewModel.opponent.score}</b>
                        </p>
                        <div className="result-hero__side">
                            <Avatar name={viewModel.opponent.name} src={viewModel.opponent.creature.src} size={54} />
                            <strong className="ev-truncate">{viewModel.opponent.name}</strong>
                            <Chip tone={OUTCOME_TONE[opposingOutcome(viewModel.outcome)]}>{opponentLabel}</Chip>
                            {viewModel.opponent.tiebreakTotal !== null ? <small className="result-hero__tiebreak">TB {viewModel.opponent.tiebreakTotal}</small> : null}
                        </div>
                    </div>
                    {viewModel.metrics.length ? (
                        <ul className="result-hero__metrics">
                            {viewModel.metrics.map((metric) => (
                                <li key={metric.id}><span>{metric.label}</span><strong>{metric.value}</strong></li>
                            ))}
                        </ul>
                    ) : null}
                </Panel>

                {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}

                <RewardSummary outcome={viewModel.outcome} reward={reward} creature={creature} />

                {viewModel.lastRound ? (
                    <>
                        <SectionLabel>Ultimo round</SectionLabel>
                        <Panel className="result-last-round">
                            {viewModel.lastRound.eventLabel ? <span className="ev-eyebrow">{viewModel.lastRound.eventLabel}</span> : null}
                            <div className="result-last-round__cards">
                                <RoundSideCard side="player" round={viewModel.lastRound} participant={viewModel.lastRound.player} />
                                <RoundSideCard side="opponent" round={viewModel.lastRound} participant={viewModel.lastRound.opponent} />
                            </div>
                            <p className="result-last-round__explanation">{viewModel.lastRound.explanation}</p>
                        </Panel>
                    </>
                ) : null}

                {viewModel.rounds.length ? (
                    <>
                        <SectionLabel>Andamento round</SectionLabel>
                        <ol className="result-history">
                            {viewModel.rounds.map((round) => (
                                <HistoryRow
                                    key={round.id}
                                    round={round}
                                    isOpen={openRoundId === round.id}
                                    onToggle={() => setOpenRoundId((current) => current === round.id ? null : round.id)}
                                />
                            ))}
                        </ol>
                    </>
                ) : null}

                <footer className="result-actions">
                    <Button tone="use" block onClick={onNewGame} disabled={isBusy}>
                        {isBusy ? 'Preparazione...' : 'Nuova partita'}
                    </Button>
                    <Button tone="cream" block onClick={onLeaveSession} disabled={isBusy}>Torna alla home</Button>
                </footer>
            </section>
        </AppShell>
    )
}
