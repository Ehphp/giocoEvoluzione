import type { GeneCardV2 } from '../types'

type GeneSelectorPreviewV2Props = {
    genes: GeneCardV2[]
    selectedGeneId: string
    onSelectGene: (geneId: string) => void
    disableSelection?: boolean
}

function affinityLabel(affinity: GeneCardV2['affinity']): string {
    if (affinity === 'excellent') {
        return 'Ottimo'
    }

    if (affinity === 'high') {
        return 'Buono'
    }

    if (affinity === 'medium') {
        return 'Adatto'
    }

    return 'Bassa affinita'
}

function wrapIndex(index: number, total: number): number {
    if (total === 0) {
        return 0
    }

    return (index + total) % total
}

const VISIBLE_CARD_OFFSETS = [-2, -1, 0, 1, 2]

function GeneCard({
    gene,
    isSelected,
    isSide,
    disabled,
    onClick,
}: {
    gene: GeneCardV2
    isSelected: boolean
    isSide: boolean
    disabled: boolean
    onClick: () => void
}) {
    return (
        <button
            type="button"
            role="option"
            className={`selector-v2-card selector-v2-card--${gene.traitType.toLowerCase().replaceAll('_', '-')} ${isSelected ? 'is-selected' : ''} ${isSide ? 'is-side' : ''} ${gene.usable ? '' : 'is-cooldown'}`}
            aria-selected={isSelected}
            onClick={onClick}
            disabled={disabled}
        >
            <div className="selector-v2-icon" role="img" aria-label={`Icona gene ${gene.name}`}>
                <img src={gene.imageUrl} alt="" loading="lazy" onError={(event) => {
                    event.currentTarget.style.display = 'none'
                }} />
                <span aria-hidden="true">{gene.name.slice(0, 2).toUpperCase()}</span>
            </div>
            <strong className="selector-v2-name">{gene.name}</strong>
            <span className="selector-v2-level">Lv. {gene.level}</span>
            <span className={`selector-v2-affinity is-${gene.affinity}`}>{affinityLabel(gene.affinity)}</span>
            {!gene.usable ? <span className="selector-v2-cooldown">{gene.disabledReason}</span> : null}
        </button>
    )
}

export function GeneSelectorPreviewV2({ genes, selectedGeneId, onSelectGene, disableSelection = false }: GeneSelectorPreviewV2Props) {
    const total = genes.length
    const selectedIndex = Math.max(0, genes.findIndex((gene) => gene.id === selectedGeneId))

    if (total === 0) {
        return null
    }

    const visibleOffsets = total >= VISIBLE_CARD_OFFSETS.length
        ? VISIBLE_CARD_OFFSETS
        : Array.from({ length: total }, (_, index) => index - selectedIndex)

    function selectByOffset(offset: number) {
        if (disableSelection) {
            return
        }

        const nextIndex = wrapIndex(selectedIndex + offset, total)
        const nextGene = genes[nextIndex]

        if (nextGene && nextGene.id !== selectedGeneId) {
            onSelectGene(nextGene.id)
        }
    }

    function selectByIndex(index: number) {
        if (disableSelection || index === selectedIndex) {
            return
        }

        onSelectGene(genes[index].id)
    }

    return (
        <section className="selector-v2" aria-label="Selettore geni">
            <div className="selector-v2-header">
                <strong>SCEGLI UN GENE</strong>
                <span className="selector-v2-sr-only">Gene {selectedIndex + 1} di {total}</span>
            </div>

            <div className="selector-v2-carousel" role="listbox" aria-label="Card geni">
                <button
                    type="button"
                    className="selector-v2-arrow selector-v2-arrow--prev"
                    onClick={() => selectByOffset(-1)}
                    aria-label="Gene precedente"
                    disabled={disableSelection}
                >
                    ‹
                </button>

                <div className="selector-v2-rail">
                    {visibleOffsets.map((offset) => {
                        const geneIndex = wrapIndex(selectedIndex + offset, total)
                        const gene = genes[geneIndex]

                        return (
                            <GeneCard
                                key={`${gene.id}-${offset}`}
                                gene={gene}
                                isSelected={offset === 0}
                                isSide={offset !== 0}
                                disabled={disableSelection}
                                onClick={() => selectByIndex(geneIndex)}
                            />
                        )
                    })}
                </div>

                <button
                    type="button"
                    className="selector-v2-arrow selector-v2-arrow--next"
                    onClick={() => selectByOffset(1)}
                    aria-label="Gene successivo"
                    disabled={disableSelection}
                >
                    ›
                </button>
            </div>

            <div className="selector-v2-dots" role="tablist" aria-label="Posizione nel selettore geni">
                {genes.map((gene, index) => (
                    <button
                        key={gene.id}
                        type="button"
                        role="tab"
                        aria-selected={index === selectedIndex}
                        aria-label={`Seleziona ${gene.name}`}
                        className={`selector-v2-dot ${index === selectedIndex ? 'is-active' : ''}`}
                        onClick={() => selectByIndex(index)}
                        disabled={disableSelection}
                    />
                ))}
            </div>
        </section>
    )
}
