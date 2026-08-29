import { useEffect, useState } from 'react'

import {
    DEFAULT_BATTLE_OPPONENT_CREATURE,
    DEFAULT_BATTLE_PLAYER_CREATURE,
    GAME_SELECTION_ASSETS,
    getBattleBackgroundForEvent,
} from './controller/gene-selection-assets'
import type { GeneSelectionViewModelV2 } from './controller/types'
import type { TraitType } from '../../game/types'
import { AppShell, Button, ConfirmDialog, Notice, Overlay, Panel } from '../../ui/components'
import { MeteorIcon } from '../../ui/icons'
import { BattleArena } from './parts/BattleArena'
import { CombatMutationLoadout } from './parts/CombatMutationLoadout'
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
    onActivateSymbiosis?: (sourceTrait: TraitType, targetTrait: TraitType) => Promise<boolean>
    onActivateFineDelMondo?: () => Promise<boolean>
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
    onActivateSymbiosis,
    onActivateFineDelMondo,
    onLeaveSession,
    isInteractionLocked = false,
}: BattleScreenProps) {
    const battleBackground = getBattleBackgroundForEvent(viewModel.roundEvent.id)
    const [backgroundSource, setBackgroundSource] = useState(battleBackground)

    useEffect(() => {
        setBackgroundSource(battleBackground)
    }, [battleBackground])

    const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false)
    const [isSymbiosisPickerOpen, setIsSymbiosisPickerOpen] = useState(false)
    const [isFineDelMondoConfirmOpen, setIsFineDelMondoConfirmOpen] = useState(false)
    const [symbiosisSource, setSymbiosisSource] = useState<TraitType | null>(null)
    const [symbiosisTarget, setSymbiosisTarget] = useState<TraitType | null>(null)
    const isWaiting = viewModel.status === 'waiting' || viewModel.status === 'resolving'
    const isChoosing = viewModel.status === 'choosing' || viewModel.status === 'error'
    const selectedGeneId = viewModel.selectedGeneId ?? viewModel.genes[0]?.id ?? ''

    const leaveConfirm = isLeaveConfirmOpen ? (
        <ConfirmDialog
            label="Conferma uscita dalla partita"
            title="Uscire dalla partita?"
            description="La partita in corso viene abbandonata e il round non verra completato."
            confirmLabel="Esci dalla partita"
            cancelLabel="Continua a giocare"
            onConfirm={onLeaveSession}
            onCancel={() => setIsLeaveConfirmOpen(false)}
        />
    ) : null

    const openSymbiosisPicker = () => {
        setSymbiosisSource(null)
        setSymbiosisTarget(null)
        setIsSymbiosisPickerOpen(true)
    }
    const submitSymbiosis = async () => {
        if (!symbiosisSource || !symbiosisTarget) return
        const submitted = await onActivateSymbiosis?.(symbiosisSource, symbiosisTarget)
        if (submitted) setIsSymbiosisPickerOpen(false)
    }
    const submitFineDelMondo = async () => {
        const submitted = await onActivateFineDelMondo?.()
        if (submitted) setIsFineDelMondoConfirmOpen(false)
    }
    const symbiosisPicker = isSymbiosisPickerOpen ? (
        <Overlay label="Crea Simbiosi" align="center" scrim="scene" width="narrow" onClose={() => setIsSymbiosisPickerOpen(false)}>
            <Panel className="symbiosis-picker">
                <p className="ev-section-label ev-section-label--ink"><span>Simbiosi</span></p>
                <h2>{symbiosisSource ? 'Scegli il gene avversario' : 'Scegli il tuo gene'}</h2>
                <p>{symbiosisSource ? 'Il legame diventa attivo dal prossimo round.' : 'Puoi collegare qualunque gene, anche al massimo livello o esaurito.'}</p>
                <div className="symbiosis-picker__choices" role="list" aria-label={symbiosisSource ? 'Geni avversari' : 'I tuoi geni'}>
                    {(symbiosisSource ? (viewModel.symbiosisTargets ?? []) : viewModel.genes).map((gene) => {
                        const id = gene.id as TraitType
                        const name = gene.name
                        const selected = symbiosisSource ? symbiosisTarget === id : symbiosisSource === id
                        return <Button key={id} tone={selected ? 'gold' : 'cream'} size="sm" aria-pressed={selected} onClick={() => symbiosisSource ? setSymbiosisTarget(id) : setSymbiosisSource(id)}>{name}</Button>
                    })}
                </div>
                <div className="symbiosis-picker__actions">
                    <Button tone="ghost" size="sm" onClick={() => symbiosisSource ? (setSymbiosisSource(null), setSymbiosisTarget(null)) : setIsSymbiosisPickerOpen(false)}>{symbiosisSource ? 'Cambia gene' : 'Annulla'}</Button>
                    <Button tone="use" size="sm" disabled={!symbiosisSource || !symbiosisTarget || viewModel.status === 'submitting'} onClick={() => { void submitSymbiosis() }}>Crea Simbiosi · 0 PT</Button>
                </div>
            </Panel>
        </Overlay>
    ) : null
    const fineDelMondoConfirm = isFineDelMondoConfirmOpen ? (
        <Overlay label="Attiva Fine del mondo" align="center" scrim="scene" width="narrow" onClose={() => setIsFineDelMondoConfirmOpen(false)}>
            <Panel className="symbiosis-picker">
                <p className="ev-section-label ev-section-label--ink"><span>Fine del mondo</span></p>
                <MeteorIcon aria-hidden="true" />
                <h2>Alterare la durata della partita?</h2>
                <p>Il sorteggio server puo accorciare la partita di 2 round oppure estenderla di 3. La mutazione vale 0 punti e verra consumata.</p>
                <div className="symbiosis-picker__actions">
                    <Button tone="ghost" size="sm" onClick={() => setIsFineDelMondoConfirmOpen(false)}>Annulla</Button>
                    <Button tone="use" size="sm" disabled={viewModel.status === 'submitting'} onClick={() => { void submitFineDelMondo() }}>Attiva Fine del mondo · 0 PT</Button>
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
                <DuelHeader
                    player={viewModel.player}
                    opponent={viewModel.opponent}
                    round={viewModel.round}
                    onRequestLeave={() => setIsLeaveConfirmOpen(true)}
                />

                <EnvironmentCard roundEvent={viewModel.roundEvent} nextRoundEvent={viewModel.nextRoundEvent} />

                <BattleArena
                    playerCreature={viewModel.player.creatureVisual === undefined ? DEFAULT_BATTLE_PLAYER_CREATURE : viewModel.player.creatureVisual}
                    opponentCreature={viewModel.opponent.creatureVisual === undefined ? DEFAULT_BATTLE_OPPONENT_CREATURE : viewModel.opponent.creatureVisual}
                />

                {viewModel.status === 'error' && viewModel.errorMessage ? (
                    <Notice tone="error">{viewModel.errorMessage}</Notice>
                ) : null}

                <Panel variant="glass" compact className="battle-screen__decision">
                    <CombatMutationLoadout
                        mutations={viewModel.player.combatMutations ?? []}
                        onActivateSymbiosis={viewModel.canActivateSymbiosis && isChoosing ? openSymbiosisPicker : undefined}
                        onActivateFineDelMondo={viewModel.canActivateFineDelMondo && isChoosing ? () => setIsFineDelMondoConfirmOpen(true) : undefined}
                    />
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
                </Panel>
            </div>
            {leaveConfirm}
            {symbiosisPicker}
            {fineDelMondoConfirm}
        </AppShell>
    )
}
