import { useMemo, useState } from 'react'

import { GAME_SELECTION_ASSETS } from '../../components/game-v2/gameSelectionAssets'
import type { PlayerCreatureRecord, ProfileMatchHistoryItem, ProfileRecord } from '../../lib/profile-api'
import { getExperienceProgress } from '../../lib/progression'
import { ASSETS } from '../../ui/assets'
import { Dock, type DockTab } from '../../ui/Dock'
import { AppShell, Button, Chip, IconButton, Notice, Panel, ProgressBar, SectionLabel } from '../../ui/components'
import { ChevronIcon, DnaIcon, ExitIcon, SparkIcon, TrophyIcon } from '../../ui/icons'

import './ProfileScreen.css'

type VisualHistoryEntry = {
    id: string
    versionNumber: number
    visualTraitId: string | null
    conceptName: string | null
    signedUrl: string
    expiresAt: string
}

type ProfileScreenProps = {
    profile: ProfileRecord
    creature: PlayerCreatureRecord
    history: ProfileMatchHistoryItem[]
    isLoadingHistory: boolean
    errorMessage: string | null
    onBack: () => void
    onLogout: () => void
    visualUrl?: string | null
    visualVersionNumber?: number | null
    visualTrait?: string | null
    visualProgress?: { progress: number; target: number; status: string } | null
    onOpenEvolution?: () => void
    onOpenBackgroundCleanup?: () => void
    visualHistory?: ReadonlyArray<VisualHistoryEntry>
    currentVisualVersionId?: string | null
    onSelectVisualVersion?: (versionId: string) => Promise<void>
}

const OUTCOME_LABEL = { win: 'Vittoria', draw: 'Pareggio', loss: 'Sconfitta' } as const
const OUTCOME_TONE = { win: 'good', draw: 'info', loss: 'bad' } as const

function formatDate(value: string) {
    const date = new Date(value)

    return Number.isNaN(date.getTime()) ? 'Data non disponibile' : new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(date)
}

function StatTile({ label, value, tone = 'neutral' }: { label: string; value: string | number; tone?: 'neutral' | 'good' | 'info' | 'bad' }) {
    return (
        <article className={`profile-stat profile-stat--${tone}`}>
            <strong>{value}</strong>
            <span>{label}</span>
        </article>
    )
}

