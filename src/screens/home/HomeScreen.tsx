import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

import { AppShell, AvatarProgress, Button, Notice, PopoverMenu } from '../../ui/components'
import { BattleIcon, ChevronIcon, ExitIcon, FeedbackOffIcon, FeedbackOnIcon, RankingIcon } from '../../ui/icons'
import { ASSETS, srcSetFor } from '../../ui/assets'
import { playCue } from '../../ui/feedback/feedback'
import { useFeedbackPreference } from '../../ui/feedback/use-feedback'
import { PlayModesSheet } from './parts/PlayModesSheet'
import { measureCreatureSubject, type CreatureSubject } from './creature-subject-fit'
import type { HomeActions, HomeCreatureImage, HomeViewModel } from './types'

import './HomeScreen.css'

type HomeScreenProps = {
    viewModel: HomeViewModel
    actions: HomeActions
}

/**
 * How many forms either side of the selected one are fetched ahead of it.
 *
 * One, so a swipe lands on a sprite that is already there. Fetching the whole lineage instead is
 * what made a page load cost 1.08 MB at eleven forms and grow by ~90 KB with every evolution: you
 * see one form, and `loading="lazy"` holds nothing back because the carousel is a horizontal row
 * already inside the viewport.
 */
const PREFETCHED_NEIGHBOURS = 1

/**
 * The carousel mounts one of these per past form. Only the form on screen is worth fetching, and
 * only that one is worth measuring: the measurement loads its own copy of the sprite, so measuring
 * every slide would double an already unnecessary download.
 *
 * `isFetchable` is what enforces the first half of that. Without a `src` the element makes no
 * request at all — the slide is sized by the carousel rather than by the image, so an empty one
 * still holds its place in the scroll snap.
 */
