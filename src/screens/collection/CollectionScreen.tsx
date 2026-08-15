import { useEffect, useMemo, useState } from 'react'

import { getExperienceProgress } from '../../lib/progression'
import type { CreatureLineageRecord, PlayerCreatureRecord, ProfileRecord } from '../../lib/profile-api'
import { ASSETS, fallbackToDefaultCreatureImage } from '../../ui/assets'
import { Dock, type DockTab } from '../../ui/Dock'
import { AppShell, Avatar, Button, Chip, IconButton, Notice, Overlay, Panel, Pill, ProgressBar, SectionLabel } from '../../ui/components'
import { AddIcon, CloseIcon, ExitIcon, FireIcon, NatureIcon, VenomIcon } from '../../ui/icons'
import { buildCollectionViewModel } from './buildCollectionViewModel'
import type { CollectionForm } from './types'

import './CollectionScreen.css'

type VisualHistoryEntry = {
    id: string
    versionNumber: number
    visualTraitId: string | null
    conceptName: string | null
    signedUrl: string
}

type CollectionScreenProps = {
    profile: ProfileRecord
    creature: PlayerCreatureRecord
    isOnline: boolean
    onBack: () => void
    onOpenProfile: () => void
    onOpenRanking: () => void
    onLogout: () => void
    visualUrl?: string | null
    visualVersionNumber?: number | null
    visualTrait?: string | null
    visualHistory?: ReadonlyArray<VisualHistoryEntry>
    currentVisualVersionId?: string | null
    lineages?: ReadonlyArray<CreatureLineageRecord>
    activeLineageId?: string | null
    onCreateLineage?: () => Promise<string>
    onDeleteLineage?: (lineageId: string) => Promise<void>
    onSetActiveLineage?: (lineageId: string) => void
    /** Opens visual evolution for this exact lineage; it never implies a global active-lineage change. */
    onOpenEvolution?: (lineageId: string) => void
    lineageVisuals?: Readonly<Record<string, {
        visualUrl?: string | null
        visualVersionNumber?: number | null
        visualTrait?: string | null
        visualHistory?: ReadonlyArray<VisualHistoryEntry>
        currentVisualVersionId?: string | null
    }>>
}

function TypeChip({ type }: { type: CollectionForm['types'][number] }) {
    const details = type === 'Natura'
        ? { className: 'collection-type--nature', icon: <NatureIcon /> }
        : type === 'Veleno'
            ? { className: 'collection-type--venom', icon: <VenomIcon /> }
            : { className: 'collection-type--fire', icon: <FireIcon /> }

    return <Chip className={`collection-type ${details.className}`} icon={details.icon}>{type}</Chip>
}

function FormArt({ form, className = '' }: { form: Pick<CollectionForm, 'image' | 'name'>; className?: string }) {
    return <img className={className} src={form.image} alt={`Forma ${form.name}`} loading="lazy" onError={(event) => fallbackToDefaultCreatureImage(event.currentTarget)} />
}

type FormSelectionProps = {
    forms: ReadonlyArray<CollectionForm>
    selectedFormId: string
    onSelectForm: (formId: string) => void
}

function LineageTimeline({ forms, selectedFormId, onSelectForm }: FormSelectionProps) {
    return (
        <div className="collection-lineage" role="region" aria-label="Stirpe: scorri orizzontalmente per vedere le generazioni">
            <ol className="collection-lineage__track">
                {forms.map((form) => {
                    const isSelected = form.id === selectedFormId

                    return (
                        <li key={form.id} className={`collection-lineage__item ${isSelected ? 'is-selected' : ''}`}>
                            <button
                                type="button"
                                className="collection-lineage__button"
                                aria-pressed={isSelected}
                                aria-label={`Mostra Generazione ${form.generation - 1}: ${form.name}`}
                                onClick={() => onSelectForm(form.id)}
                            >
                                <span className="collection-lineage__art"><FormArt form={form} /></span>
                                <strong>GEN {form.generation - 1}</strong>
                            </button>
                        </li>
                    )
                })}
            </ol>
        </div>
    )
}

