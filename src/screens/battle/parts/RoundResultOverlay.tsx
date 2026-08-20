import { useEffect, useRef, useState } from 'react'

import { PRODUCTION_CATALOG_AUDIT, RULE_VERSION } from '../../../../shared/game-rules/catalog.ts'
import { TOTAL_ROUNDS, TRAIT_LABELS } from '../../../game/config'
import { getCombatMutationEffectDescription, getRoundExplanation } from '../../../game/round-result-explainer'
import { getRoundEventLabel } from '../../../game/ui-context'
import type { CombatMutationEffect, RoundValueBreakdown, TraitType } from '../../../game/types'
import type { GameSnapshot } from '../../../lib/game-api'
import { Button, Chip, Notice, Overlay, Panel } from '../../../ui/components'
import { GeneIcon } from '../../../ui/icons'

export type RoundResolutionData = {
    ruleVersion?: string
    catalogSignature?: string
    awardedPoints?: number
    player1PointsAwarded?: number
    player2PointsAwarded?: number
    player1Action?: { trait: TraitType; actionType: 'USE' | 'EVOLVE'; playerId: string }
    player2Action?: { trait: TraitType; actionType: 'USE' | 'EVOLVE'; playerId: string }
    player1Breakdown?: RoundValueBreakdown
    player2Breakdown?: RoundValueBreakdown
    player1MutationEffects?: CombatMutationEffect[]
    player2MutationEffects?: CombatMutationEffect[]
    matchEndReason?: 'CLINCH' | 'SCORE' | 'ROUND_VALUE_TIEBREAK' | 'DRAW' | null
    player1RoundValueTotal?: number
    player2RoundValueTotal?: number
}

type RoundResultOverlayProps = {
    snapshot: GameSnapshot
    resolutionData: RoundResolutionData | undefined
    onContinue: () => void
    isBusy: boolean
    errorMessage: string | null
}

type BreakdownCardProps = {
    title: string
    action: { trait: TraitType; actionType: 'USE' | 'EVOLVE'; playerId: string } | undefined
    breakdown: RoundValueBreakdown | undefined
    mutationEffects: CombatMutationEffect[]
    total: number
    awardedPoints: number
    roundEventLabel: string
    showContributions: boolean
    showTotal: boolean
    isMe?: boolean
}

function BreakdownCard({
    title,
    action,
    breakdown,
    mutationEffects,
    total,
    awardedPoints,
    roundEventLabel,
    showContributions,
    showTotal,
    isMe = false,
}: BreakdownCardProps) {
    const actionLabel = action ? (action.actionType === 'USE' ? 'USA' : 'EVOLVI') : 'N/D'

    return (
        <article
            className={`round-breakdown ${isMe ? 'round-breakdown--me' : ''}`}
            data-gene={action?.trait}
        >
            <header className="round-breakdown__header">
                <span className="round-breakdown__glyph" aria-hidden="true">
                    {action ? <GeneIcon trait={action.trait} /> : null}
                </span>
                <div>
                    <span className="ev-eyebrow">{title}</span>
                    <strong>{action ? TRAIT_LABELS[action.trait] : 'N/D'}</strong>
                </div>
                <Chip tone={action?.actionType === 'EVOLVE' ? 'info' : 'good'}>{actionLabel}</Chip>
            </header>

            {breakdown ? (
                <details className={`round-breakdown__details ${showContributions ? '' : 'is-hidden'}`}>
                    <summary>Dettaglio calcolo</summary>
                    <div className="round-breakdown__math">
                        {action?.actionType === 'EVOLVE' ? (
                            <p>EVOLVI: valore fisso {breakdown.total}; evoluzione e recupero ignorano affinita e matchup.</p>
                        ) : (
                            <>
                                <p>Uso base <b>+{breakdown.baseContribution ?? 0}</b></p>
                                <p>Affinita {roundEventLabel} <b>+{breakdown.eventModifier}</b></p>
                                <p>Livello <b>+{breakdown.levelContribution}</b></p>
                                <p>Vantaggio naturale <b>+{breakdown.matchupBonus ?? 0}</b></p>
                            </>
                        )}
                        {breakdown.originalLevel > breakdown.effectiveLevel ? (
                            <p>Livello posseduto {breakdown.originalLevel} · effettivo {breakdown.effectiveLevel}</p>
                        ) : (
                            <p>Livello effettivo {breakdown.effectiveLevel}</p>
                        )}
                        {mutationEffects.map((effect) => <p key={`${effect.id}-${effect.effect}`}>{getCombatMutationEffectDescription(effect)}</p>)}
                    </div>
                </details>
            ) : (
                <p className="round-breakdown__legacy">Dettaglio calcolo non disponibile per questo risultato storico.</p>
            )}

            <footer className="round-breakdown__footer">
                <strong className={showTotal ? 'is-highlighted' : ''}>{total} valore</strong>
                <span>+{awardedPoints} punti</span>
            </footer>
        </article>
    )
}

