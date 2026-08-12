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

function LineageTimeline({ forms }: { forms: ReadonlyArray<CollectionForm> }) {
    return (
        <div className="collection-lineage" role="region" aria-label="Stirpe: scorri orizzontalmente per vedere le generazioni">
            <ol className="collection-lineage__track">
                {forms.map((form) => (
                    <li key={form.id} className={`collection-lineage__item ${form.isActive ? 'is-active' : ''}`}>
                        <span className="collection-lineage__art"><FormArt form={form} /></span>
                        <strong>GEN {form.generation - 1}</strong>
                    </li>
                ))}
            </ol>
        </div>
    )
}

function FormCatalog({ forms }: { forms: ReadonlyArray<CollectionForm> }) {
    return (
        <section className="collection-catalog" aria-label="Catalogo delle forme sbloccate">
            {forms.map((form) => (
                <article key={form.id} className={`collection-form ${form.isActive ? 'is-active' : ''}`} aria-current={form.isActive ? 'true' : undefined}>
                    <h3>Generazione {form.generation - 1}</h3>
                    <FormArt form={form} className="collection-form__art" />
                    <div className="collection-form__types">
                        {form.types.map((type) => <TypeChip key={type} type={type} />)}
                    </div>
                </article>
            ))}
        </section>
    )
}

export function CollectionScreen({
    profile,
    creature,
    isOnline,
    onBack,
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

    function handleNavigate(tab: DockTab) {
        if (tab === 'battle') onBack()
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
                        <span className="ev-eyebrow">Creatura attuale</span>
                        <h2 id="current-creature-title">Generazione {viewModel.currentCreature.generation - 1}</h2>
                        <p>{viewModel.currentCreature.description}</p>
                        <div className="collection-current__types">
                            {viewModel.currentCreature.types.map((type) => <TypeChip key={type} type={type} />)}
                        </div>
                    </div>
                    <FormArt form={{ image: viewModel.currentCreature.image, name: viewModel.currentCreature.name }} className="collection-current__art" />
                </section>

                <section className="collection-lineage-section" aria-label="Stirpe">
                    <SectionLabel>Stirpe</SectionLabel>
                    <LineageTimeline forms={viewModel.evolutionForms} />
                </section>

                <FormCatalog forms={viewModel.evolutionForms} />
            </main>
        </AppShell>
    )
}
