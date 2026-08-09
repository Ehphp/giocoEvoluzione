import { Avatar, Pips } from '../../../ui/components'
import { TrophyIcon } from '../../../ui/icons'
import type { DuelPlayerV2, RoundInfoV2 } from '../../../components/game-v2/types'

type DuelHeaderProps = {
    player: DuelPlayerV2
    opponent: DuelPlayerV2
    round: RoundInfoV2
}

function statusLabel(status: DuelPlayerV2['status']): string {
    if (status === 'ready') {
        return 'Scelta inviata'
    }

    if (status === 'disconnected') {
        return 'Disconnesso'
    }

    return 'Sta scegliendo'
}

function DuelCard({ player, role, side, round }: { player: DuelPlayerV2; role: string; side: 'player' | 'opponent'; round: RoundInfoV2 }) {
    return (
        <article
            className={`duel-card duel-card--${side}`}
            aria-label={`${role}: ${player.name}, ${player.score} round vinti su ${round.total}${player.roundValueTotal === null ? '' : `, valore totale ${player.roundValueTotal}`}, ${statusLabel(player.status).toLowerCase()}`}
        >
            <span className="duel-card__portrait">
                <Avatar name={player.name} src={player.creatureVisual?.src ?? player.avatarUrl} size={42} />
                <span className={`duel-card__state duel-card__state--${player.status}`} title={statusLabel(player.status)} aria-hidden="true" />
            </span>
            <div className="duel-card__copy">
                <strong className="duel-card__name ev-truncate" title={player.name}>{player.name}</strong>
                <span className="duel-card__score">
                    <TrophyIcon aria-hidden="true" />
                    <b>{player.score}</b>
                    {player.roundValueTotal !== null ? (
                        <small className="duel-card__tiebreak" title="Valore totale dei round, usato per il tiebreak">TB {player.roundValueTotal}</small>
                    ) : null}
                </span>
                <Pips
                    total={round.total}
                    filled={player.score}
                    color={side === 'player' ? '#eaffd9' : '#f0e2ff'}
                    label={`${player.score} round vinti su ${round.total}`}
                />
            </div>
        </article>
    )
}

export function DuelHeader({ player, opponent, round }: DuelHeaderProps) {
    return (
        <header className="duel-header" aria-label="Stato dello scontro">
            <DuelCard player={player} role="Tu" side="player" round={round} />
            <span className="duel-header__versus" aria-hidden="true">VS</span>
            <DuelCard player={opponent} role="Avversario" side="opponent" round={round} />
        </header>
    )
}
