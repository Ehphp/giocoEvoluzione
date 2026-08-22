import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

import { Dock, type DockTab } from '../../ui/Dock'
import { AppShell, Avatar, Button, IconButton, Notice, Overlay, Panel, Pill, ProgressBar, SheetHeader } from '../../ui/components'
import { BattleIcon, ExitIcon, SparkIcon } from '../../ui/icons'
import { ASSETS, srcSetFor } from '../../ui/assets'
import { PlayModesSheet } from './parts/PlayModesSheet'
import { measureCreatureSubject, type CreatureSubject } from './creature-subject-fit'
import type { HomeActions, HomeCreatureImage, HomeViewModel } from './types'

import './HomeScreen.css'

type HomeScreenProps = {
    viewModel: HomeViewModel
    actions: HomeActions
}

function CreatureArt({ image }: { image: HomeCreatureImage }) {
    const [source, setSource] = useState(image.src)
    const [hasFailed, setHasFailed] = useState(false)
    const [subject, setSubject] = useState<CreatureSubject | null>(null)

    useEffect(() => {
        setSource(image.src)
        setHasFailed(false)
    }, [image.src])

    /*
     * How much of the sprite is actually animal. Until this resolves — and forever, if the image
     * cannot be read — the sprite renders as a plain contained fit, which is correct but sized by
     * the file rather than by the creature in it.
     */
    useEffect(() => {
        let isCurrent = true

        setSubject(null)
        void measureCreatureSubject(source).then((measured) => {
            if (isCurrent) {
                setSubject(measured)
            }
        })

        return () => { isCurrent = false }
    }, [source])

    const style = {
        '--home-creature-scale': image.scale ?? 1,
        '--home-creature-offset-x': `${image.offsetX ?? 0}%`,
        '--home-creature-offset-y': `${image.offsetY ?? 0}%`,
        ...(subject ? {
            '--home-subject-h': subject.heightRatio,
            '--home-subject-box-wph': subject.boxWidthPerHeight,
            '--home-subject-cx': subject.centreX,
            '--home-subject-cy': subject.centreY,
        } : null),
    } as CSSProperties

    if (hasFailed) {
        return <div className="home-stage__creature home-stage__creature--missing" role="img" aria-label={image.alt}>Creatura non disponibile</div>
    }

    return (
        <img
            className={`home-stage__creature ${subject ? 'home-stage__creature--fitted' : ''}`}
            src={source}
            alt={image.alt}
            style={style}
            onError={() => {
                if (source !== image.fallbackSrc) {
                    setSource(image.fallbackSrc)

                    return
                }

                setHasFailed(true)
            }}
        />
    )
}

