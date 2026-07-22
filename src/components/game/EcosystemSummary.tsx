type EcosystemSummaryProps = {
    biomeName: string
    intensityLabel: string
    conditions: string[]
    favoredTraits: string[]
    penalizedTraits: string[]
    rivalEdgeLabel: string
    detailRows: Array<{ label: string; value: string }>
}

export function EcosystemSummary({
    biomeName,
    intensityLabel,
    conditions,
    favoredTraits,
    penalizedTraits,
    rivalEdgeLabel,
    detailRows,
}: EcosystemSummaryProps) {
    return (
        <section className="ecosystem-summary" aria-label="Sintesi ecosistema condiviso">
            <div className="ecosystem-summary__top">
                <strong>{biomeName}</strong>
                <span className="ecosystem-summary__intensity">{intensityLabel}</span>
            </div>

            <p className="ecosystem-summary__conditions">{conditions.join(' · ') || 'Condizioni variabili'}</p>

            <div className="ecosystem-summary__traits">
                <p>
                    <span>Favoriti</span>
                    <strong>{favoredTraits.slice(0, 2).join(' · ') || 'n/d'}</strong>
                </p>
                <p>
                    <span>Penalizzati</span>
                    <strong>{penalizedTraits.slice(0, 2).join(' · ') || 'n/d'}</strong>
                </p>
            </div>

            <p className="ecosystem-summary__edge">{rivalEdgeLabel}</p>

            <details className="ecosystem-summary__details">
                <summary>Dati bioma +</summary>
                <div className="ecosystem-summary__detail-grid">
                    {detailRows.map((row) => (
                        <p key={row.label}>
                            <span>{row.label}</span>
                            <strong>{row.value}</strong>
                        </p>
                    ))}
                </div>
            </details>
        </section>
    )
}
