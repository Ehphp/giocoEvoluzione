import type { DuelPlayerV2 } from '../types'

type DuelHeaderV2Props = {
    player: DuelPlayerV2
    opponent: DuelPlayerV2
}

function StatusDot({ status }: { status: DuelPlayerV2['status'] }) {
    return <span className={`gene-v2-status-dot ${status === 'ready' ? 'is-ready' : 'is-choosing'}`} aria-hidden="true" />
}

export function DuelHeaderV2({ player, opponent }: DuelHeaderV2Props) {
    return (
        <header className="gene-v2-duel-header" aria-label="Stato competitivo giocatori">
            <article className="gene-v2-player-card gene-v2-player-card--player" aria-label={`Giocatore ${player.name}, punteggio ${player.score}`}>
                <div className="gene-v2-avatar-fallback" role="img" aria-label={`Avatar ${player.name}`}>
                    <img src={player.avatarUrl} alt="" className="gene-v2-avatar-image" loading="lazy" onError={(event) => {
                        event.currentTarget.style.display = 'none'
                    }} />
                    <span>{player.name.slice(0, 2).toUpperCase()}</span>
                </div>
                <div className="gene-v2-player-copy">
                    <span className="gene-v2-player-tag">Tu</span>
                    <strong>{player.name}</strong>
                    <small className="gene-v2-player-status">
                        <StatusDot status={player.status} />
                        {player.status === 'ready' ? 'Scelta inviata' : 'Sta scegliendo'}
                    </small>
                </div>
                <span className="gene-v2-score" aria-label={`Punteggio ${player.score}`}>
                    {player.score}
                </span>
            </article>

            <span className="gene-v2-versus" aria-hidden="true">
                VS
            </span>

            <article className="gene-v2-player-card gene-v2-player-card--opponent" aria-label={`Avversario ${opponent.name}, punteggio ${opponent.score}`}>
                <div className="gene-v2-avatar-fallback" role="img" aria-label={`Avatar ${opponent.name}`}>
                    <img src={opponent.avatarUrl} alt="" className="gene-v2-avatar-image" loading="lazy" onError={(event) => {
                        event.currentTarget.style.display = 'none'
                    }} />
                    <span>{opponent.name.slice(0, 2).toUpperCase()}</span>
                </div>
                <div className="gene-v2-player-copy">
                    <span className="gene-v2-player-tag">Avversario</span>
                    <strong>{opponent.name}</strong>
                    <small className="gene-v2-player-status">
                        <StatusDot status={opponent.status} />
                        {opponent.status === 'ready' ? 'Scelta inviata' : 'Sta scegliendo'}
                    </small>
                </div>
                <span className="gene-v2-score" aria-label={`Punteggio ${opponent.score}`}>
                    {opponent.score}
                </span>
            </article>
        </header>
    )
}
