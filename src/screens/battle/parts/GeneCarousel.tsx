import { useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react'

import { MAX_ADAPTATION_LEVEL, NATURAL_ADVANTAGE_BONUS } from '../../../../shared/game-rules/catalog.ts'
import { Chip, Overlay, Panel, SheetHeader } from '../../../ui/components'
import { playCue } from '../../../ui/feedback/feedback'
import { ArrowDownIcon, ArrowUpIcon, GeneIcon, LockIcon } from '../../../ui/icons'
import type { GeneCardV2 } from '../controller/types'

type GeneCarouselProps = {
    genes: GeneCardV2[]
    selectedGeneId: string
    onSelectGene: (geneId: string) => void
    disableSelection: boolean
    longPressGeneId: string | null
    consumeSuppressedClick: (geneId: string) => boolean
    onGenePointerDown: (geneId: string, event: PointerEvent<HTMLButtonElement>) => void
    onGenePointerMove: (event: PointerEvent<HTMLButtonElement>) => void
    onGenePointerUp: (event: PointerEvent<HTMLButtonElement>) => void
    onGenePointerCancel: (event: PointerEvent<HTMLButtonElement>) => void
    onGeneLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => void
    draggedGeneId: string | null
}

type GeneOrbVisualProps = {
    gene: GeneCardV2
    isMatchupVisible?: boolean
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

function normalizedLevel(level: number): number {
    return Math.max(0, Math.min(level, MAX_ADAPTATION_LEVEL))
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
                        {prediction.mutationBonus ? <li><span>Nucleo adattivo</span><strong>+{prediction.mutationBonus}</strong></li> : null}
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
                {gene.mutationHints?.map((hint) => <p key={hint} className="gene-detail__note">{hint}</p>)}
            </Panel>
        </Overlay>
    )
}

export function GeneOrbVisual({ gene, isMatchupVisible = false }: GeneOrbVisualProps) {
    const expectedScore = gene.prediction?.useScore

    return (
        <span
            className={`gene-orb__visual ${gene.exhausted ? 'is-exhausted' : ''}`}
            data-level={normalizedLevel(gene.level)}
            aria-hidden="true"
        >
            <span className="gene-orb__matchups">
                {gene.strongAgainstTrait ? (
                    <span className="gene-orb__ear gene-orb__ear--strong" data-gene={gene.strongAgainstTrait}>
                        <GeneIcon trait={gene.strongAgainstTrait} />
                    </span>
                ) : null}
                {gene.weakAgainstTrait ? (
                    <span className="gene-orb__ear gene-orb__ear--weak" data-gene={gene.weakAgainstTrait}>
                        <GeneIcon trait={gene.weakAgainstTrait} />
                    </span>
                ) : null}
            </span>
            <span className="gene-orb__disc">
                <span className={`gene-orb__frame ${isMatchupVisible ? 'is-context-hidden' : ''}`} />
                <span className="gene-orb__content">
                    <span className={`gene-orb__icon ${isMatchupVisible ? 'is-context-hidden' : ''}`}>
                        <GeneIcon trait={gene.traitType} />
                    </span>
                </span>
                <b className={`gene-orb__score ${isMatchupVisible ? 'is-context-hidden' : ''}`}>
                    {expectedScore ?? '—'}
                </b>
                {gene.exhausted ? (
                    <span className="gene-orb__status">
                        <LockIcon />
                    </span>
                ) : null}
            </span>
            <b className="gene-orb__expected-score">{expectedScore ?? '—'}</b>
        </span>
    )
}

function GeneOrb({ gene, isSelected, isLongPressActive, isDragging, disabled, tabIndex, onActivate, onKeyDown, consumeSuppressedClick, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture }: {
    gene: GeneCardV2
    isSelected: boolean
    isLongPressActive: boolean
    isDragging: boolean
    disabled: boolean
    tabIndex: number
    onActivate: () => void
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
    consumeSuppressedClick: () => boolean
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void
    onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => void
}) {
    const matchupDescription = [
        gene.strongAgainstTrait && gene.strongAgainst ? `supera ${gene.strongAgainst}` : null,
        gene.weakAgainstTrait && gene.weakAgainst ? `viene superato da ${gene.weakAgainst}` : null,
    ].filter((description): description is string => Boolean(description)).join(', ')

    return (
        <button
            type="button"
            role="option"
            data-gene={gene.traitType}
            /*
             * Level is a frame, not a caption — see `.gene-orb__frame`. An attribute rather than a
             * class, so the CSS reads as one rule per level. Clamped to the range the frames cover, so
             * a level the stylesheet has no frame for falls back to the nearest one it does.
             */
            data-level={normalizedLevel(gene.level)}
            className={`gene-orb ${isSelected ? 'is-selected' : ''} ${gene.exhausted ? 'is-exhausted' : ''} ${isLongPressActive ? 'is-matchup-visible' : ''} ${isDragging ? 'is-dragging' : ''}`}
            aria-selected={isSelected}
            aria-label={`${gene.name}, livello ${gene.level}, ${gene.usable ? 'disponibile' : 'esaurito'}, valore ambientale ${gene.prediction ? gene.prediction.useScore : 'non disponibile'}, ${AFFINITY_FULL[gene.affinity]}${isLongPressActive && matchupDescription ? `. Matchup: ${matchupDescription}` : ''}${isSelected ? '. Tocca di nuovo per i dettagli' : ''}`}
            data-matchup-visible={isLongPressActive || undefined}
            tabIndex={tabIndex}
            disabled={disabled}
            onClick={(event) => {
                if (consumeSuppressedClick()) {
                    event.preventDefault()
                    return
                }

                onActivate()
            }}
            onKeyDown={onKeyDown}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onLostPointerCapture={onLostPointerCapture}
        >
            <GeneOrbVisual gene={gene} isMatchupVisible={isLongPressActive} />
            <span className="gene-orb__name ev-truncate">{gene.name}</span>
        </button>
    )
}

export function GeneCarousel({ genes, selectedGeneId, onSelectGene, disableSelection, longPressGeneId, consumeSuppressedClick, onGenePointerDown, onGenePointerMove, onGenePointerUp, onGenePointerCancel, onGeneLostPointerCapture, draggedGeneId }: GeneCarouselProps) {
    const [detailGeneId, setDetailGeneId] = useState<string | null>(null)
    const selectedIndex = Math.max(0, genes.findIndex((gene) => gene.id === selectedGeneId))
    const detailGene = detailGeneId ? genes.find((gene) => gene.id === detailGeneId) ?? null : null

    useEffect(() => {
        setDetailGeneId(null)
    }, [selectedGeneId, disableSelection])

    if (!genes.length) {
        return null
    }

    function selectByIndex(index: number) {
        const gene = genes[index]

        if (disableSelection || !gene || index === selectedIndex) {
            return
        }

        setDetailGeneId(null)
        // `select`, not `tap`: moving along the row is not a commitment, and it fires in bursts.
        playCue('select')
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
             * All five fit side by side down to 320px, so there is nothing to scroll and no stepper:
             * every orb is directly tappable and the arrow keys still walk the row. The orbs
             * bottom-align, which is what lets the selected one grow upward while the names stay on
             * one line.
             */}
            <div className="gene-orbs" role="listbox" aria-label="Adattamenti disponibili">
                {genes.map((gene, index) => (
                    <GeneOrb
                        key={gene.id}
                        gene={gene}
                        isSelected={index === selectedIndex}
                        isLongPressActive={longPressGeneId === gene.id}
                        isDragging={draggedGeneId === gene.id}
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
                        consumeSuppressedClick={() => consumeSuppressedClick(gene.id)}
                        onPointerDown={(event) => onGenePointerDown(gene.id, event)}
                        onPointerMove={onGenePointerMove}
                        onPointerUp={onGenePointerUp}
                        onPointerCancel={onGenePointerCancel}
                        onLostPointerCapture={onGeneLostPointerCapture}
                    />
                ))}
            </div>

            {detailGene ? <GeneDetailSheet gene={detailGene} onClose={() => setDetailGeneId(null)} /> : null}
        </section>
    )
}
