import type { GeneCardV2 } from '../types'

type GeneSelectorPreviewV2Props = {
    genes: GeneCardV2[]
    selectedGeneId: string
    onSelectGene: (geneId: string) => void
    disableSelection?: boolean
}

function affinityLabel(affinity: GeneCardV2['affinity']): string {
    if (affinity === 'excellent') {
        return 'Affinita eccellente'
    }

    if (affinity === 'high') {
        return 'Affinita alta'
    }

    if (affinity === 'medium') {
        return 'Affinita media'
    }

    return 'Affinita bassa'
}

export function GeneSelectorPreviewV2({ genes, selectedGeneId, onSelectGene, disableSelection = false }: GeneSelectorPreviewV2Props) {
    const total = genes.length

    if (total === 0) {
        return null
    }

    const selectedIndex = Math.max(0, genes.findIndex((gene) => gene.id === selectedGeneId))

    function getWrappedIndex(index: number): number {
        if (total === 0) {
            return 0
        }

        return (index + total) % total
    }

    function goToOffset(offset: number) {
        if (total < 2 || disableSelection) {
            return
        }

        const nextIndex = getWrappedIndex(selectedIndex + offset)
        const nextGene = genes[nextIndex]

        if (nextGene) {
            onSelectGene(nextGene.id)
        }
    }

    const leftGene = genes[getWrappedIndex(selectedIndex - 1)]
    const centerGene = genes[selectedIndex]
    const rightGene = genes[getWrappedIndex(selectedIndex + 1)]

    const previewGenes = total >= 3
        ? [leftGene, centerGene, rightGene]
        : [centerGene, rightGene].filter((gene, index, array) => {
            return gene && array.findIndex((item) => item?.id === gene.id) === index
        })

    return (
        <section className="gene-v2-selector" aria-label="Anteprima selettore geni">
            <header className="gene-v2-selector-head">
                <strong>Selettore geni</strong>
                <span>{selectedIndex + 1}/{total}</span>
            </header>

            <div className="gene-v2-selector-nav">
                <button
                    type="button"
                    className="gene-v2-nav-btn"
                    onClick={() => goToOffset(-1)}
                    aria-label="Gene precedente"
                    disabled={disableSelection}
                >
                    ‹
                </button>
                <button
                    type="button"
                    className="gene-v2-nav-btn"
                    onClick={() => goToOffset(1)}
                    aria-label="Gene successivo"
                    disabled={disableSelection}
                >
                    ›
                </button>
            </div>

            <div className="gene-v2-selector-rail" role="listbox" aria-label="Card geni visibili">
                {previewGenes.map((gene, index) => {
                    const isCenter = gene.id === selectedGeneId
                    const isSelected = gene.id === selectedGeneId

                    return (
                        <button
                            key={`${gene.id}-${index}`}
                            type="button"
                            role="option"
                            className={`gene-v2-gene-card ${isCenter ? 'is-center' : 'is-side'} ${isSelected ? 'is-selected' : ''} ${gene.usable ? '' : 'is-use-disabled'}`}
                            aria-selected={isSelected}
                            onClick={() => onSelectGene(gene.id)}
                            onKeyDown={(event) => {
                                if (event.key === 'ArrowLeft') {
                                    event.preventDefault()
                                    goToOffset(-1)
                                }

                                if (event.key === 'ArrowRight') {
                                    event.preventDefault()
                                    goToOffset(1)
                                }
                            }}
                            disabled={disableSelection}
                        >
                            <div className="gene-v2-gene-icon" role="img" aria-label={`Icona gene ${gene.name}`}>
                                <img src={gene.imageUrl} alt="" loading="lazy" onError={(event) => {
                                    event.currentTarget.style.display = 'none'
                                }} />
                                <span>{gene.name.slice(0, 2).toUpperCase()}</span>
                            </div>
                            <strong>{gene.name}</strong>
                            <small>Lv {gene.level}</small>
                            <span className={`gene-v2-affinity is-${gene.affinity}`}>{affinityLabel(gene.affinity)}</span>
                            {!gene.usable ? <small>USE bloccato</small> : null}
                        </button>
                    )
                })}
            </div>

            <div className="gene-v2-dots" aria-hidden="true">
                {genes.map((gene) => (
                    <span key={gene.id} className={gene.id === selectedGeneId ? 'is-active' : ''} />
                ))}
            </div>
        </section>
    )
}