export function ProfileScreen({
    profile,
    creature,
    history,
    isLoadingHistory,
    errorMessage,
    onBack,
    onLogout,
    visualUrl,
    visualVersionNumber,
    visualTrait,
    visualProgress,
    onOpenEvolution,
    onOpenBackgroundCleanup,
    visualHistory,
    currentVisualVersionId,
    onSelectVisualVersion,
}: ProfileScreenProps) {
    const experience = getExperienceProgress(creature.experience)
    const stats = useMemo(() => history.reduce((total, item) => ({
        played: total.played + 1,
        wins: total.wins + (item.outcome === 'win' ? 1 : 0),
        draws: total.draws + (item.outcome === 'draw' ? 1 : 0),
        losses: total.losses + (item.outcome === 'loss' ? 1 : 0),
    }), { played: 0, wins: 0, draws: 0, losses: 0 }), [history])
    const winRate = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0
    const [pendingVersionId, setPendingVersionId] = useState<string | null>(null)
    const [isSelectingVisual, setIsSelectingVisual] = useState(false)
    const [visualSelectionError, setVisualSelectionError] = useState<string | null>(null)
    const selectedVersionId = pendingVersionId ?? currentVisualVersionId ?? null
    const selectedVisual = visualHistory?.find((entry) => entry.id === selectedVersionId)
    const activeVisualUrl = selectedVisual?.signedUrl ?? visualUrl

    async function selectVisualVersion(versionId: string) {
        if (!onSelectVisualVersion || versionId === currentVisualVersionId) {
            return
        }

        setPendingVersionId(versionId)
        setVisualSelectionError(null)
        setIsSelectingVisual(true)

        try {
            await onSelectVisualVersion(versionId)
        } catch (error) {
            setPendingVersionId(null)
            setVisualSelectionError(error instanceof Error ? error.message : 'Non e stato possibile cambiare la versione visuale.')
        } finally {
            setIsSelectingVisual(false)
        }
    }

    function handleNavigate(tab: DockTab) {
        if (tab === 'battle') {
            onBack()
        }
    }

    const dock = (
        <Dock
            active="profile"
            capabilities={{ profile: true }}
            onNavigate={handleNavigate}
        />
    )

    return (
        <AppShell
            sceneryUrl={ASSETS.scenery.forest}
            sceneryFallbackUrl={GAME_SELECTION_ASSETS.backgroundFallback}
            dock={dock}
            scroll
        >
            <section className="profile-screen" aria-labelledby="profile-title">
                <header className="profile-topbar">
                    <IconButton label="Torna alla home" onClick={onBack}>
                        <ChevronIcon style={{ transform: 'rotate(180deg)' }} />
                    </IconButton>
                    <div className="profile-topbar__title">
                        <span className="ev-eyebrow ev-eyebrow--light">Profilo giocatore</span>
                        <h1 id="profile-title" className="ev-truncate">{profile.nickname}</h1>
                    </div>
                    <IconButton label="Esci dall account" variant="danger" onClick={onLogout}>
                        <ExitIcon />
                    </IconButton>
                </header>

                <Panel className="profile-hero">
                    <figure className="profile-hero__stage">
                        <span className="profile-hero__halo" aria-hidden="true" />
                        {activeVisualUrl ? (
                            <img src={activeVisualUrl} alt={`Versione attiva di ${creature.name ?? 'Creatura iniziale'}`} />
                        ) : null}
                    </figure>
                    <div className="profile-hero__copy">
                        <span className="ev-eyebrow">Creatura attuale</span>
                        <h2>{creature.name ?? 'Creatura iniziale'}</h2>
                        <div className="profile-hero__chips">
                            <Chip tone="good" icon={<SparkIcon />}>Livello {creature.level}</Chip>
                            <Chip tone="info" icon={<DnaIcon />}>
                                {selectedVisual ? `v${selectedVisual.versionNumber} · ${selectedVisual.conceptName ?? 'Forma base'}` : `v${visualVersionNumber ?? 1} · ${visualTrait ?? 'Forma base'}`}
                            </Chip>
                        </div>
                        <div className="profile-hero__xp">
                            <ProgressBar current={experience.current} total={experience.required} label={`Esperienza ${experience.current} su ${experience.required}`} />
                            <small>{experience.current} / {experience.required} XP</small>
                        </div>
                    </div>
                </Panel>

                <SectionLabel>Statistiche</SectionLabel>
                <div className="profile-stats">
                    <StatTile label="Partite" value={stats.played} />
                    <StatTile label="Vittorie" value={stats.wins} tone="good" />
                    <StatTile label="Pareggi" value={stats.draws} tone="info" />
                    <StatTile label="Sconfitte" value={stats.losses} tone="bad" />
                    <StatTile label="Win rate" value={`${winRate}%`} />
                </div>

                {onOpenEvolution || onOpenBackgroundCleanup || visualHistory?.length ? (
                    <>
                        <SectionLabel>Progressione visiva</SectionLabel>
                        <Panel className="profile-evolution">
                            {visualProgress ? (
                                <div className="profile-evolution__track">
                                    <div className="profile-evolution__track-copy">
                                        <span className="ev-eyebrow">Percorso visivo</span>
                                        <strong>
                                            {visualProgress.status === 'READY'
                                                ? 'Trasformazione sbloccata'
                                                : `${visualProgress.progress} / ${visualProgress.target} vittorie`}
                                        </strong>
                                    </div>
                                    <ProgressBar
                                        current={visualProgress.status === 'READY' ? visualProgress.target : visualProgress.progress}
                                        total={visualProgress.target}
                                        tone="gold"
                                        label="Avanzamento verso la prossima trasformazione"
                                    />
                                </div>
                            ) : null}

                            {visualHistory?.length ? (
                                <div className="profile-evolution__versions">
                                    <span className="ev-eyebrow">Forme sbloccate</span>
                                    <div className="profile-evolution__chips" role="group" aria-label="Scegli la versione visuale attiva">
                                        {visualHistory.map((entry) => (
                                            <button
                                                key={entry.id}
                                                type="button"
                                                className={`profile-version ${entry.id === currentVisualVersionId ? 'is-active' : ''}`}
                                                aria-pressed={entry.id === currentVisualVersionId}
                                                aria-label={`Versione ${entry.versionNumber}${entry.conceptName ? `, ${entry.conceptName}` : ''}`}
                                                disabled={isSelectingVisual || !onSelectVisualVersion}
                                                onClick={() => void selectVisualVersion(entry.id)}
                                            >
                                                v{entry.versionNumber}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {visualSelectionError ? <Notice tone="error">{visualSelectionError}</Notice> : null}

                            <div className="profile-evolution__actions">
                                {onOpenEvolution ? (
                                    <Button tone="evolve" block onClick={onOpenEvolution}>
                                        <DnaIcon aria-hidden="true" />
                                        Evolvi creatura
                                    </Button>
                                ) : null}
                                {onOpenBackgroundCleanup ? (
                                    <Button tone="cream" block size="sm" onClick={onOpenBackgroundCleanup}>Ripulisci visuali</Button>
                                ) : null}
                            </div>
                        </Panel>
                    </>
                ) : null}

                <SectionLabel>Ultime partite</SectionLabel>
                {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}
                {isLoadingHistory ? (
                    <Panel className="profile-empty">Caricamento cronologia...</Panel>
                ) : history.length ? (
                    <ol className="profile-history">
                        {history.slice(0, 10).map((item) => (
                            <li key={item.gameId}>
                                <Panel className={`profile-match profile-match--${item.outcome}`} flat>
                                    <span className="profile-match__outcome" aria-hidden="true"><TrophyIcon /></span>
                                    <div className="profile-match__copy">
                                        <strong>{OUTCOME_LABEL[item.outcome]}</strong>
                                        <span className="ev-truncate">vs {item.opponentNickname}</span>
                                        <small>{item.mode === 'VS_BOT' ? 'Contro bot' : 'PvP'} · {formatDate(item.date)}{item.roomCode ? ` · ${item.roomCode}` : ''}</small>
                                    </div>
                                    <Chip tone={OUTCOME_TONE[item.outcome]}>{item.score} – {item.opponentScore}</Chip>
                                </Panel>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <Panel className="profile-empty">Nessuna partita conclusa ancora.</Panel>
                )}
            </section>
        </AppShell>
    )
}
