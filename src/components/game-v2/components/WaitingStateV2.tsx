import type { WaitingStateV2 as WaitingStateV2Data } from '../types'

type WaitingStateV2Props = {
    waitingState: WaitingStateV2Data
}

export function WaitingStateV2({ waitingState }: WaitingStateV2Props) {
    return (
        <section className="waiting-v2" aria-live="polite" aria-label="Stato attesa multiplayer">
            <div className="waiting-v2-main">
                <span className="waiting-v2-eyebrow">{waitingState.isResolving ? 'SCELTE RICEVUTE' : 'SCELTA INVIATA'}</span>
                <strong className="waiting-v2-choice">
                    {waitingState.submittedGeneName} · {waitingState.submittedAction === 'USE' ? 'USA' : 'EVOLVI'}
                </strong>
                <p className="waiting-v2-status">
                    {waitingState.isResolving ? 'Risoluzione del round...' : waitingState.opponentStatusLabel}
                </p>
            </div>
            <span className="waiting-v2-count" aria-label="Scelte ricevute">
                {waitingState.submittedCountLabel}
            </span>
        </section>
    )
}
