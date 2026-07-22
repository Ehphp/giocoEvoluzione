type ActionDockProps = {
    isBusy: boolean
    pendingAction: 'USE' | 'EVOLVE' | null
    hasSelection: boolean
    useDisabled: boolean
    evolveDisabled: boolean
    onUse: () => void
    onEvolve: () => void
    useDetail: string
    evolveDetail: string
    helperText: string
    selectedTraitLabel?: string | null
    selectedTraitDescription?: string | null
    selectedTraitLevel?: number | null
    nextTraitLevel?: number | null
    useBlockedReason?: string | null
    submittedTitle?: string | null
    submittedActionType?: 'USE' | 'EVOLVE' | null
    submittedTraitLabel?: string | null
    submittedProgressLabel?: string | null
    isSubmitted: boolean
    waitingDetail?: string | null
}

export function ActionDock({
    isBusy,
    pendingAction,
    hasSelection,
    useDisabled,
    evolveDisabled,
    onUse,
    onEvolve,
    useDetail,
    evolveDetail,
    helperText,
    selectedTraitLabel,
    selectedTraitDescription,
    selectedTraitLevel,
    nextTraitLevel,
    useBlockedReason,
    submittedTitle,
    submittedActionType,
    submittedTraitLabel,
    submittedProgressLabel,
    isSubmitted,
    waitingDetail,
}: ActionDockProps) {
    return (
        <section className="action-dock" aria-live="polite" aria-busy={isBusy}>
            {!isSubmitted ? (
                <>
                    <div className="action-dock__selection">
                        <div className="action-dock__selection-head">
                            <strong>{selectedTraitLabel ?? 'Gene non selezionato'}</strong>
                            {selectedTraitLabel ? <span className="action-dock__selection-pill">Lv {selectedTraitLevel ?? 0}</span> : null}
                        </div>
                        <span>
                            {selectedTraitLabel
                                ? `${selectedTraitDescription ?? ''}${nextTraitLevel ? ` · EVOLVE -> Lv ${nextTraitLevel}` : ''}`
                                : 'Seleziona un gene dalla griglia per confrontare USE ed EVOLVE.'}
                        </span>
                    </div>
                    <p className="action-dock__helper">{helperText}</p>
                    <div className="action-dock__buttons">
                        <button type="button" className="action-dock__button action-dock__button--use" onClick={onUse} disabled={isBusy || useDisabled}>
                            <span className="action-dock__button-icon" aria-hidden="true">U</span>
                            <span className="action-dock__button-label">{pendingAction === 'USE' ? 'INVIO...' : 'USE'}</span>
                            <span className="action-dock__button-tone">Effetto immediato</span>
                            <span className="action-dock__button-copy">{useDetail}</span>
                        </button>
                        <button type="button" className="action-dock__button action-dock__button--evolve" onClick={onEvolve} disabled={isBusy || evolveDisabled}>
                            <span className="action-dock__button-icon" aria-hidden="true">E</span>
                            <span className="action-dock__button-label">{pendingAction === 'EVOLVE' ? 'INVIO...' : 'EVOLVE'}</span>
                            <span className="action-dock__button-tone">Upgrade del gene</span>
                            <span className="action-dock__button-copy">{evolveDetail}</span>
                        </button>
                    </div>
                    {useDisabled && useBlockedReason ? <span className="action-dock__hint">{useBlockedReason}</span> : null}
                    {!hasSelection ? <span className="action-dock__hint">Seleziona un tratto per continuare</span> : null}
                </>
            ) : (
                <div className="action-dock__submitted">
                    <div className="action-dock__submitted-grid">
                        <article>
                            <span>Stato</span>
                            <strong>{submittedTitle}</strong>
                        </article>
                        <article>
                            <span>Azione</span>
                            <strong>{submittedActionType ?? pendingAction ?? 'n/d'}</strong>
                        </article>
                        <article>
                            <span>Gene</span>
                            <strong>{submittedTraitLabel ?? 'n/d'}</strong>
                        </article>
                        <article>
                            <span>Sync</span>
                            <strong>{submittedProgressLabel ?? 'In corso'}</strong>
                        </article>
                    </div>
                    <div className="action-dock__waiting">
                        <span className="action-dock__spinner" aria-hidden="true" />
                        <span>{waitingDetail}</span>
                    </div>
                </div>
            )}
        </section>
    )
}