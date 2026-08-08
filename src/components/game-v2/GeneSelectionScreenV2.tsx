import { useEffect, useState } from 'react'

import {
    DEFAULT_BATTLE_OPPONENT_CREATURE,
    DEFAULT_BATTLE_PLAYER_CREATURE,
    GAME_SELECTION_ASSETS,
    getBattleBackgroundForEvent,
} from './gameSelectionAssets'
import type { GeneSelectionViewModelV2 } from './types'
import { ActionPanelV2 } from './components/ActionPanelV2'
import { BattleStage } from './components/BattleStage'
import { DuelHeaderV2 } from './components/DuelHeaderV2'
import { GeneSelectorPreviewV2 } from './components/GeneSelectorPreviewV2'
import { NaturalAdvantageV2 } from './components/NaturalAdvantageV2'
import { RoundEventPanelV2 } from './components/RoundEventPanelV2'
import { WaitingStateV2 } from './components/WaitingStateV2'

import './GeneSelectionScreenV2.css'

type GeneSelectionScreenV2Props = {
    viewModel: GeneSelectionViewModelV2
    onSelectGene: (geneId: string) => void
    onUseGene: () => Promise<void>
    onEvolveGene: () => Promise<void>
    onLeaveSession: () => void
    isInteractionLocked?: boolean
}

function InvalidSessionMessage({ reason, onLeaveSession }: { reason?: string; onLeaveSession: () => void }) {
    return (
        <section className="state-message state-message--invalid" role="alert" aria-live="assertive">
            <strong>Sessione obsoleta</strong>
            <p>{reason ?? 'La partita non è compatibile con questa versione.'}</p>
            <button type="button" className="leave-button leave-button--inline" onClick={onLeaveSession}>
                Torna alla home
            </button>
        </section>
    )
}

export function GeneSelectionScreenV2({ viewModel, onSelectGene, onUseGene, onEvolveGene, onLeaveSession, isInteractionLocked = false }: GeneSelectionScreenV2Props) {
    const isWaiting = viewModel.status === 'waiting' || viewModel.status === 'resolving'
    const isChoosing = viewModel.status === 'choosing' || viewModel.status === 'error'
    const selectedGeneId = viewModel.selectedGeneId ?? viewModel.genes[0]?.id ?? ''
    const hasRenderableContent = viewModel.status !== 'invalid' && viewModel.status !== 'loading'
    const battleBackground = getBattleBackgroundForEvent(viewModel.roundEvent.id)
    const [backgroundSource, setBackgroundSource] = useState(battleBackground)

    useEffect(() => {
        setBackgroundSource(battleBackground)
    }, [battleBackground])

    function handleBackgroundError() {
        if (backgroundSource !== GAME_SELECTION_ASSETS.backgroundFallback) {
            setBackgroundSource(GAME_SELECTION_ASSETS.backgroundFallback)
        }
    }

    return (
        <section
            className={`gene-selection-screen ${isInteractionLocked ? 'is-interaction-locked' : ''}`}
            aria-label="Schermata scelta gene"
            aria-hidden={isInteractionLocked || undefined}
            inert={isInteractionLocked}
        >
            <img className="gene-selection-screen__background" src={backgroundSource} alt="" onError={handleBackgroundError} />
            <div className="gene-selection-screen__backdrop" aria-hidden="true" />
            <div className="game-frame" data-testid="gene-v2-scroll-container">
                {viewModel.status === 'invalid' ? (
                    <div className="game-state game-state--centered">
                        <InvalidSessionMessage reason={viewModel.invalidReason} onLeaveSession={onLeaveSession} />
                    </div>
                ) : null}

                {viewModel.status === 'loading' ? (
                    <div className="game-state game-state--centered">
                        <section className="state-message" aria-live="polite">
                            <strong>Caricamento in corso...</strong>
                            <p>Sto preparando i dati del round.</p>
                        </section>
                    </div>
                ) : null}

                {hasRenderableContent ? (
                    <>
                        <header className="game-hud">
                            <DuelHeaderV2
                                player={viewModel.player}
                                opponent={viewModel.opponent}
                                round={viewModel.round}
                                onLeaveSession={onLeaveSession}
                            />
                        </header>

                        <main className="arena-stage">
                            <RoundEventPanelV2
                                roundEvent={viewModel.roundEvent}
                                nextRoundEvent={viewModel.nextRoundEvent}
                            />
                            <BattleStage
                                playerCreature={viewModel.player.creatureVisual === undefined ? DEFAULT_BATTLE_PLAYER_CREATURE : viewModel.player.creatureVisual}
                                opponentCreature={viewModel.opponent.creatureVisual === undefined ? DEFAULT_BATTLE_OPPONENT_CREATURE : viewModel.opponent.creatureVisual}
                            />
                        </main>

                        <section className="decision-dock" aria-label="Scelta adattamento e azioni">
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

                            <NaturalAdvantageV2 selectedGene={viewModel.selectedGene} />

                            <div className={`action-panel-shell ${isWaiting ? 'is-waiting' : 'is-actions'}`}>
                                {isWaiting && viewModel.waitingState ? (
                                    <WaitingStateV2 waitingState={viewModel.waitingState} />
                                ) : (
                                    <ActionPanelV2
                                        selectedAction={viewModel.selectedAction}
                                        selectedGene={viewModel.selectedGene}
                                        canUse={viewModel.canUse}
                                        canEvolve={viewModel.canEvolve}
                                        isSubmitting={viewModel.status === 'submitting'}
                                        onUseAction={onUseGene}
                                        onEvolveAction={onEvolveGene}
                                    />
                                )}
                            </div>
                        </section>
                    </>
                ) : null}
            </div>
        </section>
    )
}
