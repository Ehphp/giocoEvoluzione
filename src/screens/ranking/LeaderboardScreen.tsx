import { useEffect, useState } from 'react'

import { fetchCompetitiveLeaderboard, type CompetitiveLeaderboardEntry } from '../../lib/profile-api'
import { ASSETS } from '../../ui/assets'
import { Dock, type DockTab } from '../../ui/Dock'
import { AppShell, IconButton, Notice, Panel, SectionLabel } from '../../ui/components'
import { ChevronIcon, ExitIcon, TrophyIcon } from '../../ui/icons'

import './LeaderboardScreen.css'

type LeaderboardScreenProps = {
    onBack: () => void
    onOpenProfile: () => void
    onLogout: () => void
    previewEntries?: CompetitiveLeaderboardEntry[]
}

const RATING_FORMATTER = new Intl.NumberFormat('it-IT')

export function LeaderboardScreen({ onBack, onOpenProfile, onLogout, previewEntries }: LeaderboardScreenProps) {
    const [entries, setEntries] = useState<CompetitiveLeaderboardEntry[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        if (previewEntries) {
            setEntries(previewEntries)
            setIsLoading(false)
            setErrorMessage(null)

            return
        }

        let isCurrent = true

        void fetchCompetitiveLeaderboard().then((nextEntries) => {
            if (!isCurrent) return

            setEntries(nextEntries)
            setErrorMessage(null)
        }).catch((error: unknown) => {
            if (!isCurrent) return

            setErrorMessage(error instanceof Error ? error.message : 'Impossibile caricare la classifica.')
        }).finally(() => {
            if (isCurrent) setIsLoading(false)
        })

        return () => { isCurrent = false }
    }, [previewEntries])

    function handleNavigate(tab: DockTab) {
        if (tab === 'battle') onBack()
        if (tab === 'profile') onOpenProfile()
    }

    return (
        <AppShell
            sceneryUrl={ASSETS.scenery.forest}
            sceneryFallbackUrl={ASSETS.scenery.fallback}
            scroll
            dock={<Dock active="ranking" capabilities={{ ranking: true, profile: true }} onNavigate={handleNavigate} />}
        >
            <section className="leaderboard-screen" aria-labelledby="leaderboard-title">
                <header className="leaderboard-topbar">
                    <IconButton label="Torna alla home" onClick={onBack}>
                        <ChevronIcon style={{ transform: 'rotate(180deg)' }} />
                    </IconButton>
                    <div className="leaderboard-topbar__title">
                        <span className="ev-eyebrow ev-eyebrow--light">PvP competitivo</span>
                        <h1 id="leaderboard-title">Classifica</h1>
                    </div>
                    <IconButton label="Esci dall account" variant="danger" onClick={onLogout}>
                        <ExitIcon />
                    </IconButton>
                </header>

                <Panel className="leaderboard-intro">
                    <TrophyIcon aria-hidden="true" />
                    <p>Il rating cambia solo nelle partite PvP contro altri giocatori.</p>
                </Panel>

                <SectionLabel>Giocatori</SectionLabel>
                {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}
                {isLoading ? <Panel className="leaderboard-empty">Caricamento classifica...</Panel> : null}
                {!isLoading && !errorMessage && !entries.length ? <Panel className="leaderboard-empty">Nessun rating competitivo disponibile.</Panel> : null}
                {!isLoading && !errorMessage && entries.length ? (
                    <ol className="leaderboard-list">
                        {entries.map((entry) => (
                            <li key={`${entry.position}-${entry.nickname}`}>
                                <Panel flat className="leaderboard-row">
                                    <strong className="leaderboard-row__position">{entry.position}</strong>
                                    <span className="leaderboard-row__nickname ev-truncate" title={entry.nickname}>{entry.nickname}</span>
                                    <strong className="leaderboard-row__rating">{RATING_FORMATTER.format(entry.skillRating)}</strong>
                                </Panel>
                            </li>
                        ))}
                    </ol>
                ) : null}
            </section>
        </AppShell>
    )
}
