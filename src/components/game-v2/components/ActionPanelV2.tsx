type ActionPanelV2Props = {
    selectedAction: 'USE' | 'EVOLVE' | null
    onActionSelect: (action: 'USE' | 'EVOLVE') => void
}

export function ActionPanelV2({ selectedAction, onActionSelect }: ActionPanelV2Props) {
    return (
        <section className="gene-v2-action-panel" aria-label="Azioni disponibili">
            <button
                type="button"
                className={`gene-v2-action-btn ${selectedAction === 'USE' ? 'is-active' : ''}`}
                onClick={() => onActionSelect('USE')}
            >
                <span>USA</span>
                <small>Effetto immediato (mock)</small>
            </button>

            <button
                type="button"
                className={`gene-v2-action-btn ${selectedAction === 'EVOLVE' ? 'is-active' : ''}`}
                onClick={() => onActionSelect('EVOLVE')}
            >
                <span>EVOLVI</span>
                <small>Upgrade livello (mock)</small>
            </button>
        </section>
    )
}
