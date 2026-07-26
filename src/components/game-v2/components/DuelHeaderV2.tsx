import type { DuelPlayerV2, RoundInfoV2 } from '../types'
import { RoundIndicatorV2 } from './RoundIndicatorV2'

type DuelHeaderV2Props = {
    player: DuelPlayerV2
    opponent: DuelPlayerV2
    round: RoundInfoV2
    onLeaveSession: () => void
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

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
    return (
        <div className="duel-v2-avatar" role="img" aria-label={`Avatar ${name}`}>
            <img src={avatarUrl} alt="" loading="lazy" onError={(event) => {
                event.currentTarget.style.display = 'none'
            }} />
            <span aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>
        </div>
    )
}

function PlayerCard({
    player,
    role,
    variant,
}: {
    player: DuelPlayerV2
    role: string
    variant: 'player' | 'opponent'
}) {
    return (
        <article className={`duel-v2-card duel-v2-card--${variant}`} aria-label={`${role} ${player.name}, punteggio ${player.score}`}>
            <Avatar name={player.name} avatarUrl={player.avatarUrl} />
            <div className="duel-v2-copy">
                <span className="duel-v2-role">{role}</span>
                <strong className="duel-v2-name" title={player.name}>{player.name}</strong>
                <small className="duel-v2-status">{statusLabel(player.status)}</small>
            </div>
            <span className="duel-v2-score" aria-label={`Punteggio ${player.score}`}>
                {player.score}
            </span>
        </article>
    )
}

export function DuelHeaderV2({ player, opponent, round, onLeaveSession }: DuelHeaderV2Props) {
    return (
        <header className="duel-v2-header" aria-label="Stato competitivo giocatori">
            <PlayerCard player={player} role="Tu" variant="player" />
            <RoundIndicatorV2 round={round} />
            <PlayerCard player={opponent} role="Avversario" variant="opponent" />
            <button type="button" className="leave-button" onClick={onLeaveSession} aria-label="Esci dalla partita">
                <span aria-hidden="true">×</span>
            </button>
        </header>
    )
}
