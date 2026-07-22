type ChoosingDuelHeaderProps = {
    myName: string
    opponentName: string
    myScore: number
    opponentScore: number
    roundNumber: number
    totalRounds: number
    myStatus: string
    opponentStatus: string
    actionsSubmitted: number
    isOnline: boolean
    opponentConnected: boolean
    onLeaveSession: () => void
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)

    if (parts.length === 0) {
        return '??'
    }

    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')
}

export function ChoosingDuelHeader({
    myName,
    opponentName,
    myScore,
    opponentScore,
    roundNumber,
    totalRounds,
    myStatus,
    opponentStatus,
    actionsSubmitted,
    isOnline,
    opponentConnected,
    onLeaveSession,
}: ChoosingDuelHeaderProps) {
    return (
        <header className="duel-header-compact" aria-label="Stato round e giocatori">
            <div className="duel-header-compact__top">
                <div className="duel-header-compact__title-block">
                    <span className="duel-header-compact__eyebrow">Round {roundNumber}/{totalRounds}</span>
                    <strong>Duel setup</strong>
                </div>

                <div className="duel-header-compact__top-actions">
                    <span className={`duel-header-compact__sync ${isOnline ? '' : 'is-offline'}`}>
                        {!isOnline ? 'Offline' : `Scelte ${actionsSubmitted}/2`}
                    </span>
                    <button type="button" className="duel-header-compact__exit" onClick={onLeaveSession} aria-label="Esci dalla partita">
                        Esci
                    </button>
                </div>
            </div>

            <div className="duel-header-compact__players">
                <article className="duel-header-compact__player duel-header-compact__player--me" aria-label={`Tu ${myName}, ${myScore} punti`}>
                    <span className="duel-header-compact__avatar" aria-hidden="true">{getInitials(myName)}</span>
                    <div className="duel-header-compact__copy">
                        <span className="duel-header-compact__label">Tu</span>
                        <strong title={myName}>{myName}</strong>
                        <small>{myStatus}</small>
                    </div>
                    <span className="duel-header-compact__score">{myScore}</span>
                </article>

                <article className="duel-header-compact__player duel-header-compact__player--opponent" aria-label={`Avversario ${opponentName}, ${opponentScore} punti`}>
                    <span className={`duel-header-compact__avatar ${opponentConnected ? '' : 'is-muted'}`} aria-hidden="true">{getInitials(opponentName)}</span>
                    <div className="duel-header-compact__copy">
                        <span className="duel-header-compact__label">Avversario</span>
                        <strong title={opponentName}>{opponentName}</strong>
                        <small>{opponentConnected ? opponentStatus : 'Disconnesso'}</small>
                    </div>
                    <span className="duel-header-compact__score">{opponentScore}</span>
                </article>
            </div>
        </header>
    )
}