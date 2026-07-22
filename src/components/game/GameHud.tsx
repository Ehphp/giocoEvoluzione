import { OpponentStatus } from './OpponentStatus'

type GameHudProps = {
    roundNumber: number
    totalRounds: number
    myScore: number
    opponentScore: number
    opponentName: string
    opponentStatus: string
    opponentAvatarSrc: string
    onLeaveSession: () => void
}

export function GameHud({
    roundNumber,
    totalRounds,
    myScore,
    opponentScore,
    opponentName,
    opponentStatus,
    opponentAvatarSrc,
    onLeaveSession,
}: GameHudProps) {
    return (
        <header className="game-hud">
            <div className="game-hud__stats">
                <div className="game-hud__round">
                    <span className="game-hud__label">Round</span>
                    <strong>
                        {roundNumber}/{totalRounds}
                    </strong>
                </div>
                <div className="game-hud__scores" aria-label={`Punteggio tuo ${myScore}, avversario ${opponentScore}`}>
                    <span className="game-hud__score game-hud__score--me">Tu {myScore}</span>
                    <span className="game-hud__score">Avv {opponentScore}</span>
                </div>
            </div>

            <div className="game-hud__side">
                <OpponentStatus name={opponentName} status={opponentStatus} avatarSrc={opponentAvatarSrc} avatarAlt={`${opponentName} miniatura`} />
                <button type="button" className="game-hud__exit" onClick={onLeaveSession}>
                    Esci
                </button>
            </div>
        </header>
    )
}