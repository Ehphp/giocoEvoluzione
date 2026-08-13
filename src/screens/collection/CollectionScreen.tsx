import { useState } from 'react'

import { getExperienceProgress } from '../../lib/progression'
import type { PlayerCreatureRecord, ProfileRecord } from '../../lib/profile-api'
import { ASSETS } from '../../ui/assets'
import { Dock, type DockTab } from '../../ui/Dock'
import { AppShell, Avatar, Chip, IconButton, Pill, ProgressBar, SectionLabel } from '../../ui/components'
import { ExitIcon, FireIcon, NatureIcon, VenomIcon } from '../../ui/icons'
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
    return <img className={className} src={form.image} alt={`Forma ${form.name}`} loading="lazy" />
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
}: CollectionScreenProps) {
    const viewModel = buildCollectionViewModel({
        profile,
        creature,
        experience: getExperienceProgress(creature.experience),
        visualUrl,
        visualVersionNumber,
        visualTrait,
        visualHistory,
        currentVisualVersionId,
    })
    const initialSelectedFormId = viewModel.evolutionForms.find((form) => form.isActive)?.id ?? viewModel.evolutionForms.at(-1)?.id ?? ''
    const [selectedFormId, setSelectedFormId] = useState(initialSelectedFormId)
    const selectedForm = viewModel.evolutionForms.find((form) => form.id === selectedFormId)
        ?? viewModel.evolutionForms.find((form) => form.isActive)
        ?? viewModel.evolutionForms.at(-1)

    if (!selectedForm) return null

    function handleNavigate(tab: DockTab) {
        if (tab === 'battle') onBack()
        if (tab === 'profile') onOpenProfile()
        if (tab === 'ranking') onOpenRanking()
    }

    return (
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

                <section className="collection-current" aria-labelledby="current-creature-title">
                    <div className="collection-current__copy">
                        <span className="ev-eyebrow">{selectedForm.isActive ? 'Forma attuale' : 'Forma selezionata'}</span>
                        <h2 id="current-creature-title">Generazione {selectedForm.generation - 1}</h2>
                        <p>{selectedForm.name}</p>
                        <div className="collection-current__types">
                            {selectedForm.types.map((type) => <TypeChip key={type} type={type} />)}
                        </div>
                    </div>
                    <FormArt form={selectedForm} className="collection-current__art" />
                </section>

                <section className="collection-lineage-section" aria-label="Stirpe">
                    <SectionLabel>Stirpe</SectionLabel>
                    <LineageTimeline forms={viewModel.evolutionForms} selectedFormId={selectedForm.id} onSelectForm={setSelectedFormId} />
                </section>

                <FormCatalog forms={viewModel.evolutionForms} selectedFormId={selectedForm.id} onSelectForm={setSelectedFormId} />
            </main>
        </AppShell>
    )
}
