import { useState } from 'react'

import { Chip, Overlay, Panel, SheetHeader } from '../../../ui/components'
import { ArrowDownIcon, ArrowUpIcon, ChevronIcon, InfoIcon } from '../../../ui/icons'
import type { RoundEventEffectV2, RoundEventV2 } from '../controller/types'

type EnvironmentCardProps = {
    roundEvent: RoundEventV2
    nextRoundEvent: RoundEventV2 | null
}

type DetailTarget = 'current' | 'next' | null

const AFFINITY_LABEL: Record<RoundEventEffectV2['tone'], string> = {
    positive: 'Ideale',
    neutral: 'Adatto',
    negative: 'Sfavorevole',
}

const AFFINITY_CHIP_TONE = { positive: 'good', neutral: 'info', negative: 'bad' } as const

function EventThumb({ roundEvent, className = '' }: { roundEvent: RoundEventV2; className?: string }) {
    return (
        <span className={`environment-thumb ${className}`} aria-hidden="true">
            {roundEvent.imageUrl ? (
                <img src={roundEvent.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} />
            ) : null}
        </span>
    )
}

function EffectList({ effects }: { effects: RoundEventEffectV2[] }) {
    if (!effects.length) {
        return <p className="environment-detail__empty">Nessun adattamento e influenzato da questo ambiente.</p>
    }

    return (
        <ul className="environment-detail__list">
            {effects.map((effect) => (
                <li key={effect.id}>
                    <span className="environment-detail__trait">{effect.label}</span>
                    <Chip tone={AFFINITY_CHIP_TONE[effect.tone]}>{AFFINITY_LABEL[effect.tone]} · {effect.modifier > 0 ? `+${effect.modifier}` : effect.modifier}</Chip>
                </li>
            ))}
        </ul>
    )
}

/**
 * Round briefing.
 *
 * The wide region carries the active biome and its two decisive affinities; a narrow trailing
 * column previews the next one, so the player can plan a round ahead without leaving the battle.
 * Either region opens the full affinity table.
 */
export function EnvironmentCard({ roundEvent, nextRoundEvent }: EnvironmentCardProps) {
    const [detailTarget, setDetailTarget] = useState<DetailTarget>(null)
    const detailEvent = detailTarget === 'current' ? roundEvent : detailTarget === 'next' ? nextRoundEvent : null
    const best = roundEvent.effects.find((effect) => effect.tone === 'positive')
    const worst = [...roundEvent.effects].reverse().find((effect) => effect.tone === 'negative')
    const highlighted = [best, worst].filter((effect): effect is RoundEventEffectV2 => Boolean(effect))

    return (
        <>
            <Panel className="environment-card">
                <button
                    type="button"
                    className="environment-card__main"
                    onClick={() => setDetailTarget('current')}
                    aria-label={`Ambiente attivo: ${roundEvent.title}. Apri i dettagli`}
                >
                    <EventThumb roundEvent={roundEvent} />
                    <span className="environment-card__copy">
                        <span className="ev-eyebrow">Ambiente attivo</span>
                        <strong className="environment-card__title ev-truncate">{roundEvent.title}</strong>
                        <span className="environment-card__description">{roundEvent.description}</span>
                    </span>
                    <span className="environment-card__info" aria-hidden="true"><InfoIcon /></span>
                    {highlighted.length ? (
                        <span className="environment-card__chips">
                            {highlighted.map((effect) => (
                                <Chip
                                    key={effect.id}
                                    tone={AFFINITY_CHIP_TONE[effect.tone]}
                                    icon={effect.tone === 'positive' ? <ArrowUpIcon /> : <ArrowDownIcon />}
                                >
                                    <span className="ev-visually-hidden">{AFFINITY_LABEL[effect.tone]} per </span>
                                    {effect.label} {effect.modifier > 0 ? `+${effect.modifier}` : effect.modifier}
                                </Chip>
                            ))}
                        </span>
                    ) : null}
                </button>

                <button
                    type="button"
                    className="environment-card__next"
                    disabled={!nextRoundEvent}
                    onClick={() => setDetailTarget('next')}
                    aria-label={nextRoundEvent ? `Prossimo ambiente: ${nextRoundEvent.title}. Apri i dettagli` : 'Nessun ambiente successivo'}
                >
                    <span className="ev-eyebrow">Prossimo</span>
                    {nextRoundEvent ? <EventThumb roundEvent={nextRoundEvent} className="environment-thumb--next" /> : null}
                    <span className="environment-card__next-title">{nextRoundEvent?.title ?? 'Fine ecosistema'}</span>
                    {nextRoundEvent ? <ChevronIcon aria-hidden="true" /> : null}
                </button>
            </Panel>

            {detailEvent ? (
                <Overlay label={`Dettagli ambiente ${detailEvent.title}`} onClose={() => setDetailTarget(null)}>
                    <Panel className="environment-detail">
                        <SheetHeader
                            eyebrow={detailTarget === 'current' ? 'Ambiente attivo' : 'Prossimo ambiente'}
                            title={detailEvent.title}
                            onClose={() => setDetailTarget(null)}
                        />
                        <EventThumb roundEvent={detailEvent} className="environment-thumb--wide" />
                        <p className="environment-detail__description">{detailEvent.description}</p>
                        <EffectList effects={detailEvent.effects} />
                    </Panel>
                </Overlay>
            ) : null}
        </>
    )
}
