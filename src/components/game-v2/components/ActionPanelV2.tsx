type ActionPanelV2Props = {
    selectedAction: 'USE' | 'EVOLVE' | null
    selectedGeneName: string | null
    canUse: boolean
    canEvolve: boolean
    isSubmitting: boolean
    onUseAction: () => Promise<void>
    onEvolveAction: () => Promise<void>
}

export function ActionPanelV2({
    selectedAction,
    selectedGeneName,
    canUse,
    canEvolve,
    isSubmitting,
    onUseAction,
    onEvolveAction,
}: ActionPanelV2Props) {
    const useLabel = isSubmitting && selectedAction === 'USE' ? 'INVIO...' : 'USA'
    const evolveLabel = isSubmitting && selectedAction === 'EVOLVE' ? 'INVIO...' : 'EVOLVI'

    return (
        <section className="gene-v2-action-panel" aria-label="Azioni disponibili" data-testid="gene-action-panel">
            <button
                type="button"
                className={`gene-v2-action-btn gene-v2-action-btn--use ${selectedAction === 'USE' ? 'is-active' : ''}`}
                onClick={() => {
                    void onUseAction()
                }}
                aria-pressed={selectedAction === 'USE'}
                disabled={!canUse || isSubmitting}
            >
                <span className="gene-v2-action-icon" aria-hidden="true">DNA</span>
                <span>{useLabel}</span>
                <small>{selectedGeneName ? `${selectedGeneName} · Effetto immediato` : 'Effetto immediato'}</small>
            </button>

            <button
                type="button"
                className={`gene-v2-action-btn gene-v2-action-btn--evolve ${selectedAction === 'EVOLVE' ? 'is-active' : ''}`}
                onClick={() => {
                    void onEvolveAction()
                }}
                aria-pressed={selectedAction === 'EVOLVE'}
                disabled={!canEvolve || isSubmitting}
            >
                <span className="gene-v2-action-icon" aria-hidden="true">UP</span>
                <span>{evolveLabel}</span>
                <small>{selectedGeneName ? `${selectedGeneName} · Upgrade livello` : 'Upgrade livello'}</small>
            </button>
        </section>
    )
}
