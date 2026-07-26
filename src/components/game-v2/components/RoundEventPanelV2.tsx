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

function EventDetails({
    roundEvent,
    id,
    heading,
    className = '',
}: {
    roundEvent: RoundEventV2
    id: string
    heading: string
    className?: string
}) {
    return (
        <aside
            id={id}
            className={`next-event-v2-popover ${className}`}
            role="tooltip"
            aria-live="polite"
        >
            <div className="next-event-v2-popover__header">
                <span>{heading}</span>
                <strong>{roundEvent.title}</strong>
            </div>
            {roundEvent.effects.length > 0 ? (
                <div className="next-event-v2-modifiers" aria-label="Geni impattati">
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
            ) : (
                <p className="next-event-v2-popover__empty">Nessun gene modificato da questo ambiente.</p>
            )}
            <small>Tocca di nuovo l’evento o fuori dal pannello per chiudere</small>
        </aside>
    )
}

function CurrentEventCard({ roundEvent }: { roundEvent: RoundEventV2 }) {
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

    return (
        <button
            ref={cardRef}
            type="button"
            className="event-v2-card"
            aria-label={`Evento attuale: ${roundEvent.title}. Tocca per ${isOpen ? 'chiudere' : 'vedere'} tutti i geni impattati`}
            aria-describedby={isOpen ? 'current-event-details' : undefined}
            aria-expanded={isOpen}
            onClick={() => setIsOpen((current) => !current)}
            onKeyDown={handleKeyDown}
        >
            <EventArtwork roundEvent={roundEvent} />

            <div className="event-v2-copy">
                <span className="event-v2-eyebrow">EVENTO ATTIVO</span>
                <strong className="event-v2-title">{roundEvent.title}</strong>
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

            <span className="event-v2-detail-indicator" aria-hidden="true">i</span>
            {isOpen ? (
                <EventDetails
                    roundEvent={roundEvent}
                    id="current-event-details"
                    heading="Geni impattati dall’evento attuale"
                    className="current-event-v2-popover"
                />
            ) : null}
        </button>
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
                <div className="next-event-v2-empty">
                    <span>PROSSIMO</span>
                    <strong>Fine ecosistema</strong>
                </div>
            </section>
        )
    }

    return (
        <section className="next-event-v2-section" aria-label="Prossimo evento">
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
                <div className="next-event-v2-copy">
                    <span>PROSSIMO</span>
                    <strong>{roundEvent.title}</strong>
                </div>
                <span className="next-event-v2-chevron" aria-hidden="true">›</span>
                {isOpen ? (
                    <EventDetails
                        roundEvent={roundEvent}
                        id="next-event-details"
                        heading="Geni impattati dal prossimo evento"
                    />
                ) : null}
            </button>
        </section>
    )
}

export function RoundEventPanelV2({ roundEvent, nextRoundEvent }: RoundEventPanelV2Props) {
    return (
        <div className="event-v2-stack">
            <CurrentEventCard roundEvent={roundEvent} />

            <NextEventCard roundEvent={nextRoundEvent} />
        </div>
    )
}
