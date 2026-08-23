import { useEffect, useState, type KeyboardEvent } from 'react'

import { MAX_ADAPTATION_LEVEL, NATURAL_ADVANTAGE_BONUS } from '../../../../shared/game-rules/catalog.ts'
import type { TraitType } from '../../../game/types'
import { Chip, Overlay, Panel, SheetHeader } from '../../../ui/components'
import { playCue } from '../../../ui/feedback/feedback'
import { ArrowDownIcon, ArrowUpIcon, ChevronIcon, GeneIcon, InfoIcon } from '../../../ui/icons'
import type { GeneCardV2 } from '../controller/types'

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

/** One adaptation's glyph in its own colour. The unit both the strip and the orbs are read by. */
function GeneGlyph({ trait, className = '' }: { trait: TraitType; className?: string }) {
    return (
        <span className={`gene-glyph ${className}`} data-gene={trait} aria-hidden="true">
            <GeneIcon trait={trait} />
        </span>
    )
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

/**
 * The selected gene's two matchups, said with glyphs.
 *
 * One pattern read twice: `attacker → victim`. Left, this gene beating the one it counters; right,
 * the one that counters it beating this gene. No words at all, which is the point — the row below is
 * already five glyphs, so the strip reuses the same alphabet instead of translating it into names.
 *
 * It sits *above* the orbs, where the explanatory card used to sit below them. Same information, a
 * third of the height, and it no longer separates the genes from the actions they feed.
 */
function GeneMatchupStrip({ gene, onOpenDetail }: { gene: GeneCardV2; onOpenDetail: () => void }) {
    return (
        <button
            type="button"
            className="gene-matchup"
            onClick={onOpenDetail}
            aria-label={`${gene.name}: forte contro ${gene.strongAgainst}, teme ${gene.weakAgainst}. Apri i dettagli`}
        >
            <span className="gene-matchup__pair gene-matchup__pair--strong">
                <GeneGlyph trait={gene.traitType} />
                <ChevronIcon aria-hidden="true" />
                <GeneGlyph trait={gene.strongAgainstTrait} />
            </span>
            <span className="gene-matchup__divider" aria-hidden="true" />
            <span className="gene-matchup__pair gene-matchup__pair--weak">
                <GeneGlyph trait={gene.weakAgainstTrait} />
                <ChevronIcon aria-hidden="true" />
                <GeneGlyph trait={gene.traitType} />
            </span>
            <span className="gene-matchup__info" aria-hidden="true"><InfoIcon /></span>
        </button>
    )
}

function GeneOrb({ gene, isSelected, disabled, tabIndex, onActivate, onKeyDown }: {
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
            /*
             * Level is a frame, not a caption — see `.gene-orb__frame`. An attribute rather than a
             * class, so the CSS reads as one rule per level. Clamped to the range the frames cover, so
             * a level the stylesheet has no frame for falls back to the nearest one it does.
             */
            data-level={Math.max(0, Math.min(gene.level, MAX_ADAPTATION_LEVEL))}
            className={`gene-orb ${isSelected ? 'is-selected' : ''} ${gene.exhausted ? 'is-exhausted' : ''}`}
            aria-selected={isSelected}
            aria-label={`${gene.name}, livello ${gene.level}, ${gene.usable ? 'disponibile' : 'esaurito'}, valore ambientale ${gene.prediction ? gene.prediction.useScore : 'non disponibile'}, ${AFFINITY_FULL[gene.affinity]}${isSelected ? '. Tocca di nuovo per i dettagli' : ''}`}
            tabIndex={tabIndex}
            disabled={disabled}
            onClick={onActivate}
            onKeyDown={onKeyDown}
        >
            <span className="gene-orb__disc" aria-hidden="true">
                <span className="gene-orb__frame" />
                <GeneIcon trait={gene.traitType} />
                <b className="gene-orb__score">{gene.prediction ? gene.prediction.useScore : '—'}</b>
            </span>
            <span className="gene-orb__name ev-truncate">{gene.name}</span>
        </button>
    )
}

export function GeneCarousel({ genes, selectedGeneId, onSelectGene, disableSelection }: GeneCarouselProps) {
    const [detailGeneId, setDetailGeneId] = useState<string | null>(null)
    const selectedIndex = Math.max(0, genes.findIndex((gene) => gene.id === selectedGeneId))
    const selectedGene = genes[selectedIndex] ?? null
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
            {selectedGene ? (
                <GeneMatchupStrip gene={selectedGene} onOpenDetail={() => setDetailGeneId(selectedGene.id)} />
            ) : null}

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

            {detailGene ? <GeneDetailSheet gene={detailGene} onClose={() => setDetailGeneId(null)} /> : null}
        </section>
    )
}
