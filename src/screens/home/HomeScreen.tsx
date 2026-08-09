import { useCallback, useEffect, useState, type CSSProperties } from 'react'

import { Dock, type DockTab } from '../../ui/Dock'
import { AppShell, Avatar, Button, IconButton, Notice, Pill, ProgressBar } from '../../ui/components'
import { BattleIcon, ExitIcon, SparkIcon } from '../../ui/icons'
import { ASSETS } from '../../ui/assets'
import { PlayModesSheet } from './parts/PlayModesSheet'
import type { HomeActions, HomeCreatureImage, HomeViewModel } from './types'

import './HomeScreen.css'

type HomeScreenProps = {
    viewModel: HomeViewModel
    actions: HomeActions
}

function CreatureArt({ image }: { image: HomeCreatureImage }) {
    const [source, setSource] = useState(image.src)
    const [hasFailed, setHasFailed] = useState(false)

    useEffect(() => {
        setSource(image.src)
        setHasFailed(false)
    }, [image.src])

    const style = {
        '--home-creature-scale': image.scale ?? 1,
        '--home-creature-offset-x': `${image.offsetX ?? 0}%`,
        '--home-creature-offset-y': `${image.offsetY ?? 0}%`,
    } as CSSProperties

    if (hasFailed) {
        return <div className="home-stage__creature home-stage__creature--missing" role="img" aria-label={image.alt}>Creatura non disponibile</div>
    }

    return (
        <img
            className="home-stage__creature"
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
    const [isPlayModesOpen, setIsPlayModesOpen] = useState(false)
    const [backgroundSource, setBackgroundSource] = useState(viewModel.stage.backgroundSrc)
    const openPlayModes = useCallback(() => setIsPlayModesOpen(true), [])
    const closePlayModes = useCallback(() => setIsPlayModesOpen(false), [])

    useEffect(() => {
        setBackgroundSource(viewModel.stage.backgroundSrc)
    }, [viewModel.stage.backgroundSrc])

    const displayName = viewModel.player.displayName ?? 'Allenatore locale'
    const experience = viewModel.player.experience

    function handleNavigate(tab: DockTab) {
        if (tab === 'profile') {
            actions.onOpenProfile()
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
                    <img className="home-brand__logo" src={ASSETS.branding.logo} alt="Evori" />
                </h1>

                {viewModel.notices.length ? (
                    <div className="home-notices">
                        {viewModel.notices.map((notice) => <Notice key={notice.id} tone={notice.tone}>{notice.message}</Notice>)}
                    </div>
                ) : null}

                {viewModel.creature ? (
                    <section className="home-stage" aria-label="La tua creatura" data-testid="home-creature-stage">
                        <span className="home-stage__halo" aria-hidden="true" />
                        <CreatureArt image={viewModel.creature.image} />
                        <div className="home-stage__plaque">
                            <span className="ev-eyebrow ev-eyebrow--light">La tua creatura</span>
                            <strong className="ev-truncate">{viewModel.creature.name}</strong>
                            <span className="home-stage__meta">
                                {viewModel.creature.level ? `Livello ${viewModel.creature.level}` : 'Forma iniziale'}
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
        </AppShell>
    )
}