function FormCatalog({ forms, selectedFormId, onSelectForm }: FormSelectionProps) {
    return (
        <section className="collection-catalog" aria-label="Catalogo delle forme sbloccate">
            {forms.map((form) => {
                const isSelected = form.id === selectedFormId

                return (
                    <button
                        key={form.id}
                        type="button"
                        className={`collection-form ${isSelected ? 'is-selected' : ''}`}
                        aria-pressed={isSelected}
                        aria-label={`Mostra Generazione ${form.generation - 1}: ${form.name}`}
                        onClick={() => onSelectForm(form.id)}
                    >
                        <h3>Generazione {form.generation - 1}</h3>
                        <FormArt form={form} className="collection-form__art" />
                        <div className="collection-form__types">
                            {form.types.map((type) => <TypeChip key={type} type={type} />)}
                        </div>
                    </button>
                )
            })}
        </section>
    )
}

export function CollectionScreen({
    profile,
    creature,
    isOnline,
    onBack,
    onOpenProfile,
    onOpenRanking,
    onLogout,
    visualUrl,
    visualVersionNumber,
    visualTrait,
    visualHistory,
    currentVisualVersionId,
    lineages,
    activeLineageId,
    onCreateLineage,
    onDeleteLineage,
    onSetActiveLineage,
    onOpenEvolution,
    lineageVisuals,
}: CollectionScreenProps) {
    const availableLineages = useMemo(() => lineages?.length ? lineages : [{
        id: creature.lineage_id,
        profile_id: creature.profile_id,
        name: creature.name,
        base_creature_key: creature.base_creature_key,
        created_at: creature.created_at,
        updated_at: creature.updated_at,
        creature,
    }], [creature, lineages])
    const resolvedActiveLineageId = activeLineageId ?? availableLineages[0]!.id
    const [selectedLineageId, setSelectedLineageId] = useState(resolvedActiveLineageId)
    const [isCreatingLineage, setIsCreatingLineage] = useState(false)
    const [lineageCreationError, setLineageCreationError] = useState<string | null>(null)
    const [lineagePendingDeletion, setLineagePendingDeletion] = useState<CreatureLineageRecord | null>(null)
    const [isDeletingLineage, setIsDeletingLineage] = useState(false)
    const [lineageDeletionError, setLineageDeletionError] = useState<string | null>(null)
    const selectedLineage = availableLineages.find((lineage) => lineage.id === selectedLineageId) ?? availableLineages[0]!
    const selectedVisual = lineageVisuals?.[selectedLineage.id]
    const selectedCreature = selectedLineage.creature
    const viewModel = buildCollectionViewModel({
        profile,
        creature: selectedCreature,
        experience: getExperienceProgress(selectedCreature.experience),
        visualUrl: selectedVisual?.visualUrl ?? (selectedLineage.id === resolvedActiveLineageId ? visualUrl : null),
        visualVersionNumber: selectedVisual?.visualVersionNumber ?? (selectedLineage.id === resolvedActiveLineageId ? visualVersionNumber : null),
        visualTrait: selectedVisual?.visualTrait ?? (selectedLineage.id === resolvedActiveLineageId ? visualTrait : null),
        visualHistory: selectedVisual?.visualHistory ?? (selectedLineage.id === resolvedActiveLineageId ? visualHistory : undefined),
        currentVisualVersionId: selectedVisual?.currentVisualVersionId ?? (selectedLineage.id === resolvedActiveLineageId ? currentVisualVersionId : null),
    })
    const activeFormId = viewModel.evolutionForms.find((form) => form.isActive)?.id ?? viewModel.evolutionForms.at(-1)?.id ?? ''
    const initialSelectedFormId = activeFormId
    const [selectedFormId, setSelectedFormId] = useState(initialSelectedFormId)
    useEffect(() => {
        if (!availableLineages.some((lineage) => lineage.id === selectedLineageId)) {
            setSelectedLineageId(resolvedActiveLineageId)
        }
    }, [availableLineages, resolvedActiveLineageId, selectedLineageId])
    useEffect(() => {
        setSelectedFormId(activeFormId)
    }, [activeFormId, selectedLineage.id])
    const selectedForm = viewModel.evolutionForms.find((form) => form.id === selectedFormId)
        ?? viewModel.evolutionForms.find((form) => form.isActive)
        ?? viewModel.evolutionForms.at(-1)

    if (!selectedForm) return null

    function handleNavigate(tab: DockTab) {
        if (tab === 'battle') onBack()
        if (tab === 'profile') onOpenProfile()
        if (tab === 'ranking') onOpenRanking()
    }

    async function handleCreateLineage() {
        if (!onCreateLineage || isCreatingLineage) return

        setIsCreatingLineage(true)
        setLineageCreationError(null)
        try {
            setSelectedLineageId(await onCreateLineage())
        } catch (error) {
            setLineageCreationError(error instanceof Error ? error.message : 'Impossibile creare la nuova stirpe.')
        } finally {
            setIsCreatingLineage(false)
        }
    }

    async function handleDeleteLineage() {
        if (!onDeleteLineage || !lineagePendingDeletion || isDeletingLineage) return

        const lineageId = lineagePendingDeletion.id
        const nextSelectionId = availableLineages.find((lineage) => lineage.id !== lineageId)?.id
        setIsDeletingLineage(true)
        setLineageDeletionError(null)
        try {
            await onDeleteLineage(lineageId)
            if (selectedLineageId === lineageId && nextSelectionId) setSelectedLineageId(nextSelectionId)
            setLineagePendingDeletion(null)
        } catch (error) {
            setLineageDeletionError(error instanceof Error ? error.message : 'Impossibile eliminare la stirpe.')
        } finally {
            setIsDeletingLineage(false)
        }
    }

    const lineagePendingDeletionName = lineagePendingDeletion
        ? lineagePendingDeletion.name ?? lineagePendingDeletion.creature.name ?? 'Stirpe senza nome'
        : ''
    const deleteConfirmation = lineagePendingDeletion ? (
        <Overlay
            label={`Conferma eliminazione di ${lineagePendingDeletionName}`}
            align="center"
            onClose={isDeletingLineage ? undefined : () => setLineagePendingDeletion(null)}
            closeOnBackdrop={!isDeletingLineage}
        >
            <Panel className="collection-delete-confirm">
                <h2>Eliminare {lineagePendingDeletionName}?</h2>
                <p>La stirpe, le sue forme e tutti i progressi evolutivi verranno eliminati definitivamente.</p>
                {lineageDeletionError ? <Notice tone="error">{lineageDeletionError}</Notice> : null}
                <div className="collection-delete-confirm__actions">
                    <Button tone="danger" block disabled={isDeletingLineage} onClick={() => void handleDeleteLineage()}>{isDeletingLineage ? 'Eliminazione...' : 'Elimina stirpe'}</Button>
                    <Button tone="cream" block disabled={isDeletingLineage} onClick={() => setLineagePendingDeletion(null)}>Annulla</Button>
                </div>
            </Panel>
        </Overlay>
    ) : null

    return (
        <>
        <AppShell sceneryUrl={ASSETS.scenery.forest} sceneryFallbackUrl={ASSETS.scenery.fallback} dock={
            <Dock active="collection" capabilities={{ collection: true, profile: true, ranking: true }} onNavigate={handleNavigate} />
        } scroll>
            <main className="collection-screen" aria-labelledby="collection-title">
                <header className="collection-topbar">
                    <div className="collection-identity">
                        <Avatar name={viewModel.player.name} className="collection-identity__avatar" />
                        <div className="collection-identity__copy">
                            <strong className="ev-truncate">{viewModel.player.name}</strong>
                            <span>LIVELLO {viewModel.player.level}</span>
                            <ProgressBar current={viewModel.player.experience.current} total={viewModel.player.experience.required} label="Esperienza del giocatore" />
                        </div>
                    </div>
                    <img className="collection-logo" src={ASSETS.branding.logo} alt="Evori" />
                    <div className="collection-topbar__actions">
                        <Pill className={isOnline ? 'is-online' : 'is-offline'}>{isOnline ? 'Online' : 'Offline'}</Pill>
                        <IconButton label="Esci dall account" variant="danger" onClick={onLogout}><ExitIcon /></IconButton>
                    </div>
                </header>

                <header className="collection-heading">
                    <h1 id="collection-title">Collezione</h1>
                    <p>{viewModel.evolutionForms.length} forme scoperte · Generazione {viewModel.currentCreature.generation - 1}</p>
                </header>

                <section className="collection-lineage-section" aria-label="Stirpi">
                    <div className="collection-lineage-section__heading">
                        <SectionLabel>Stirpi</SectionLabel>
                        {onCreateLineage ? <Button tone="evolve" size="sm" className="collection-create-lineage" disabled={isCreatingLineage} onClick={() => void handleCreateLineage()}><AddIcon />{isCreatingLineage ? 'Creazione...' : 'Nuova stirpe'}</Button> : null}
                    </div>
                    <div className="collection-lineages" role="tablist" aria-label="Seleziona una stirpe">
                        {availableLineages.map((lineage) => {
                            const isSelected = lineage.id === selectedLineage.id
                            const isActive = lineage.id === resolvedActiveLineageId
                            const lineageName = lineage.name ?? lineage.creature.name ?? 'Stirpe senza nome'
                            const canDelete = Boolean(onDeleteLineage && availableLineages.length > 1)
                            return (
                                <div key={lineage.id} className={`collection-lineages__item ${canDelete ? 'has-delete' : ''}`} role="presentation">
                                    <button type="button" className={`collection-lineages__button ${isSelected ? 'is-selected' : ''}`} role="tab" aria-selected={isSelected} onClick={() => setSelectedLineageId(lineage.id)}>
                                        <span className="ev-truncate" title={lineageName}>{lineageName}</span>
                                        {isActive ? <small>Attiva</small> : null}
                                    </button>
                                    {canDelete ? (
                                        <IconButton
                                            label={`Elimina ${lineageName}`}
                                            variant="cream"
                                            className="collection-lineages__delete"
                                            onClick={() => {
                                                setLineageDeletionError(null)
                                                setLineagePendingDeletion(lineage)
                                            }}
                                        >
                                            <CloseIcon />
                                        </IconButton>
                                    ) : null}
                                </div>
                            )
                        })}
                    </div>
                    {lineageCreationError ? <Notice tone="error">{lineageCreationError}</Notice> : null}
                </section>

                <section className="collection-current" aria-labelledby="current-creature-title">
                    <div className="collection-current__copy">
                        <span className="ev-eyebrow">{selectedForm.isActive ? 'Forma attuale' : 'Forma selezionata'}</span>
                        <h2 id="current-creature-title">Generazione {selectedForm.generation - 1}</h2>
                        <p>{selectedForm.name}</p>
                        <div className="collection-current__types">
                            {selectedForm.types.map((type) => <TypeChip key={type} type={type} />)}
                        </div>
                        {onOpenEvolution ? <Button tone="evolve" onClick={() => onOpenEvolution(selectedLineage.id)}>Evolvi questa stirpe</Button> : null}
                        {selectedLineage.id !== resolvedActiveLineageId && onSetActiveLineage ? <Button tone="gold" onClick={() => onSetActiveLineage(selectedLineage.id)}>Usa questa stirpe</Button> : null}
                    </div>
                    <FormArt form={selectedForm} className="collection-current__art" />
                </section>

                <section className="collection-lineage-section" aria-label="Stirpe">
                    <SectionLabel>Linea evolutiva</SectionLabel>
                    <LineageTimeline forms={viewModel.evolutionForms} selectedFormId={selectedForm.id} onSelectForm={setSelectedFormId} />
                </section>

                <FormCatalog forms={viewModel.evolutionForms} selectedFormId={selectedForm.id} onSelectForm={setSelectedFormId} />
            </main>
        </AppShell>
        {deleteConfirmation}
        </>
    )
}
