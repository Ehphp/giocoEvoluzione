import { useState } from 'react'

import { Chip, Overlay, Panel, SheetHeader } from '../../../ui/components'
import { GeneIcon } from '../../../ui/icons'
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

function signed(modifier: number): string {
    return modifier > 0 ? `+${modifier}` : String(modifier)
}

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
                    <Chip tone={AFFINITY_CHIP_TONE[effect.tone]}>{AFFINITY_LABEL[effect.tone]} · {signed(effect.modifier)}</Chip>
                </li>
            ))}
        </ul>
    )
}

/**
 * Round briefing, as one row.
 *
 * It used to be a block: an eyebrow, a title, two lines of description and a pair of labelled chips,
 * around 100px of a 664px screen. The arena is the only elastic thing here (§7), so every pixel this
 * spends is a pixel the creatures lose.
 *
 * What survives is the biome, its two decisive affinities and the next biome, all on one line — and
 * the affinities are the *glyph* of the adaptation plus its modifier rather than its name and a word,
 * because the glyph is what the player already reads the gene row by. The prose moves out of the card
 * onto the artwork below it, where it costs one line and no panel. The full table is still one tap
 * away in the sheet, which is unchanged.
 */
export function EnvironmentCard({ roundEvent, nextRoundEvent }: EnvironmentCardProps) {
    const [detailTarget, setDetailTarget] = useState<DetailTarget>(null)
    const detailEvent = detailTarget === 'current' ? roundEvent : detailTarget === 'next' ? nextRoundEvent : null
    const best = roundEvent.effects.find((effect) => effect.tone === 'positive')
    const worst = [...roundEvent.effects].reverse().find((effect) => effect.tone === 'negative')
    const highlighted = [best, worst].filter((effect): effect is RoundEventEffectV2 => Boolean(effect))

    return (
        <>
            <Panel className="environment-row" compact>
                <button
                    type="button"
                    className="environment-row__main"
                    onClick={() => setDetailTarget('current')}
                    aria-label={`Ambiente attivo: ${roundEvent.title}. ${roundEvent.description} Apri i dettagli`}
                >
                    <EventThumb roundEvent={roundEvent} />
                    <strong className="environment-row__title">{roundEvent.title}</strong>
                    {highlighted.length ? (
                        <span className="environment-row__effects">
                            {highlighted.map((effect) => (
                                <span key={effect.id} className="environment-row__effect" data-gene={effect.trait}>
                                    <GeneIcon trait={effect.trait} aria-hidden="true" />
                                    <b>{signed(effect.modifier)}</b>
                                    {/* The colour carries it visually; the label carries it for everyone else. */}
                                    <span className="ev-visually-hidden">{AFFINITY_LABEL[effect.tone]} per {effect.label}</span>
                                </span>
                            ))}
                        </span>
                    ) : null}
                </button>

                <button
                    type="button"
                    className="environment-row__next"
                    disabled={!nextRoundEvent}
                    onClick={() => setDetailTarget('next')}
                    aria-label={nextRoundEvent ? `Prossimo ambiente: ${nextRoundEvent.title}. Apri i dettagli` : 'Nessun ambiente successivo'}
                >
                    {nextRoundEvent ? <EventThumb roundEvent={nextRoundEvent} className="environment-thumb--next" /> : null}
                    <span className="environment-row__next-title">{nextRoundEvent?.title ?? 'Fine'}</span>
                </button>
            </Panel>

            {/*
              * Straight on the artwork, no panel. `aria-hidden` because the briefing button above
              * already reads this description out: on screen it is a caption, not a second control.
              */}
            <p className="environment-line" aria-hidden="true">{roundEvent.description}</p>

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
