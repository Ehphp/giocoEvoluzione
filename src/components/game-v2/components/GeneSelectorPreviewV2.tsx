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
            className={`selector-v2-card ${isSelected ? 'is-selected' : ''} ${isSide ? 'is-side' : ''} ${gene.usable ? '' : 'is-cooldown'}`}
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
    const selectedGene = genes[selectedIndex]

    if (total === 0) {
        return null
    }

    const prevIndex = wrapIndex(selectedIndex - 1, total)
    const nextIndex = wrapIndex(selectedIndex + 1, total)
    const prevGene = genes[prevIndex]
    const nextGene = genes[nextIndex]

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

    return (
        <section className="selector-v2" aria-label="Selettore geni">
            <div className="selector-v2-header">
                <strong>SCEGLI UN GENE</strong>
                <span>{selectedIndex + 1}/{total}</span>
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
                    {prevGene ? (
                        <GeneCard
                            gene={prevGene}
                            isSelected={false}
                            isSide
                            disabled={disableSelection}
                            onClick={() => !disableSelection && onSelectGene(prevGene.id)}
                        />
                    ) : null}

                    {selectedGene ? (
                        <GeneCard
                            gene={selectedGene}
                            isSelected
                            isSide={false}
                            disabled={disableSelection}
                            onClick={() => { }}
                        />
                    ) : null}

                    {nextGene ? (
                        <GeneCard
                            gene={nextGene}
                            isSelected={false}
                            isSide
                            disabled={disableSelection}
                            onClick={() => !disableSelection && onSelectGene(nextGene.id)}
                        />
                    ) : null}
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

            {selectedGene ? (
                <div className="selector-v2-summary" aria-live="polite">
                    <strong>{selectedGene.name} · Lv. {selectedGene.level}</strong>
                    <span>
                        {affinityLabel(selectedGene.affinity)}
                        {' · '}
                        {selectedGene.usable ? 'USA disponibile' : selectedGene.disabledReason ?? 'USA non disponibile'}
                    </span>
                </div>
            ) : null}
        </section>
    )
}
