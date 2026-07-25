import type { RoundEventV2 } from '../types'

type RoundEventPanelV2Props = {
    roundEvent: RoundEventV2
}

export function RoundEventPanelV2({ roundEvent }: RoundEventPanelV2Props) {
    return (
        <section className="event-v2-card" aria-label="Evento del round">
            <div className="event-v2-art" role="img" aria-label={`Evento ${roundEvent.title}`}>
                <img src={roundEvent.imageUrl} alt="" loading="lazy" onError={(event) => {
                    event.currentTarget.style.display = 'none'
                }} />
            </div>

            <div className="event-v2-copy">
                <span className="event-v2-eyebrow">Evento del round</span>
                <strong className="event-v2-title">{roundEvent.title}</strong>
                <p className="event-v2-description">{roundEvent.description}</p>
                {roundEvent.effects.length > 0 ? (
                    <div className="event-v2-effects" aria-label="Effetti principali">
                        {roundEvent.effects.map((effect) => (
                            <span key={effect.id} className={`event-v2-chip is-${effect.tone}`}>
                                {effect.value}
                            </span>
                        ))}
                    </div>
                ) : null}
            </div>
        </section>
    )
}
