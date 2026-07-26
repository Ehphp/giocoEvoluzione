import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

import type { RoundEventV2 } from '../types'

type RoundEventPanelV2Props = {
    roundEvent: RoundEventV2
    nextRoundEvent: RoundEventV2 | null
}

function EventArtwork({ roundEvent }: { roundEvent: RoundEventV2 }) {
    return (
        <div className="event-v2-art" role="img" aria-label={`Evento ${roundEvent.title}`}>
            <img src={roundEvent.imageUrl} alt="" loading="lazy" onError={(event) => {
                event.currentTarget.style.display = 'none'
            }} />
        </div>
    )
}

function NextEventDetails({ roundEvent }: { roundEvent: RoundEventV2 }) {
    return (
        <aside
            id="next-event-details"
            className="next-event-v2-popover"
            role="tooltip"
            aria-live="polite"
        >
            <div className="next-event-v2-popover__header">
                <span>Modificatori del prossimo evento</span>
                <strong>{roundEvent.title}</strong>
            </div>
            <div className="next-event-v2-modifiers" aria-label="Modificatori non nulli">
                {roundEvent.effects.map((effect) => (
                    <div
                        key={effect.id}
                        className={`next-event-v2-modifier is-${effect.tone}`}
                    >
                        <b>{effect.modifier > 0 ? '+' : ''}{effect.modifier}</b>
                        <span>{effect.label}</span>
                    </div>
                ))}
            </div>
            <small>Tocca di nuovo l’evento o fuori dal pannello per chiudere</small>
        </aside>
    )
}

function NextEventCard({ roundEvent }: { roundEvent: RoundEventV2 | null }) {
    const [isOpen, setIsOpen] = useState(false)
    const cardRef = useRef<HTMLButtonElement | null>(null)

    function closeDetails() {
        setIsOpen(false)
    }

    useEffect(() => {
        if (!isOpen) {
            return
        }

        function handleOutsidePointerDown(event: PointerEvent) {
            if (!cardRef.current?.contains(event.target as Node)) {
                closeDetails()
            }
        }

        document.addEventListener('pointerdown', handleOutsidePointerDown, true)

        return () => {
            document.removeEventListener('pointerdown', handleOutsidePointerDown, true)
        }
    }, [isOpen])

    function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        if (event.key === 'Escape') {
            closeDetails()
            cardRef.current?.focus()
        }
    }

    if (!roundEvent) {
        return (
            <section className="next-event-v2-section" aria-label="Prossimo evento">
                <span className="next-event-v2-label">Prossimo evento</span>
                <div className="next-event-v2-empty">Fine dell’ecosistema dopo questo round</div>
            </section>
        )
    }

    return (
        <section className="next-event-v2-section" aria-label="Prossimo evento">
            <span className="next-event-v2-arrow" aria-hidden="true">↓</span>
            <span className="next-event-v2-label">Prossimo evento</span>
            <button
                ref={cardRef}
                type="button"
                className="next-event-v2-card"
                aria-label={`Prossimo evento: ${roundEvent.title}. Tocca per ${isOpen ? 'chiudere' : 'vedere'} i modificatori`}
                aria-describedby={isOpen ? 'next-event-details' : undefined}
                aria-expanded={isOpen}
                onClick={() => setIsOpen((current) => !current)}
                onKeyDown={handleKeyDown}
            >
                <EventArtwork roundEvent={roundEvent} />
                <div className="next-event-v2-copy">
                    <strong>{roundEvent.title}</strong>
                    <span>{roundEvent.description}</span>
                    <small>Tocca per vedere le affinità</small>
                </div>
                {isOpen ? <NextEventDetails roundEvent={roundEvent} /> : null}
            </button>
        </section>
    )
}

export function RoundEventPanelV2({ roundEvent, nextRoundEvent }: RoundEventPanelV2Props) {
    return (
        <div className="event-v2-stack">
            <span className="event-v2-section-label">Evento corrente</span>
            <section className="event-v2-card" aria-label="Evento corrente">
                <EventArtwork roundEvent={roundEvent} />

                <div className="event-v2-copy">
                    <span className="event-v2-eyebrow">Evento del round</span>
                    <strong className="event-v2-title">{roundEvent.title}</strong>
                    <p className="event-v2-description">{roundEvent.description}</p>
                    {roundEvent.effects.length > 0 ? (
                        <div className="event-v2-effects" aria-label="Effetti principali">
                            {roundEvent.effects.map((effect) => (
                                <span key={effect.id} className={`event-v2-chip is-${effect.tone}`}>
                                    <span className="event-v2-chip__icon" aria-hidden="true">
                                        {effect.tone === 'positive' ? '✦' : effect.tone === 'negative' ? '−' : '•'}
                                    </span>
                                    {effect.value}
                                </span>
                            ))}
                        </div>
                    ) : null}
                </div>
            </section>

            <NextEventCard roundEvent={nextRoundEvent} />
        </div>
    )
}
