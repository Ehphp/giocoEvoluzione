import type { TraitTradeoffMock } from '../../game/ui-context'

type TraitImpactPanelProps = {
    traitLabel: string | null
    traitLevel: number
    traitStatus: string
    affinityLabel: 'Favorito' | 'Penalizzato' | 'Neutro'
    useRoundValue: number | null
    evolveRoundValue: number | null
    rivalDeltaUse: number | null
    rivalDeltaEvolve: number | null
    strategyNote: string
    tradeoff: TraitTradeoffMock | null
}

function formatDelta(value: number | null): string {
    if (value === null) {
        return 'n/d'
    }

    if (value > 0) {
        return `+${value}`
    }

    return String(value)
}

export function TraitImpactPanel({
    traitLabel,
    traitLevel,
    traitStatus,
    affinityLabel,
    useRoundValue,
    evolveRoundValue,
    rivalDeltaUse,
    rivalDeltaEvolve,
    strategyNote,
    tradeoff,
}: TraitImpactPanelProps) {
    const displayAffinityLabel = affinityLabel === 'Penalizzato' ? 'Bassa affinità' : affinityLabel

    if (!traitLabel) {
        return (
            <section className="trait-impact selected-trait-summary" aria-live="polite">
                <strong>Gene selezionato</strong>
                <span>Seleziona un gene per vedere il suo impatto</span>
            </section>
        )
    }

    return (
        <section className="trait-impact selected-trait-summary" aria-live="polite">
            <header className="trait-impact__header">
                <strong>{traitLabel} · Livello {traitLevel}</strong>
                <span>{traitStatus} · {displayAffinityLabel}</span>
            </header>

            <div className="trait-impact__grid">
                <article>
                    <span>USE</span>
                    <strong>Effetto ora: {useRoundValue ?? 'n/d'}</strong>
                    <p>Delta round: {formatDelta(rivalDeltaUse)}</p>
                </article>
                <article>
                    <span>EVOLVE</span>
                    <strong>Effetto futuro: {evolveRoundValue ?? 'n/d'}</strong>
                    <p>Delta prossimo: {formatDelta(rivalDeltaEvolve)}</p>
                </article>
            </div>

            <p className="trait-impact__note">{strategyNote}</p>

            {tradeoff ? (
                <div className="trait-impact__tradeoff">
                    <span>Sopravvivenza {tradeoff.survivalShift}</span>
                    <span>Compromesso {tradeoff.compromise}</span>
                </div>
            ) : null}
        </section>
    )
}
