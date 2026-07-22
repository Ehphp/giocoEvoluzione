import { TRAIT_LABELS } from '../../game/config'
import type { RoundEventDefinition, TraitType } from '../../game/types'

type RoundEventCardProps = {
    roundEvent: RoundEventDefinition | null
    eventLabel: string
    description: string
}

type EffectBadge = {
    trait: TraitType
    reason: string
    label: string
    value: number
}

function getEffectBadges(roundEvent: RoundEventDefinition | null): EffectBadge[] {
    if (!roundEvent) {
        return []
    }

    return [...roundEvent.effects]
        .map((effect) => ({
            trait: effect.trait,
            reason: effect.reason,
            label: TRAIT_LABELS[effect.trait],
            value: effect.modifier,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)
}

export function RoundEventCard({ roundEvent, eventLabel, description }: RoundEventCardProps) {
    const effectBadges = getEffectBadges(roundEvent)
    const eventCode = roundEvent ? roundEvent.category.slice(0, 3) : 'EVT'

    return (
        <section className="round-event-card" aria-label="Evento del round">
            <div className={`round-event-card__art ${roundEvent ? `round-event-card__art--${roundEvent.category.toLowerCase()}` : ''}`} aria-hidden="true">
                <span>{eventCode}</span>
            </div>

            <div className="round-event-card__copy">
                <span className="round-event-card__eyebrow">Evento del round</span>
                <strong>{eventLabel}</strong>
                <p>{description}</p>

                <div className="round-event-card__badges" aria-label="Effetti evento chiave">
                    {effectBadges.map((badge) => (
                        <span key={badge.trait} className="round-event-card__badge">
                            <span>{badge.label}</span>
                            <strong>{badge.value >= 0 ? `+${badge.value}` : badge.value}</strong>
                            <small>{badge.reason}</small>
                        </span>
                    ))}
                </div>
            </div>
        </section>
    )
}