import type { GeneCardV2 } from '../types'

type SelectedGeneDetailsV2Props = {
    gene: GeneCardV2
}

function affinityBadge(affinity: GeneCardV2['affinity']): string {
    if (affinity === 'excellent') {
        return 'ECCELLENTE'
    }

    if (affinity === 'high') {
        return 'ALTA'
    }

    if (affinity === 'medium') {
        return 'MEDIA'
    }

    return 'BASSA'
}

export function SelectedGeneDetailsV2({ gene }: SelectedGeneDetailsV2Props) {
    return (
        <section className="gene-v2-selected" aria-live="polite" aria-label="Dettagli gene selezionato">
            <header className="gene-v2-selected-header">
                <div>
                    <span className="gene-v2-eyebrow">Gene selezionato</span>
                    <strong>{gene.name}</strong>
                </div>
                <span className="gene-v2-selected-level">Lv {gene.level}</span>
            </header>
            <p>{gene.description}</p>
            <div className="gene-v2-selected-facts">
                <span>Affinita {affinityBadge(gene.affinity)}</span>
                <span>USE previsto {gene.predictedValue ?? 'n/d'}</span>
            </div>
        </section>
    )
}
