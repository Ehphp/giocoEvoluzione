import { GAME_SELECTION_ASSETS } from './gameSelectionAssets'
import type { GeneSelectionViewModelV2 } from './types'
import { ActionPanelV2 } from './components/ActionPanelV2'
import { DuelHeaderV2 } from './components/DuelHeaderV2'
import { GeneSelectorPreviewV2 } from './components/GeneSelectorPreviewV2'
import { RoundEventPanelV2 } from './components/RoundEventPanelV2'
import { RoundIndicatorV2 } from './components/RoundIndicatorV2'
import { WaitingStateV2 } from './components/WaitingStateV2'

import './GeneSelectionScreenV2.css'

type GeneSelectionScreenV2Props = {
    viewModel: GeneSelectionViewModelV2
    onSelectGene: (geneId: string) => void
    onUseGene: () => Promise<void>
    onEvolveGene: () => Promise<void>
    onLeaveSession: () => void
}

function SceneFallback() {
    return (
        <div className="scene-fallback" aria-hidden="true">
            <img
                className="scene-fallback-bg"
                src={GAME_SELECTION_ASSETS.backgroundFallback}
                alt=""
                onError={(event) => {
                    event.currentTarget.style.display = 'none'
                }}
            />
            <div className="scene-fallback-creatures">
                <img
                    src="/assets/game-ui/placeholders/player-creature.svg"
                    alt=""
                    className="scene-fallback-creature scene-fallback-creature--player"
                    onError={(event) => {
                        event.currentTarget.style.display = 'none'
                    }}
                />
                <span className="scene-fallback-vs">VS</span>
                <img
                    src="/assets/game-ui/placeholders/opponent-creature.svg"
                    alt=""
                    className="scene-fallback-creature scene-fallback-creature--opponent"
                    onError={(event) => {
                        event.currentTarget.style.display = 'none'
                    }}
                />
            </div>
        </div>
    )
}

function InvalidSessionMessage({ reason, onLeaveSession }: { reason?: string; onLeaveSession: () => void }) {
    return (
        <section className="state-message state-message--invalid" role="alert" aria-live="assertive">
            <strong>Sessione obsoleta</strong>
            <p>{reason ?? 'La partita non e compatibile con questa versione.'}</p>
            <button type="button" className="leave-button leave-button--inline" onClick={onLeaveSession}>
                Torna alla home
            </button>
        </section>
    )
}

export function GeneSelectionScreenV2({ viewModel, onSelectGene, onUseGene, onEvolveGene, onLeaveSession }: GeneSelectionScreenV2Props) {
    const isWaiting = viewModel.status === 'waiting' || viewModel.status === 'resolving'
    const isChoosing = viewModel.status === 'choosing' || viewModel.status === 'error'
    const selectedGeneId = viewModel.selectedGeneId ?? viewModel.genes[0]?.id ?? ''
    const hasRenderableContent = viewModel.status !== 'invalid' && viewModel.status !== 'loading'

    return (
        <section className="gene-selection-screen" aria-label="Schermata scelta gene">
            <img
                className="frame-scene-image"
                src={GAME_SELECTION_ASSETS.battleScene}
                alt=""
                onError={(event) => {
                    event.currentTarget.style.display = 'none'
                    event.currentTarget.closest('.gene-selection-screen')?.classList.add('has-scene-error')
                }}
            />
            <SceneFallback />
            <div className="frame-scene-overlay frame-scene-overlay--top" aria-hidden="true" />
            <div className="frame-scene-overlay frame-scene-overlay--bottom" aria-hidden="true" />
            <div className="screen-content" data-testid="gene-v2-scroll-container">
                <div className="top-actions">
                    <button type="button" className="leave-button" onClick={onLeaveSession}>
                        Esci
                    </button>
                </div>

                {viewModel.status === 'invalid' ? (
                    <div className="screen-main screen-main--centered">
                        <InvalidSessionMessage reason={viewModel.invalidReason} onLeaveSession={onLeaveSession} />
                    </div>
                ) : null}

                {viewModel.status === 'loading' ? (
                    <div className="screen-main screen-main--centered">
                        <section className="state-message" aria-live="polite">
                            <strong>Caricamento in corso...</strong>
                            <p>Sto preparando i dati del round.</p>
                        </section>
                    </div>
                ) : null}

                {hasRenderableContent ? (
                    <>
                        <div className="screen-top">
                            <DuelHeaderV2 player={viewModel.player} opponent={viewModel.opponent} />
                            <RoundIndicatorV2 round={viewModel.round} />
                            <RoundEventPanelV2 roundEvent={viewModel.roundEvent} />
                        </div>

                        <div className="screen-middle" aria-hidden="true" />

                        <div className="bottom-sheet">
                            {viewModel.genes.length > 0 ? (
                                <div className="gene-selector-panel">
                                    <GeneSelectorPreviewV2
                                        genes={viewModel.genes}
                                        selectedGeneId={selectedGeneId}
                                        onSelectGene={onSelectGene}
                                        disableSelection={!isChoosing}
                                    />
                                </div>
                            ) : null}

                            {viewModel.status === 'error' && viewModel.errorMessage ? (
                                <section className="state-message state-message--error" role="alert" aria-live="assertive">
                                    <strong>Errore invio</strong>
                                    <p>{viewModel.errorMessage}</p>
                                </section>
                            ) : null}

                            <div className="action-panel-shell">
                                {isWaiting && viewModel.waitingState ? (
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
                        </div>
                    </>
                ) : null}
            </div>
        </section>
    )
}
