import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { NATURAL_ADVANTAGE_BONUS } from '../../../../shared/game-rules/catalog.ts'
import { Chip, Overlay, Panel, SheetHeader } from '../../../ui/components'
import { ArrowDownIcon, ArrowUpIcon, GeneIcon, InfoIcon } from '../../../ui/icons'
import type { GeneCardV2 } from '../../../components/game-v2/types'

type GeneCarouselProps = {
    genes: GeneCardV2[]
    selectedGeneId: string
    onSelectGene: (geneId: string) => void
    disableSelection: boolean
}

const AFFINITY_SHORT: Record<GeneCardV2['affinity'], string> = {
    ideal: 'Ottimo',
    suitable: 'Adatto',
    unfavorable: 'Scarso',
}

const AFFINITY_FULL: Record<GeneCardV2['affinity'], string> = {
    ideal: 'Affinita ideale con l ambiente',
    suitable: 'Affinita adatta all ambiente',
    unfavorable: 'Affinita sfavorevole in questo ambiente',
}

const AFFINITY_TONE = { ideal: 'good', suitable: 'info', unfavorable: 'bad' } as const

function formatContribution(value: number): string {
    return value > 0 ? `+${value}` : String(value)
}

function GeneDetailSheet({ gene, onClose }: { gene: GeneCardV2; onClose: () => void }) {
    const prediction = gene.prediction

    return (
        <Overlay label={`Dettagli ${gene.name}`} onClose={onClose}>
            <Panel className="gene-detail" data-gene={gene.traitType}>
                <SheetHeader eyebrow={gene.usable ? 'Adattamento disponibile' : 'Adattamento esaurito'} title={gene.name} onClose={onClose} />

                <div className="gene-detail__summary">
                    <span className="gene-detail__glyph" aria-hidden="true"><GeneIcon trait={gene.traitType} /></span>
                    <div>
                        <span className="ev-eyebrow">Livello {gene.level}</span>
                        <strong className="gene-detail__score">{prediction ? `${prediction.useScore} PT` : '— PT'}</strong>
                    </div>
                    <Chip tone={AFFINITY_TONE[gene.affinity]}>{AFFINITY_SHORT[gene.affinity]}</Chip>
                </div>

                {prediction ? (
                    <ul className="gene-detail__breakdown" aria-label="Calcolo del valore ambientale">
                        <li><span>Base</span><strong>{formatContribution(prediction.baseContribution)}</strong></li>
                        <li><span>Livello</span><strong>{formatContribution(prediction.levelContribution)}</strong></li>
                        <li><span>Ambiente</span><strong>{formatContribution(prediction.eventModifier)}</strong></li>
                    </ul>
                ) : (
                    <p className="gene-detail__note">Valore ambientale non disponibile.</p>
                )}

                <p className="gene-detail__note">{prediction?.reasons[0] ?? AFFINITY_FULL[gene.affinity]}</p>

                <div className="gene-detail__matchup">
                    <p className="gene-detail__fact gene-detail__fact--strong">
                        <ArrowUpIcon aria-hidden="true" />
                        <span>Forte contro</span>
                        <strong>{gene.strongAgainst} +{NATURAL_ADVANTAGE_BONUS}</strong>
                    </p>
                    <p className="gene-detail__fact gene-detail__fact--weak">
                        <ArrowDownIcon aria-hidden="true" />
                        <span>Teme</span>
                        <strong>{gene.weakAgainst}</strong>
                    </p>
                </div>
                <p className="gene-detail__note">Il vantaggio naturale si attiva solo quando entrambi scelgono USA; il matchup avversario resta nascosto.</p>
            </Panel>
        </Overlay>
    )
}