function CreatureArt({ image, isActive, isFetchable }: { image: HomeCreatureImage; isActive: boolean; isFetchable: boolean }) {
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
        if (!isActive) return
        let isCurrent = true

        setSubject(null)
        void measureCreatureSubject(source).then((measured) => {
            if (isCurrent) {
                setSubject(measured)
            }
        })

        return () => { isCurrent = false }
    }, [isActive, source])

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
            src={isFetchable ? source : undefined}
            alt={isFetchable ? image.alt : ''}
            loading={isActive ? 'eager' : 'lazy'}
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
    /*
     * Every form the carousel has been allowed to fetch so far. It only ever grows: dropping a
     * `src` after a swipe away would just make the swipe back ask for the sprite a second time.
     */
    const [fetchableVisualIds, setFetchableVisualIds] = useState<ReadonlySet<string>>(() => new Set<string>())
    // --- derived ---------------------------------------------------------------
    const openPlayModes = useCallback(() => setIsPlayModesOpen(true), [])
    const closePlayModes = useCallback(() => setIsPlayModesOpen(false), [])
    const { isEnabled: isFeedbackEnabled, toggle: toggleFeedback } = useFeedbackPreference()
    const displayName = viewModel.player.displayName ?? 'Allenatore locale'
    const experience = viewModel.player.experience
    const selectedVisual = visualVersions.find((version) => version.id === selectedVisualId)
        ?? visualVersions.find((version) => version.isCurrent)
        ?? visualVersions.at(-1)
    const selectedVisualIndex = visualVersions.findIndex((version) => version.id === selectedVisual?.id)
    /* The forms the carousel may ask for, as one comparable value the effect below can depend on. */
    const fetchableNeighbourKey = selectedVisualIndex < 0
        ? ''
        : visualVersions
            .slice(Math.max(0, selectedVisualIndex - PREFETCHED_NEIGHBOURS), selectedVisualIndex + PREFETCHED_NEIGHBOURS + 1)
            .map((version) => version.id)
            .join(',')

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

    useEffect(() => {
        if (!fetchableNeighbourKey) return

        setFetchableVisualIds((current) => {
            const next = new Set(current)

            for (const id of fetchableNeighbourKey.split(',')) next.add(id)

            return next.size === current.size ? current : next
        })
    }, [fetchableNeighbourKey])
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

    return (
        <AppShell
            sceneryUrl={backgroundSource}
            sceneryFallbackUrl={viewModel.stage.backgroundFallbackSrc}
            docked
            className="home-shell"
            scroll
        >
            <div className="home-screen" aria-busy={viewModel.playModes.isBusy}>
                {/*
                  * One row for everything that is not the creature: the brand mark, who you are, and
                  * the way out. The logo used to own a row of its own at up to 300px wide and the
                  * identity card stacked three lines under a connection badge — between them they
                  * took most of a phone screen to say nothing the player did not already know.
                  * Offline is reported by a notice below when it actually happens.
                  */}
                <header className="home-topbar">
                    <h1 className="home-brand">
                        <img
                            className="home-brand__logo"
                            src={ASSETS.branding.logo}
                            srcSet={srcSetFor(ASSETS.branding.logo)}
                            /* A 108px mark: without `sizes` this alone would pull the widest file. */
                            sizes="108px"
                            alt="Evori"
                        />
                    </h1>
                    {/*
                      * The player's own row is the way into their own settings — sound and signing
                      * out used to be two permanent buttons repeated across screens, which is a lot
                      * of chrome for two things nobody touches twice a session.
                      */}
                    <PopoverMenu
                        className="home-account"
                        triggerClassName="home-identity"
                        align="end"
                        label={`Account di ${displayName}`}
                        triggerLabel={`Apri le opzioni di ${displayName}`}
                        trigger={
                            <>
                                <AvatarProgress
                                    name={displayName}
                                    src={viewModel.player.avatarUrl}
                                    size={32}
                                    level={viewModel.player.accountLevel}
                                    current={experience?.current ?? 0}
                                    total={experience?.required ?? 0}
                                    label={experience
                                        ? `Esperienza ${experience.current} su ${experience.required}`
                                        : 'Esperienza non disponibile'}
                                />
                                <div className="home-identity__copy">
                                    <strong className="ev-truncate">{displayName}</strong>
                                    {/* The trophy is the word "Rating": it fits where the word did not. */}
                                    {viewModel.player.rating ? (
                                        <span className="home-identity__rank" aria-label={`Punteggio classifica ${viewModel.player.rating}`}>
                                            <RankingIcon aria-hidden="true" />
                                            <span className="ev-truncate">{viewModel.player.rating}</span>
                                        </span>
                                    ) : (
                                        <span className="home-identity__rank ev-truncate">Ospite locale</span>
                                    )}
                                </div>
                                <ChevronIcon className="home-identity__more" aria-hidden="true" />
                            </>
                        }
                    >
                        {(closeAccount) => (
                            <>
                                {/*
                                  * `cue={null}`: the toggle confirms with a cue only when switching
                                  * *on*. `playCue` reads the preference straight from the module
                                  * rather than from React state, so by that line it already holds
                                  * the new value — on announces itself, off goes quiet, no branch.
                                  */}
                                <Button
                                    tone="ghost"
                                    size="sm"
                                    role="menuitem"
                                    aria-pressed={isFeedbackEnabled}
                                    cue={null}
                                    onClick={() => {
                                        toggleFeedback()
                                        playCue('confirm')
                                    }}
                                >
                                    {isFeedbackEnabled ? <FeedbackOnIcon aria-hidden="true" /> : <FeedbackOffIcon aria-hidden="true" />}
                                    {isFeedbackEnabled ? 'Audio attivo' : 'Audio disattivato'}
                                </Button>
                                <Button
                                    tone="ghost"
                                    size="sm"
                                    role="menuitem"
                                    cue="alert"
                                    className="home-account__logout"
                                    onClick={() => {
                                        closeAccount()
                                        actions.onLogout()
                                    }}
                                >
                                    <ExitIcon aria-hidden="true" />
                                    Esci dall account
                                </Button>
                            </>
                        )}
                    </PopoverMenu>
                </header>

                {viewModel.notices.length ? (
                    <div className="home-notices">
                        {viewModel.notices.map((notice) => <Notice key={notice.id} tone={notice.tone}>{notice.message}</Notice>)}
                    </div>
                ) : null}

                {viewModel.creature ? (
                    <section className="home-stage" aria-label={`La tua creatura, ${viewModel.creature.name}`} data-testid="home-creature-stage">
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
                                    /*
                                     * Without this the browser claims the gesture for its own
                                     * panning and answers the capture with `pointercancel`, which
                                     * drops the drag before the first move — so a mouse could pull
                                     * the carousel exactly once and then never again. Suppressing
                                     * the default also suppresses the focus that came with it, so
                                     * the arrow keys get it back by hand.
                                     */
                                    event.preventDefault()
                                    event.currentTarget.focus({ preventScroll: true })
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
                                {visualVersions.map((version) => (
                                    <div
                                        key={version.id}
                                        className="home-stage__slide"
                                        aria-hidden={version.id !== selectedVisual?.id}
                                        data-testid={`home-creature-form-${version.id}`}
                                    >
                                        <CreatureArt
                                            image={version.image}
                                            isActive={version.id === selectedVisual?.id}
                                            isFetchable={fetchableVisualIds.has(version.id)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                ) : null}

                {/* The sheet behind it names the three ways to play, so the button does not have to. */}
                <Button tone="gold" block className="home-cta__play" onClick={openPlayModes}>
                    <BattleIcon aria-hidden="true" />
                    GIOCA
                </Button>
            </div>

            {isPlayModesOpen ? (
                <PlayModesSheet
                    mode={viewModel.mode}
                    playModes={viewModel.playModes}
                    actions={actions}
                    onClose={closePlayModes}
                />
            ) : null}

        </AppShell>
    )
}
