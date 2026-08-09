import { useEffect, useState } from 'react'

import {
    DEFAULT_BATTLE_OPPONENT_CREATURE,
    DEFAULT_BATTLE_PLAYER_CREATURE,
    GAME_SELECTION_ASSETS,
    getBattleBackgroundForEvent,
} from '../../components/game-v2/gameSelectionAssets'
import type { GeneSelectionViewModelV2 } from '../../components/game-v2/types'
import { AppShell, Button, IconButton, Notice, Overlay, Panel, Pill } from '../../ui/components'
import { CloseIcon } from '../../ui/icons'
import { BattleArena } from './parts/BattleArena'
import { DecisionActions, WaitingPanel } from './parts/DecisionActions'
import { DuelHeader } from './parts/DuelHeader'
import { EnvironmentCard } from './parts/EnvironmentCard'
import { GeneCarousel } from './parts/GeneCarousel'

import './BattleScreen.css'

type BattleScreenProps = {
    viewModel: GeneSelectionViewModelV2
    onSelectGene: (geneId: string) => void
    onUseGene: () => Promise<void>
    onEvolveGene: () => Promise<void>
    onLeaveSession: () => void
    isInteractionLocked?: boolean
}

function StateCard({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
    return (
        <div className="battle-screen__state">
            <Panel className="ev-stack" role="status" aria-live="polite">
                <h2>{title}</h2>
                <p className="battle-screen__state-copy">{description}</p>
                {action}
            </Panel>
        </div>
    )
}

export function BattleScreen({
    viewModel,
    onSelectGene,
    onUseGene,
    onEvolveGene,
    onLeaveSession,
    isInteractionLocked = false,
}: BattleScreenProps) {
    const battleBackground = getBattleBackgroundForEvent(viewModel.roundEvent.id)
    const [backgroundSource, setBackgroundSource] = useState(battleBackground)

    useEffect(() => {
        setBackgroundSource(battleBackground)
    }, [battleBackground])

    const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false)
    const isWaiting = viewModel.status === 'waiting' || viewModel.status === 'resolving'
    const isChoosing = viewModel.status === 'choosing' || viewModel.status === 'error'
    const selectedGeneId = viewModel.selectedGeneId ?? viewModel.genes[0]?.id ?? ''

    const exitButton = (
        <IconButton
            label="Esci dalla partita"
            variant="danger"
            className="battle-screen__exit"
            onClick={() => setIsLeaveConfirmOpen(true)}
        >
            <CloseIcon />
        </IconButton>
    )

    const leaveConfirm = isLeaveConfirmOpen ? (
        <Overlay label="Conferma uscita dalla partita" align="center" onClose={() => setIsLeaveConfirmOpen(false)}>
            <Panel className="battle-leave-confirm">
                <span className="battle-leave-confirm__mark" aria-hidden="true"><CloseIcon /></span>
                <h2>Uscire dalla partita?</h2>
                <p>La partita in corso viene abbandonata e il round non verra completato.</p>
                <div className="battle-leave-confirm__actions">
                    <Button tone="danger" block onClick={onLeaveSession}>Esci dalla partita</Button>
                    <Button tone="cream" block onClick={() => setIsLeaveConfirmOpen(false)}>Continua a giocare</Button>
                </div>
            </Panel>
        </Overlay>
    ) : null

    if (viewModel.status === 'invalid' || viewModel.status === 'loading') {
        return (
            <AppShell sceneryUrl={backgroundSource} sceneryFallbackUrl={GAME_SELECTION_ASSETS.backgroundFallback}>
                {viewModel.status === 'invalid' ? (
                    <StateCard
                        title="Sessione obsoleta"
                        description={viewModel.invalidReason ?? 'La partita non e compatibile con questa versione.'}
                        action={<Button tone="cream" block onClick={onLeaveSession}>Torna alla home</Button>}
                    />
                ) : (
                    <StateCard title="Caricamento in corso" description="Sto preparando i dati del round." />
                )}
            </AppShell>
        )
    }

    return (
        <AppShell sceneryUrl={backgroundSource} sceneryFallbackUrl={GAME_SELECTION_ASSETS.backgroundFallback}>
            <div
                className={`battle-screen ${isInteractionLocked ? 'is-locked' : ''}`}
                aria-hidden={isInteractionLocked || undefined}
                inert={isInteractionLocked}
            >
                <div className="battle-screen__top">
                    <DuelHeader player={viewModel.player} opponent={viewModel.opponent} round={viewModel.round} />
                    {exitButton}
                </div>

                <div className="battle-screen__meta">
                    <Pill>Round <strong>{viewModel.round.current}/{viewModel.round.total}</strong></Pill>
                </div>

                <EnvironmentCard roundEvent={viewModel.roundEvent} nextRoundEvent={viewModel.nextRoundEvent} />

                <BattleArena
                    playerCreature={viewModel.player.creatureVisual === undefined ? DEFAULT_BATTLE_PLAYER_CREATURE : viewModel.player.creatureVisual}
                    opponentCreature={viewModel.opponent.creatureVisual === undefined ? DEFAULT_BATTLE_OPPONENT_CREATURE : viewModel.opponent.creatureVisual}
                />

                {viewModel.status === 'error' && viewModel.errorMessage ? (
                    <Notice tone="error">{viewModel.errorMessage}</Notice>
                ) : null}

                <div className="battle-screen__decision">
                    {isWaiting && viewModel.waitingState ? (
                        <WaitingPanel waitingState={viewModel.waitingState} />
                    ) : (
                        <>
                            <GeneCarousel
                                genes={viewModel.genes}
                                selectedGeneId={selectedGeneId}
                                onSelectGene={onSelectGene}
                                disableSelection={!isChoosing}
                            />
                            <DecisionActions
                                selectedGene={viewModel.selectedGene}
                                selectedAction={viewModel.selectedAction}
                                canUse={viewModel.canUse}
                                canEvolve={viewModel.canEvolve}
                                isSubmitting={viewModel.status === 'submitting'}
                                onUse={() => { void onUseGene() }}
                                onEvolve={() => { void onEvolveGene() }}
                            />
                        </>
                    )}
                </div>
            </div>
            {leaveConfirm}
        </AppShell>
    )
}