export function HomeScreen({ viewModel, actions }: HomeScreenProps) {
    // --- state -----------------------------------------------------------------
    const [isPlayModesOpen, setIsPlayModesOpen] = useState(false)
    const [isCreatureDescriptionOpen, setIsCreatureDescriptionOpen] = useState(false)
    const [backgroundSource, setBackgroundSource] = useState(viewModel.stage.backgroundSrc)
    // --- derived ---------------------------------------------------------------
    const creatureCarouselRef = useRef<HTMLDivElement>(null)
    const dragStartRef = useRef<{ x: number; scrollLeft: number } | null>(null)
    const visualVersions = viewModel.creature?.visualVersions ?? []
    const currentVisualId = visualVersions.find((version) => version.isCurrent)?.id ?? visualVersions.at(-1)?.id ?? ''
    const currentVisualIndex = visualVersions.findIndex((version) => version.id === currentVisualId)
    const visualVersionKey = visualVersions.map((version) => version.id).join(',')
    // --- state (seeded from the current visual above) ---------------------------
    const [selectedVisualId, setSelectedVisualId] = useState(currentVisualId)
    // --- derived ---------------------------------------------------------------
    const openPlayModes = useCallback(() => setIsPlayModesOpen(true), [])
    const closePlayModes = useCallback(() => setIsPlayModesOpen(false), [])
    const closeCreatureDescription = useCallback(() => setIsCreatureDescriptionOpen(false), [])
    const displayName = viewModel.player.displayName ?? 'Allenatore locale'
    const experience = viewModel.player.experience
    const selectedVisual = visualVersions.find((version) => version.id === selectedVisualId)
        ?? visualVersions.find((version) => version.isCurrent)
        ?? visualVersions.at(-1)

    // --- effects ---------------------------------------------------------------
    useEffect(() => {
        setBackgroundSource(viewModel.stage.backgroundSrc)
    }, [viewModel.stage.backgroundSrc])

    useEffect(() => {
        setSelectedVisualId(currentVisualId)
        const carousel = creatureCarouselRef.current

        if (carousel && currentVisualIndex >= 0) {
            carousel.scrollLeft = currentVisualIndex * Math.max(carousel.clientWidth, 1)
        }
    }, [currentVisualId, currentVisualIndex, visualVersionKey])
    // --- handlers --------------------------------------------------------------
    function selectVisualAt(index: number) {
        const version = visualVersions[index]
        const carousel = creatureCarouselRef.current

        if (!version || !carousel) return

        carousel.scrollLeft = index * Math.max(carousel.clientWidth, 1)
        setSelectedVisualId(version.id)
    }

    function handleCreatureScroll() {
        const carousel = creatureCarouselRef.current

        if (!carousel || visualVersions.length < 2) return

        const index = Math.max(0, Math.min(
            visualVersions.length - 1,
            Math.round(carousel.scrollLeft / Math.max(carousel.clientWidth, 1)),
        ))
        setSelectedVisualId(visualVersions[index]!.id)
    }

    function handleNavigate(tab: DockTab) {
        if (tab === 'profile') {
            actions.onOpenProfile()
        }

        if (tab === 'collection') {
            actions.onOpenCollection()
        }

        if (tab === 'ranking') {
            actions.onOpenRanking()
        }
    }

    const dock = (
        <Dock
            active="battle"
            capabilities={{
                shop: viewModel.capabilities.collection,
                collection: viewModel.capabilities.collection,
                ranking: viewModel.capabilities.rankings,
                profile: viewModel.capabilities.profile,
            }}
            onNavigate={handleNavigate}
        />
    )

    return (
        <AppShell
            sceneryUrl={backgroundSource}
            sceneryFallbackUrl={viewModel.stage.backgroundFallbackSrc}
            dock={dock}
            className="home-shell"
            scroll
        >
            <div className="home-screen" aria-busy={viewModel.playModes.isBusy}>
                <header className="home-topbar">
                    <div className="home-identity">
                        <Avatar name={displayName} src={viewModel.player.avatarUrl} size={40} />
                        <div className="home-identity__copy">
                            <strong className="ev-truncate">{displayName}</strong>
                            <span className="home-identity__rank">{viewModel.player.rankLabel ?? 'Ospite locale'}</span>
                            {experience ? (
                                <ProgressBar
                                    current={experience.current}
                                    total={experience.required}
                                    label={`Esperienza ${experience.current} su ${experience.required}`}
                                />
                            ) : null}
                        </div>
                    </div>
                    <div className="home-topbar__side">
                        <Pill className={viewModel.connection.isOnline ? 'is-online' : 'is-offline'}>
                            {viewModel.connection.isOnline ? 'Online' : 'Offline'}
                        </Pill>
                        <IconButton label="Esci dall account" variant="danger" onClick={actions.onLogout}>
                            <ExitIcon />
                        </IconButton>
                    </div>
                </header>

                <h1 className="home-brand">
                    {/* `min(78%, 300px)` of a shell capped at --ev-app-max-width, dropping to 170px when short. */}
                    <img
                        className="home-brand__logo"
                        src={ASSETS.branding.logo}
                        srcSet={srcSetFor(ASSETS.branding.logo)}
                        sizes="(max-height: 600px) 170px, min(78vw, 300px)"
                        alt="Evori"
                    />
                </h1>

                {viewModel.notices.length ? (
                    <div className="home-notices">
                        {viewModel.notices.map((notice) => <Notice key={notice.id} tone={notice.tone}>{notice.message}</Notice>)}
                    </div>
                ) : null}

                {viewModel.creature ? (
                    <section className="home-stage" aria-label="La tua creatura" data-testid="home-creature-stage">
                        {/*
                          * The art has its own box and the plaque sits below it, as siblings. The
                          * creature used to be positioned over the plaque and pulled back up by a
                          * constant measured off one sprite — but the sprites do not share a
                          * framing (some carry a third of their height as transparent margin,
                          * others none), so that constant dropped the unpadded ones through the
                          * plaque. Stacked boxes cannot overlap whatever the sprite looks like.
                          */}
                        <div className="home-stage__art">
                            <span className="home-stage__halo" aria-hidden="true" />
                            <div
                                ref={creatureCarouselRef}
                                className="home-stage__carousel"
                                role="region"
                                aria-label="Forme sbloccate della creatura"
                                tabIndex={visualVersions.length > 1 ? 0 : -1}
                                onScroll={handleCreatureScroll}
                                onKeyDown={(event) => {
                                    const selectedIndex = visualVersions.findIndex((version) => version.id === selectedVisual?.id)

                                    if (event.key === 'ArrowLeft') {
                                        event.preventDefault()
                                        selectVisualAt(Math.max(0, selectedIndex - 1))
                                    }

                                    if (event.key === 'ArrowRight') {
                                        event.preventDefault()
                                        selectVisualAt(Math.min(visualVersions.length - 1, selectedIndex + 1))
                                    }
                                }}
                                onPointerDown={(event) => {
                                    if (event.pointerType !== 'mouse') return
                                    dragStartRef.current = { x: event.clientX, scrollLeft: event.currentTarget.scrollLeft }
                                    event.currentTarget.setPointerCapture(event.pointerId)
                                }}
                                onPointerMove={(event) => {
                                    const dragStart = dragStartRef.current

                                    if (!dragStart || event.pointerType !== 'mouse') return
                                    event.currentTarget.scrollLeft = dragStart.scrollLeft - (event.clientX - dragStart.x)
                                }}
                                onPointerUp={(event) => {
                                    dragStartRef.current = null
                                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                                        event.currentTarget.releasePointerCapture(event.pointerId)
                                    }
                                }}
                                onPointerCancel={() => { dragStartRef.current = null }}
                                data-testid="home-creature-carousel"
                            >
                                {visualVersions.map((version) => {
                                    const canInspect = Boolean(
                                        viewModel.creature?.shortDescription
                                        && version.id === selectedVisual?.id
                                        && version.isCurrent,
                                    )

                                    return (
                                        <div
                                            key={version.id}
                                            className="home-stage__slide"
                                            aria-hidden={version.id !== selectedVisual?.id}
                                            data-testid={`home-creature-form-${version.id}`}
                                        >
                                            {canInspect ? (
                                                <button
                                                    type="button"
                                                    className="home-stage__inspect"
                                                    aria-label={`Leggi la descrizione di ${viewModel.creature?.name ?? 'questa creatura'}`}
                                                    onClick={() => setIsCreatureDescriptionOpen(true)}
                                                    data-testid="home-creature-description-trigger"
                                                >
                                                    <CreatureArt image={version.image} />
                                                </button>
                                            ) : <CreatureArt image={version.image} />}
                                        </div>
                                    )
                                })}
                            </div>
                            {visualVersions.length > 1 ? (
                                <span className="home-stage__position" role="status" aria-live="polite" aria-label={`Forma ${visualVersions.findIndex((version) => version.id === selectedVisual?.id) + 1} di ${visualVersions.length}`}>
                                    {visualVersions.map((version) => <i key={version.id} className={version.id === selectedVisual?.id ? 'is-current' : ''} />)}
                                </span>
                            ) : null}
                        </div>
                        <div className="home-stage__plaque">
                            <span className="ev-eyebrow ev-eyebrow--light">{selectedVisual?.isCurrent ? 'La tua creatura' : 'Forma visualizzata'}</span>
                            <strong className="ev-truncate">{viewModel.creature.name}</strong>
                            <span className="home-stage__meta">
                                {selectedVisual
                                    ? `Generazione ${selectedVisual.generation - 1}${viewModel.creature.level ? ` · Livello ${viewModel.creature.level}` : ''}`
                                    : viewModel.creature.level ? `Livello ${viewModel.creature.level}` : 'Forma iniziale'}
                                {viewModel.creature.evolution
                                    ? ` · ${viewModel.creature.evolution.label ?? `Evoluzione ${viewModel.creature.evolution.current}/${viewModel.creature.evolution.total}`}`
                                    : ''}
                            </span>
                        </div>
                    </section>
                ) : null}

                <div className="home-cta">
                    <Button tone="gold" block className="home-cta__play" onClick={openPlayModes}>
                        <BattleIcon aria-hidden="true" />
                        GIOCA
                    </Button>
                    <p className="home-cta__hint">
                        <SparkIcon aria-hidden="true" />
                        Crea una partita, sfida il bot o entra con un codice
                    </p>
                </div>
            </div>

            {isPlayModesOpen ? (
                <PlayModesSheet
                    mode={viewModel.mode}
                    playModes={viewModel.playModes}
                    actions={actions}
                    onClose={closePlayModes}
                />
            ) : null}

            {isCreatureDescriptionOpen && viewModel.creature?.shortDescription ? (
                <Overlay
                    label={`Descrizione di ${viewModel.creature.name}`}
                    align="center"
                    width="narrow"
                    onClose={closeCreatureDescription}
                >
                    <Panel className="home-creature-description-dialog">
                        <SheetHeader eyebrow="La tua creatura" title={viewModel.creature.name} onClose={closeCreatureDescription} />
                        <p className="home-creature-description-dialog__copy">
                            {viewModel.creature.shortDescription}
                        </p>
                    </Panel>
                </Overlay>
            ) : null}
        </AppShell>
    )
}
