import { useEffect, useState } from 'react'

import { fetchCompetitiveLeaderboard, type CompetitiveLeaderboardEntry } from '../../lib/profile-api'
import { ASSETS } from '../../ui/assets'
import { AppShell, Notice, Panel, ScreenHeader, SectionLabel } from '../../ui/components'
import { TrophyIcon } from '../../ui/icons'

import './LeaderboardScreen.css'

type LeaderboardScreenProps = {
    previewEntries?: CompetitiveLeaderboardEntry[]
}

const RATING_FORMATTER = new Intl.NumberFormat('it-IT')

export function LeaderboardScreen({ previewEntries }: LeaderboardScreenProps) {
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

    return (
        <AppShell
            sceneryUrl={ASSETS.scenery.forest}
            sceneryFallbackUrl={ASSETS.scenery.fallback}
            scroll
            docked
        >
            <section className="leaderboard-screen" aria-labelledby="leaderboard-title">
                <ScreenHeader id="leaderboard-title" eyebrow="PvP competitivo" title="Classifica" />

                <Panel className="leaderboard-intro">
                    <TrophyIcon aria-hidden="true" />
                    <p>Il rating cambia solo nelle partite PvP contro altri giocatori.</p>
                </Panel>

                <SectionLabel>Giocatori</SectionLabel>
                {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}
                {isLoading ? <Panel className="leaderboard-empty">Caricamento classifica...</Panel> : null}
                {!isLoading && !errorMessage && !entries.length ? <Panel className="leaderboard-empty">Nessun rating competitivo disponibile.</Panel> : null}
                {!isLoading && !errorMessage && entries.length ? (
                    <ol className="leaderboard-list ev-stagger">
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
