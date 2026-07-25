type ActionPanelV2Props = {
    selectedAction: 'USE' | 'EVOLVE' | null
    selectedGeneName: string | null
    canUse: boolean
    canEvolve: boolean
    isSubmitting: boolean
    onUseAction: () => Promise<void>
    onEvolveAction: () => Promise<void>
}

function ActionButton({
    variant,
    label,
    sublabel,
    disabled,
    isActive,
    isSubmitting,
    onClick,
}: {
    variant: 'use' | 'evolve'
    label: string
    sublabel: string
    disabled: boolean
    isActive: boolean
    isSubmitting: boolean
    onClick: () => void
}) {
    return (
        <button
            type="button"
            className={`action-v2-btn action-v2-btn--${variant} ${isActive ? 'is-active' : ''} ${isSubmitting ? 'is-submitting' : ''}`}
            onClick={onClick}
            aria-pressed={isActive}
            disabled={disabled}
        >
            <span className="action-v2-btn__icon" aria-hidden="true">
                {variant === 'use' ? (
                    <svg viewBox="0 0 24 24">
                        <path d="M13.2 2.5 5.8 13h5.1l-.8 8.5L18.4 10h-5.2V2.5Z" />
                    </svg>
                ) : (
                    <svg viewBox="0 0 24 24">
                        <path d="m12 3 5 5h-3v5h-4V8H7l5-5Z" />
                        <path d="M6 16h12v4H6z" />
                    </svg>
                )}
            </span>
            <span className="action-v2-btn__copy">
                <span className="action-v2-btn__label">{label}</span>
                <span className="action-v2-btn__sublabel">{sublabel}</span>
            </span>
            <span className="action-v2-btn__arrow" aria-hidden="true">›</span>
        </button>
    )
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
    if (!selectedGeneName) {
        return null
    }

    const useLabel = isSubmitting && selectedAction === 'USE' ? 'INVIO...' : 'USA'
    const evolveLabel = isSubmitting && selectedAction === 'EVOLVE' ? 'INVIO...' : 'EVOLVI'

    return (
        <section className="action-v2-panel" aria-label="Azioni disponibili" data-testid="gene-action-panel">
            <ActionButton
                variant="use"
                label={useLabel}
                sublabel="Usa nel round"
                disabled={!canUse || isSubmitting}
                isActive={selectedAction === 'USE'}
                isSubmitting={isSubmitting && selectedAction === 'USE'}
                onClick={() => {
                    void onUseAction()
                }}
            />
            <ActionButton
                variant="evolve"
                label={evolveLabel}
                sublabel="Aumenta il livello"
                disabled={!canEvolve || isSubmitting}
                isActive={selectedAction === 'EVOLVE'}
                isSubmitting={isSubmitting && selectedAction === 'EVOLVE'}
                onClick={() => {
                    void onEvolveAction()
                }}
            />
        </section>
    )
}
