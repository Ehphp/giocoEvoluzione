import type { RoundEventV2 } from '../types'

type RoundEventPanelV2Props = {
    roundEvent: RoundEventV2
}

export function RoundEventPanelV2({ roundEvent }: RoundEventPanelV2Props) {
    return (
        <section className="gene-v2-round-event" aria-label="Evento del round">
            <div className="gene-v2-round-event-art" role="img" aria-label={`Evento ${roundEvent.title}`}>
                <img src={roundEvent.imageUrl} alt="" loading="lazy" onError={(event) => {
                    event.currentTarget.style.display = 'none'
                }} />
                <span>{roundEvent.intensity}</span>
            </div>

            <div className="gene-v2-round-event-copy">
                <span className="gene-v2-eyebrow">Evento del round</span>
                <strong>{roundEvent.title}</strong>
                <p>{roundEvent.description}</p>
                <small>{roundEvent.category} · Intensita {roundEvent.intensity} · {roundEvent.artKey}</small>
                <div className="gene-v2-modifiers" aria-label="Effetti evento">
                    {roundEvent.effects.map((effect) => (
                        <span key={effect.id} className={`gene-v2-modifier is-${effect.tone}`}>
                            <small>{effect.label}</small>
                            <strong>{effect.value}</strong>
                            <small>{effect.reason}</small>
                        </span>
                    ))}
                </div>
            </div>
        </section>
    )
}
