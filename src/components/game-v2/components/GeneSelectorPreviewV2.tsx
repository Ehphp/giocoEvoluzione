import type { GeneCardV2 } from '../types'

type GeneSelectorPreviewV2Props = {
    genes: GeneCardV2[]
    selectedGeneId: string
    onSelectGene: (geneId: string) => void
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

export function GeneSelectorPreviewV2({ genes, selectedGeneId, onSelectGene }: GeneSelectorPreviewV2Props) {
    const selectedIndex = Math.max(0, genes.findIndex((gene) => gene.id === selectedGeneId))
    const leftIndex = Math.max(0, selectedIndex - 1)
    const rightIndex = Math.min(genes.length - 1, selectedIndex + 1)
    const previewGenes = [genes[leftIndex], genes[selectedIndex], genes[rightIndex]].filter(Boolean) as GeneCardV2[]

    return (
        <section className="gene-v2-selector" aria-label="Anteprima selettore geni">
            <header className="gene-v2-selector-head">
                <strong>Selettore geni</strong>
                <span>{selectedIndex + 1}/{genes.length}</span>
            </header>

            <div className="gene-v2-selector-rail" role="listbox" aria-label="Card geni visibili">
                {previewGenes.map((gene, index) => {
                    const isCenter = index === 1 || (previewGenes.length < 3 && gene.id === selectedGeneId)
                    const isSelected = gene.id === selectedGeneId

                    return (
                        <button
                            key={`${gene.id}-${index}`}
                            type="button"
                            role="option"
                            className={`gene-v2-gene-card ${isCenter ? 'is-center' : 'is-side'} ${isSelected ? 'is-selected' : ''}`}
                            aria-selected={isSelected}
                            onClick={() => onSelectGene(gene.id)}
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
