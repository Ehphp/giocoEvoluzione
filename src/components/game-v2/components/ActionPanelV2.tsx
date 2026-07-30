import type { GeneCardV2 } from '../types'

type ActionPanelV2Props = { selectedAction: 'USE' | 'EVOLVE' | null; selectedGene: GeneCardV2 | null; canUse: boolean; canEvolve: boolean; isSubmitting: boolean; onUseAction: () => Promise<void>; onEvolveAction: () => Promise<void> }
function ActionButton({ variant, label, value, sublabel, disabled, isActive, isSubmitting, onClick }: { variant: 'use' | 'evolve'; label: string; value: string; sublabel: string; disabled: boolean; isActive: boolean; isSubmitting: boolean; onClick: () => void }) {
    return <button type="button" className={`action-v2-btn action-v2-btn--${variant} ${isActive ? 'is-active' : ''} ${isSubmitting ? 'is-submitting' : ''}`} onClick={onClick} aria-pressed={isActive} aria-label={`${label}, ${value}. ${sublabel}`} disabled={disabled}>
        <span className="action-v2-btn__icon" aria-hidden="true">{variant === 'use' ? <svg viewBox="0 0 24 24"><path d="M13.2 2.5 5.8 13h5.1l-.8 8.5L18.4 10h-5.2V2.5Z" /></svg> : <svg viewBox="0 0 24 24"><path d="m12 3 5 5h-3v5h-4V8H7l5-5Z" /><path d="M6 16h12v4H6z" /></svg>}</span>
        <span className="action-v2-btn__copy"><span className="action-v2-btn__label">{label}</span><strong className="action-v2-btn__value">{value}</strong><span className="action-v2-btn__sublabel">{sublabel}</span></span><span className="action-v2-btn__arrow" aria-hidden="true">›</span>
    </button>
}
export function ActionPanelV2({ selectedAction, selectedGene, canUse, canEvolve, isSubmitting, onUseAction, onEvolveAction }: ActionPanelV2Props) {
    if (!selectedGene) return null
    const eventModifier = selectedGene.prediction?.eventModifier ?? 0
    const useLabel = isSubmitting && selectedAction === 'USE' ? 'INVIO...' : 'USA'
    const evolveActionLabel = selectedGene.level >= 2 ? 'RECUPERA' : selectedGene.exhausted ? 'EVOLVI E RECUPERA' : 'EVOLVI'
    const evolveLabel = isSubmitting && selectedAction === 'EVOLVE' ? 'INVIO...' : evolveActionLabel
    const useSublabel = isSubmitting ? (selectedAction === 'USE' ? 'Invio della scelta' : 'Scelta in corso') : !canUse ? (selectedGene.disabledReason ?? 'Gene esaurito') : `Affinita ${eventModifier === 2 ? 'ideale' : eventModifier === 1 ? 'adatta' : 'sfavorevole'} · matchup nascosto`
    const evolveSublabel = isSubmitting ? (selectedAction === 'EVOLVE' ? 'Invio della scelta' : 'Scelta in corso') : !canEvolve ? 'Gia disponibile al livello massimo' : selectedGene.level >= 2 ? 'Recupera senza aumentare il livello' : `LV ${selectedGene.level} → ${selectedGene.level + 1}${selectedGene.exhausted ? ' e recupero' : ''}`
    return <section className="action-v2-panel" aria-label={`Azioni per ${selectedGene.name}`} aria-busy={isSubmitting} data-testid="gene-action-panel">
        <ActionButton variant="use" label={useLabel} value={selectedGene.prediction ? `${selectedGene.prediction.useScore} PT base` : '— PT'} sublabel={useSublabel} disabled={!canUse || isSubmitting} isActive={selectedAction === 'USE'} isSubmitting={isSubmitting && selectedAction === 'USE'} onClick={() => { void onUseAction() }} />
        <ActionButton variant="evolve" label={evolveLabel} value="1 PT" sublabel={evolveSublabel} disabled={!canEvolve || isSubmitting} isActive={selectedAction === 'EVOLVE'} isSubmitting={isSubmitting && selectedAction === 'EVOLVE'} onClick={() => { void onEvolveAction() }} />
    </section>
}
