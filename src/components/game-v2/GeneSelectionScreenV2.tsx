import { GAME_SELECTION_ASSETS } from './gameSelectionAssets'
import type { GeneSelectionViewModelV2 } from './types'
import { ActionPanelV2 } from './components/ActionPanelV2'
import { CreatureStageV2 } from './components/CreatureStageV2'
import { DuelHeaderV2 } from './components/DuelHeaderV2'
import { RoundEventPanelV2 } from './components/RoundEventPanelV2'
import { GeneSelectorPreviewV2 } from './components/GeneSelectorPreviewV2'
import { RoundIndicatorV2 } from './components/RoundIndicatorV2'
import { SelectedGeneDetailsV2 } from './components/SelectedGeneDetailsV2'
import { WaitingStateV2 } from './components/WaitingStateV2'

import './GeneSelectionScreenV2.css'

type GeneSelectionScreenV2Props = {
    viewModel: GeneSelectionViewModelV2
    onSelectGene: (geneId: string) => void
    onUseGene: () => Promise<void>
    onEvolveGene: () => Promise<void>
    onLeaveSession: () => void
}

export function GeneSelectionScreenV2({ viewModel, onSelectGene, onUseGene, onEvolveGene, onLeaveSession }: GeneSelectionScreenV2Props) {
    const showWaiting = viewModel.status === 'waiting' || viewModel.status === 'resolving'
    const selectedGeneId = viewModel.selectedGeneId ?? viewModel.genes[0]?.id ?? ''

    return (
        <section className="gene-v2-screen" aria-label="Nuova schermata scelta gene V2">
            <div className="gene-v2-background" aria-hidden="true">
                <img src={GAME_SELECTION_ASSETS.background} alt="" onError={(event) => {
                    event.currentTarget.style.display = 'none'
                }} />
            </div>

            <div className="gene-v2-scroll" data-testid="gene-v2-scroll-container">
                <div className="gene-v2-top-actions">
                    <button type="button" className="ghost-button gene-v2-leave" onClick={onLeaveSession}>
                        Esci
                    </button>
                </div>
                <DuelHeaderV2 player={viewModel.player} opponent={viewModel.opponent} />
                <RoundIndicatorV2 round={viewModel.round} />
                <RoundEventPanelV2 roundEvent={viewModel.roundEvent} />
                <CreatureStageV2
                    playerName={viewModel.player.name}
                    opponentName={viewModel.opponent.name}
                    playerCreatureUrl={GAME_SELECTION_ASSETS.playerCreature}
                    opponentCreatureUrl={GAME_SELECTION_ASSETS.opponentCreature}
                />
                {viewModel.genes.length > 0 ? (
                    <GeneSelectorPreviewV2
                        genes={viewModel.genes}
                        selectedGeneId={selectedGeneId}
                        onSelectGene={onSelectGene}
                        disableSelection={viewModel.status === 'loading' || viewModel.status === 'submitting'}
                    />
                ) : (
                    <section className="gene-v2-state-card" aria-live="polite">
                        <strong>Geni non disponibili</strong>
                        <p>Impossibile caricare i geni del giocatore per questo round.</p>
                    </section>
                )}

                {viewModel.selectedGene ? <SelectedGeneDetailsV2 gene={viewModel.selectedGene} /> : null}

                {viewModel.status === 'loading' ? (
                    <section className="gene-v2-state-card" aria-live="polite">
                        <strong>Caricamento in corso...</strong>
                        <p>Sto preparando i dati del round.</p>
                    </section>
                ) : null}

                {viewModel.status === 'error' && viewModel.errorMessage ? (
                    <section className="gene-v2-state-card gene-v2-state-card--error" role="alert" aria-live="assertive">
                        <strong>Errore invio</strong>
                        <p>{viewModel.errorMessage}</p>
                    </section>
                ) : null}

                {showWaiting && viewModel.waitingState ? (
                    <WaitingStateV2 waitingState={viewModel.waitingState} />
                ) : (
                    <ActionPanelV2
                        selectedAction={viewModel.selectedAction}
                        selectedGeneName={viewModel.selectedGene?.name ?? null}
                        canUse={viewModel.canUse}
                        canEvolve={viewModel.canEvolve}
                        isSubmitting={viewModel.status === 'submitting'}
                        onUseAction={onUseGene}
                        onEvolveAction={onEvolveGene}
                    />
                )}
            </div>
        </section>
    )
}
