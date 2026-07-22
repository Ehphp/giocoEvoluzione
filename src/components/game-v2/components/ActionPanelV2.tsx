type ActionPanelV2Props = {
    selectedAction: 'USE' | 'EVOLVE' | null
    onActionSelect: (action: 'USE' | 'EVOLVE') => void
}

export function ActionPanelV2({ selectedAction, onActionSelect }: ActionPanelV2Props) {
    return (
        <section className="gene-v2-action-panel" aria-label="Azioni disponibili" data-testid="gene-action-panel">
            <button
                type="button"
                className={`gene-v2-action-btn gene-v2-action-btn--use ${selectedAction === 'USE' ? 'is-active' : ''}`}
                onClick={() => onActionSelect('USE')}
                aria-pressed={selectedAction === 'USE'}
            >
                <span className="gene-v2-action-icon" aria-hidden="true">DNA</span>
                <span>USA</span>
                <small>Effetto immediato</small>
            </button>

            <button
                type="button"
                className={`gene-v2-action-btn gene-v2-action-btn--evolve ${selectedAction === 'EVOLVE' ? 'is-active' : ''}`}
                onClick={() => onActionSelect('EVOLVE')}
                aria-pressed={selectedAction === 'EVOLVE'}
            >
                <span className="gene-v2-action-icon" aria-hidden="true">UP</span>
                <span>EVOLVI</span>
                <small>Upgrade livello</small>
            </button>
        </section>
    )
}
