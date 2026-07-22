type CompetitiveHeaderProps = {
    myName: string
    opponentName: string
    myAdaptation: number
    opponentAdaptation: number
    myScore: number
    opponentScore: number
    roundNumber: number
    totalRounds: number
    onLeaveSession: () => void
}

export function CompetitiveHeader({
    myName,
    opponentName,
    myAdaptation,
    opponentAdaptation,
    myScore,
    opponentScore,
    roundNumber,
    totalRounds,
    onLeaveSession,
}: CompetitiveHeaderProps) {
    const max = Math.max(1, myAdaptation, opponentAdaptation)
    const myRatio = Math.round((myAdaptation / max) * 100)
    const opponentRatio = Math.round((opponentAdaptation / max) * 100)
    const diff = myAdaptation - opponentAdaptation
    const leadMessage = diff === 0 ? 'Equilibrio adattivo' : diff > 0 ? `Vantaggio tuo +${diff}` : `Vantaggio rivale +${Math.abs(diff)}`

    return (
        <header className="competitive-header game-hud" aria-label="Confronto competitivo">
            <div className="competitive-header__top">
                <section className="competitive-side competitive-side--me" aria-label={`Tu ${myName}`}>
                    <span className="competitive-side__label">Tu</span>
                    <strong className="competitive-side__name" title={myName}>{myName}</strong>
                    <span className="competitive-side__value">{myScore} pt</span>
                </section>

                <div className="competitive-header__center">
                    <span className="competitive-header__turn">Turno {roundNumber}/{totalRounds}</span>
                    <strong className="competitive-header__mini">{myAdaptation} · {opponentAdaptation}</strong>
                </div>

                <section className="competitive-side competitive-side--opponent" aria-label={`Avversario ${opponentName}`}>
                    <span className="competitive-side__label">Rivale</span>
                    <strong className="competitive-side__name" title={opponentName}>{opponentName}</strong>
                    <span className="competitive-side__value">{opponentScore} pt</span>
                </section>
            </div>

            <div className="competitive-header__bottom">
                <strong className="competitive-header__lead">{leadMessage}</strong>
                <button type="button" className="competitive-header__exit" onClick={onLeaveSession} aria-label="Esci dalla partita">
                    Esci
                </button>
            </div>

            <div className="competitive-meter" role="img" aria-label={`Indice adattamento tuo ${myAdaptation}, avversario ${opponentAdaptation}`}>
                <span className="competitive-meter__segment competitive-meter__segment--me" style={{ width: `${myRatio}%` }} />
                <span className="competitive-meter__segment competitive-meter__segment--opponent" style={{ width: `${opponentRatio}%` }} />
            </div>
        </header>
    )
}
