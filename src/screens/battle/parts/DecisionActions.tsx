import { ActionButton } from '../../../ui/components'
import { BoltIcon, DnaIcon } from '../../../ui/icons'
import type { GeneActionTypeV2, GeneCardV2, WaitingStateV2 } from '../controller/types'

type DecisionActionsProps = {
    selectedGene: GeneCardV2 | null
    selectedAction: GeneActionTypeV2 | null
    canUse: boolean
    canEvolve: boolean
    isSubmitting: boolean
    onUse: () => void
    onEvolve: () => void
}

export function DecisionActions({ selectedGene, selectedAction, canUse, canEvolve, isSubmitting, onUse, onEvolve }: DecisionActionsProps) {
    if (!selectedGene) {
        return null
    }

    const eventModifier = selectedGene.prediction?.eventModifier ?? 0
    const mutationHint = selectedGene.mutationHints?.join(' · ')
    const evolveMutationHint = selectedGene.evolveMutationHints?.join(' · ')
    const evolveTitle = selectedGene.level >= 2 ? 'RECUPERA' : selectedGene.exhausted ? 'RIGENERA' : 'EVOLVI'
    const useHint = isSubmitting
        ? selectedAction === 'USE' ? 'Invio della scelta...' : 'Scelta in corso...'
        : !canUse
            ? selectedGene.disabledReason ?? 'Gene esaurito'
            : `Affinita ${eventModifier === 2 ? 'ideale' : eventModifier === 1 ? 'adatta' : 'sfavorevole'} · matchup nascosto`
    const evolveHint = isSubmitting
        ? selectedAction === 'EVOLVE' ? 'Invio della scelta...' : 'Scelta in corso...'
        : !canEvolve
            ? 'Gia al livello massimo'
            : selectedGene.level >= 2
                ? 'Recupera senza salire di livello'
                : `Sale al Liv. ${selectedGene.level + 1}${selectedGene.exhausted ? ' e recupera' : ''}`

    return (
        <section className="decision-actions" aria-label={`Azioni per ${selectedGene.name}`} aria-busy={isSubmitting}>
            <ActionButton
                tone="use"
                title={isSubmitting && selectedAction === 'USE' ? 'INVIO...' : 'USA'}
                hint={canUse && !isSubmitting && mutationHint ? mutationHint : useHint}
                value={selectedGene.prediction ? `${selectedGene.prediction.useScore} PT` : '— PT'}
                glyph={<BoltIcon />}
                aria-pressed={selectedAction === 'USE'}
                disabled={!canUse || isSubmitting}
                onClick={onUse}
            />
            <ActionButton
                tone="evolve"
                title={isSubmitting && selectedAction === 'EVOLVE' ? 'INVIO...' : evolveTitle}
                hint={canEvolve && !isSubmitting && evolveMutationHint ? evolveMutationHint : evolveHint}
                value={`${selectedGene.evolvePrediction?.score ?? 1} PT`}
                glyph={<DnaIcon />}
                aria-pressed={selectedAction === 'EVOLVE'}
                disabled={!canEvolve || isSubmitting}
                onClick={onEvolve}
            />
        </section>
    )
}

export function WaitingPanel({ waitingState }: { waitingState: WaitingStateV2 }) {
    return (
        <section className="waiting-panel" aria-live="polite" aria-label="Attesa dell avversario">
            <span className="waiting-panel__spinner" aria-hidden="true" />
            <div className="waiting-panel__copy">
                <span className="ev-eyebrow ev-eyebrow--light">{waitingState.isResolving ? 'Scelte ricevute' : 'Scelta inviata'}</span>
                <strong>{waitingState.submittedGeneName} · {waitingState.submittedAction === 'USE' ? 'USA' : 'EVOLVI'}</strong>
                <p>{waitingState.isResolving ? 'Risoluzione del round...' : waitingState.opponentStatusLabel}</p>
            </div>
            <span className="waiting-panel__count">{waitingState.submittedCountLabel}</span>
        </section>
    )
}