function GeneCard({ gene, isSelected, disabled, tabIndex, onActivate, onKeyDown }: {
    gene: GeneCardV2
    isSelected: boolean
    disabled: boolean
    tabIndex: number
    onActivate: () => void
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
    return (
        <button
            type="button"
            role="option"
            data-gene={gene.traitType}
            className={`gene-card ${isSelected ? 'is-selected' : ''} ${gene.exhausted ? 'is-exhausted' : ''}`}
            aria-selected={isSelected}
            aria-label={`${gene.name}, livello ${gene.level}, ${gene.usable ? 'disponibile' : 'esaurito'}, valore ambientale ${gene.prediction ? gene.prediction.useScore : 'non disponibile'}, ${AFFINITY_FULL[gene.affinity]}${isSelected ? '. Tocca di nuovo per i dettagli' : ''}`}
            tabIndex={tabIndex}
            disabled={disabled}
            onClick={onActivate}
            onKeyDown={onKeyDown}
        >
            <span className="gene-card__icon" aria-hidden="true">
                <GeneIcon trait={gene.traitType} />
                <b className="gene-card__value">{gene.prediction ? gene.prediction.useScore : '—'}</b>
            </span>
            <strong className="gene-card__name ev-truncate">{gene.name}</strong>
            <span className="gene-card__level">Liv. {gene.level}</span>
            <span className={`gene-card__affinity gene-card__affinity--${gene.affinity}`}>{AFFINITY_SHORT[gene.affinity]}</span>
            {gene.exhausted ? <span className="gene-card__exhausted">Esaurito</span> : null}
        </button>
    )
}

export function GeneCarousel({ genes, selectedGeneId, onSelectGene, disableSelection }: GeneCarouselProps) {
    const trackRef = useRef<HTMLDivElement>(null)
    const [detailGeneId, setDetailGeneId] = useState<string | null>(null)
    const selectedIndex = Math.max(0, genes.findIndex((gene) => gene.id === selectedGeneId))
    const detailGene = detailGeneId ? genes.find((gene) => gene.id === detailGeneId) ?? null : null

    useEffect(() => {
        setDetailGeneId(null)
    }, [selectedGeneId, disableSelection])

    useEffect(() => {
        const track = trackRef.current
        const card = track?.children[selectedIndex] as HTMLElement | undefined

        // `scrollTo` is absent in non-browser test environments.
        if (!track || !card || typeof track.scrollTo !== 'function') {
            return
        }

        // Centre the active card without scrolling the surrounding page.
        track.scrollTo({ left: card.offsetLeft - (track.clientWidth - card.clientWidth) / 2, behavior: 'smooth' })
    }, [selectedIndex])

    if (!genes.length) {
        return null
    }

    function selectByIndex(index: number) {
        const gene = genes[index]

        if (disableSelection || !gene || index === selectedIndex) {
            return
        }

        setDetailGeneId(null)
        onSelectGene(gene.id)
    }

    function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        if (event.key === 'ArrowLeft') {
            event.preventDefault()
            selectByIndex(selectedIndex - 1)
        } else if (event.key === 'ArrowRight') {
            event.preventDefault()
            selectByIndex(selectedIndex + 1)
        } else if (event.key === 'Home') {
            event.preventDefault()
            selectByIndex(0)
        } else if (event.key === 'End') {
            event.preventDefault()
            selectByIndex(genes.length - 1)
        } else if (event.key === 'Escape') {
            setDetailGeneId(null)
        }
    }

    return (
        <section className="gene-carousel" aria-label="Selettore adattamenti">
            {/*
             * No heading and no stepper arrows: every card is directly tappable and arrow keys still
             * move the selection, so the row spends the whole width and height on the cards themselves.
             */}
            <div ref={trackRef} className="gene-carousel__track" role="listbox" aria-label="Adattamenti disponibili">
                {genes.map((gene, index) => (
                    <GeneCard
                        key={gene.id}
                        gene={gene}
                        isSelected={index === selectedIndex}
                        disabled={disableSelection}
                        tabIndex={index === selectedIndex ? 0 : -1}
                        onActivate={() => {
                            if (index === selectedIndex) {
                                setDetailGeneId((current) => current === gene.id ? null : gene.id)
                            } else {
                                selectByIndex(index)
                            }
                        }}
                        onKeyDown={handleKeyDown}
                    />
                ))}
            </div>

            {genes[selectedIndex] ? (
                <button
                    type="button"
                    className="gene-matchup"
                    data-gene={genes[selectedIndex]!.traitType}
                    onClick={() => setDetailGeneId(genes[selectedIndex]!.id)}
                    aria-label={`${genes[selectedIndex]!.name}: forte contro ${genes[selectedIndex]!.strongAgainst}, teme ${genes[selectedIndex]!.weakAgainst}. Apri i dettagli`}
                >
                    <span className="gene-matchup__glyph" aria-hidden="true"><GeneIcon trait={genes[selectedIndex]!.traitType} /></span>
                    <span className="gene-matchup__facts">
                        <span className="gene-matchup__fact gene-matchup__fact--strong">
                            <ArrowUpIcon aria-hidden="true" />
                            <small>Forte contro</small>
                            <b className="ev-truncate">{genes[selectedIndex]!.strongAgainst}</b>
                        </span>
                        <span className="gene-matchup__divider" aria-hidden="true" />
                        <span className="gene-matchup__fact gene-matchup__fact--weak">
                            <ArrowDownIcon aria-hidden="true" />
                            <small>Teme</small>
                            <b className="ev-truncate">{genes[selectedIndex]!.weakAgainst}</b>
                        </span>
                    </span>
                    <span className="gene-matchup__info" aria-hidden="true"><InfoIcon /></span>
                </button>
            ) : null}

            {detailGene ? <GeneDetailSheet gene={detailGene} onClose={() => setDetailGeneId(null)} /> : null}
        </section>
    )
}
