import type { WaitingStateV2 as WaitingStateV2Data } from '../types'

type WaitingStateV2Props = {
    waitingState: WaitingStateV2Data
}

export function WaitingStateV2({ waitingState }: WaitingStateV2Props) {
    return (
        <section className="gene-v2-waiting" aria-live="polite" aria-label="Stato attesa multiplayer">
            <span className="gene-v2-eyebrow">{waitingState.isResolving ? 'SCELTE RICEVUTE' : 'SCELTA INVIATA'}</span>
            <strong>
                {waitingState.submittedGeneName} · {waitingState.submittedAction}
            </strong>
            <p>{waitingState.isResolving ? 'Risoluzione del round...' : waitingState.opponentStatusLabel}</p>
            <span className="gene-v2-waiting-count">{waitingState.submittedCountLabel}</span>
        </section>
    )
}
