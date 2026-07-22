type CreatureStageV2Props = {
    playerName: string
    opponentName: string
    playerCreatureUrl?: string
    opponentCreatureUrl?: string
}

export function CreatureStageV2({
    playerName,
    opponentName,
    playerCreatureUrl,
    opponentCreatureUrl,
}: CreatureStageV2Props) {
    return (
        <section className="gene-v2-creature-stage" aria-label="Confronto creature nel round corrente">
            <article className="gene-v2-creature-card">
                <div className="gene-v2-creature-art" role="img" aria-label={`Creatura ${playerName}`}>
                    <img src={playerCreatureUrl} alt="" loading="lazy" onError={(event) => {
                        event.currentTarget.style.display = 'none'
                    }} />
                    <span>{playerName.slice(0, 1).toUpperCase()}</span>
                </div>
                <strong>{playerName}</strong>
            </article>

            <span className="gene-v2-stage-vs" aria-hidden="true">VS</span>

            <article className="gene-v2-creature-card">
                <div className="gene-v2-creature-art" role="img" aria-label={`Creatura ${opponentName}`}>
                    <img src={opponentCreatureUrl} alt="" loading="lazy" onError={(event) => {
                        event.currentTarget.style.display = 'none'
                    }} />
                    <span>{opponentName.slice(0, 1).toUpperCase()}</span>
                </div>
                <strong>{opponentName}</strong>
            </article>
        </section>
    )
}