export function RoundResultOverlay({ snapshot, resolutionData, onContinue, isBusy, errorMessage }: RoundResultOverlayProps) {
    const result = snapshot.currentRoundResult
    const roundEvent = snapshot.currentRoundEvent
    const roundEventLabel = getRoundEventLabel(roundEvent)
    const [animationPhase, setAnimationPhase] = useState(snapshot.game.status === 'REVEALING' ? 0 : 3)
    const contentRef = useRef<HTMLDivElement>(null)
    const iAmPlayer1 = snapshot.me?.slot === 1
    const winnerNickname = snapshot.players.find((player) => player.id === result?.winner_id)?.nickname ?? null
    const player1Action = resolutionData?.player1Action
    const player2Action = resolutionData?.player2Action
    const player1Breakdown = resolutionData?.player1Breakdown
    const player2Breakdown = resolutionData?.player2Breakdown
    const player1MutationEffects = resolutionData?.player1MutationEffects ?? []
    const player2MutationEffects = resolutionData?.player2MutationEffects ?? []
    const hasCurrentRuleVersion = resolutionData?.ruleVersion === RULE_VERSION
        && resolutionData.catalogSignature === PRODUCTION_CATALOG_AUDIT.catalogSignature
    const myResolvedAction = player1Action?.playerId === snapshot.me?.id ? player1Action : player2Action
    const opponentResolvedAction = player1Action?.playerId === snapshot.opponent?.id ? player1Action : player2Action
    const myBreakdown = iAmPlayer1 ? player1Breakdown : player2Breakdown
    const opponentBreakdown = iAmPlayer1 ? player2Breakdown : player1Breakdown
    const myMutationEffects = iAmPlayer1 ? player1MutationEffects : player2MutationEffects
    const opponentMutationEffects = iAmPlayer1 ? player2MutationEffects : player1MutationEffects
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
    const outcome = bothEvolved || iEvolved ? 'evolve' : iWon === null ? 'draw' : iWon ? 'win' : 'loss'
    const outcomeTitle = outcome === 'evolve'
        ? 'Evoluzione completata'
        : outcome === 'draw'
            ? 'Pareggio'
            : outcome === 'win'
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

    return (
        <Overlay label="Risultato del round" align="center" closeOnBackdrop={false}>
            <Panel
                className={`round-result round-result--${outcome}`}
                aria-live="polite"
                onPointerDown={() => setAnimationPhase(3)}
            >
                <div ref={contentRef} tabIndex={-1} className="round-result__hero">
                    <span className="ev-eyebrow">Round {snapshot.game.current_round} · {roundEventLabel}</span>
                    <h2>{outcomeTitle}</h2>
                    <div className={`round-result__values ${animationPhase < 1 ? 'is-hidden' : ''}`} aria-label={`Valore tuo ${myRoundValue}, avversario ${opponentRoundValue}`}>
                        <p><span>Tu</span><strong>{myRoundValue}</strong></p>
                        <span className="round-result__dash" aria-hidden="true">–</span>
                        <p><span>Avversario</span><strong>{opponentRoundValue}</strong></p>
                    </div>
                    <p className="round-result__subtitle">{winnerNickname ? `${winnerNickname} vince il round.` : 'Nessun vincitore nel round.'}</p>
                    {animationPhase < 3 ? <small className="round-result__skip">Tocca per saltare l animazione</small> : null}
                </div>

                {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}
                {!hasCurrentRuleVersion ? (
                    <Notice tone="warning">
                        Risultato calcolato con regole non riconosciute. Distribuisci la Edge Function aggiornata e avvia una nuova partita.
                    </Notice>
                ) : null}

                <div className={`round-result__cards ${animationPhase < 2 ? 'is-hidden' : ''}`}>
                    <BreakdownCard
                        title={snapshot.me?.nickname ?? 'Tu'}
                        action={myResolvedAction}
                        breakdown={myBreakdown}
                        mutationEffects={myMutationEffects}
                        total={myRoundValue}
                        awardedPoints={myRoundPoints}
                        roundEventLabel={roundEventLabel}
                        showContributions={animationPhase >= 2}
                        showTotal={animationPhase >= 3}
                        isMe
                    />
                    <BreakdownCard
                        title={snapshot.opponent?.nickname ?? 'Avversario'}
                        action={opponentResolvedAction}
                        breakdown={opponentBreakdown}
                        mutationEffects={opponentMutationEffects}
                        total={opponentRoundValue}
                        awardedPoints={opponentRoundPoints}
                        roundEventLabel={roundEventLabel}
                        showContributions={animationPhase >= 2}
                        showTotal={animationPhase >= 3}
                    />
                </div>

                <p className={`round-result__explanation ${animationPhase < 3 ? 'is-hidden' : ''}`}>{explanation}</p>

                <Button
                    tone="use"
                    block
                    onClick={onContinue}
                    aria-describedby={snapshot.game.status === 'REVEALING' ? 'round-continue-reason' : undefined}
                    disabled={isBusy || snapshot.game.status === 'REVEALING'}
                >
                    {continueLabel}
                </Button>
                {snapshot.game.status === 'REVEALING' ? (
                    <span id="round-continue-reason" className="round-result__reason" role="status">
                        Disponibile al termine della rivelazione.
                    </span>
                ) : null}
            </Panel>
        </Overlay>
    )
}
