import { useEffect, useRef, useState } from 'react'

import type { RoundEventV2 } from '../types'

type RoundEventPanelV2Props = {
    roundEvent: RoundEventV2
    nextRoundEvent: RoundEventV2 | null
}

type DetailTarget = 'current' | 'next' | null

function EventArtwork({ roundEvent }: { roundEvent: RoundEventV2 }) {
    return (
        <div className="event-v2-art" role="img" aria-label={`Evento ${roundEvent.title}`}>
            {roundEvent.imageUrl ? <img src={roundEvent.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} /> : null}
        </div>
    )
}

function EventDetails({ roundEvent, heading, onClose }: { roundEvent: RoundEventV2; heading: string; onClose: () => void }) {
    return (
        <div className="event-v2-overlay" role="presentation" onPointerDown={onClose}>
            <aside className="event-v2-popover" role="dialog" aria-modal="true" aria-label={heading} onPointerDown={(event) => event.stopPropagation()}>
                <div className="event-v2-popover__header">
                    <div>
                        <span>{heading}</span>
                        <strong>{roundEvent.title}</strong>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Chiudi dettagli evento">×</button>
                </div>
                {roundEvent.effects.length > 0 ? (
                    <div className="event-v2-popover__modifiers" aria-label="Geni impattati">
                        {roundEvent.effects.map((effect) => (
                            <div key={effect.id} className={`event-v2-modifier is-${effect.tone}`}>
                                <b>{effect.modifier > 0 ? '+' : ''}{effect.modifier}</b>
                                <span>{effect.label}</span>
                            </div>
                        ))}
                    </div>
                ) : <p>Nessun gene modificato da questo ambiente.</p>}
            </aside>
        </div>
    )
}

export function RoundEventPanelV2({ roundEvent, nextRoundEvent }: RoundEventPanelV2Props) {
    const [openTarget, setOpenTarget] = useState<DetailTarget>(null)
    const currentTriggerRef = useRef<HTMLButtonElement | null>(null)
    const nextTriggerRef = useRef<HTMLButtonElement | null>(null)

    const detailEvent = openTarget === 'current'
        ? roundEvent
        : openTarget === 'next'
            ? nextRoundEvent
            : null

    useEffect(() => {
        if (!openTarget) {
            return
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                event.preventDefault()
                setOpenTarget(null)
                ;(openTarget === 'current' ? currentTriggerRef.current : nextTriggerRef.current)?.focus()
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [openTarget])

    function toggleDetails(target: Exclude<DetailTarget, null>) {
        setOpenTarget((current) => current === target ? null : target)
    }

    return (
        <section className="event-v2-stack" aria-label="Evento del round">
            <button
                ref={currentTriggerRef}
                type="button"
                className="event-v2-card"
                aria-expanded={openTarget === 'current'}
                aria-controls={openTarget === 'current' ? 'event-details' : undefined}
                onClick={() => toggleDetails('current')}
            >
                <EventArtwork roundEvent={roundEvent} />
                <span className="event-v2-copy">
                    <span className="event-v2-eyebrow">EVENTO ATTIVO</span>
                    <strong className="event-v2-title">{roundEvent.title}</strong>
                    {roundEvent.effects.length > 0 ? (
                        <span className="event-v2-effects" aria-label="Modificatori principali">
                            {roundEvent.effects.map((effect) => <span key={effect.id} className={`event-v2-chip is-${effect.tone}`}>{effect.value}</span>)}
                        </span>
                    ) : null}
                </span>
                <span className="event-v2-detail-indicator" aria-hidden="true">i</span>
            </button>

            <button
                ref={nextTriggerRef}
                type="button"
                className="event-v2-next-trigger"
                disabled={!nextRoundEvent}
                aria-expanded={openTarget === 'next'}
                aria-controls={openTarget === 'next' ? 'event-details' : undefined}
                onClick={() => toggleDetails('next')}
            >
                <span>PROSSIMO</span>
                <strong>{nextRoundEvent?.title ?? 'Fine ecosistema'}</strong>
                {nextRoundEvent ? <b aria-hidden="true">›</b> : null}
            </button>

            {detailEvent ? <EventDetails roundEvent={detailEvent} heading={openTarget === 'current' ? 'Geni impattati dall’evento attuale' : 'Geni impattati dal prossimo evento'} onClose={() => setOpenTarget(null)} /> : null}
        </section>
    )
}
