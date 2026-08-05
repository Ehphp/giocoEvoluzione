import { useMemo } from 'react'

import type { PlayerCreatureRecord, ProfileMatchHistoryItem, ProfileRecord } from '../../lib/profile-api'
import { getExperienceProgress } from '../../lib/progression'

import './ProfileScreen.css'

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
    visualHistory?: ReadonlyArray<{ versionNumber: number; visualTraitId: string; conceptName: string }>
}

function formatDate(value: string) {
    const date = new Date(value)

    return Number.isNaN(date.getTime()) ? 'Data non disponibile' : new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(date)
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
}: ProfileScreenProps) {
    const experience = getExperienceProgress(creature.experience)
    const stats = useMemo(() => history.reduce((total, item) => ({
        played: total.played + 1,
        wins: total.wins + (item.outcome === 'win' ? 1 : 0),
        draws: total.draws + (item.outcome === 'draw' ? 1 : 0),
        losses: total.losses + (item.outcome === 'loss' ? 1 : 0),
    }), { played: 0, wins: 0, draws: 0, losses: 0 }), [history])
    const winRate = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0

    return (
        <section className="profile-screen" aria-labelledby="profile-title">
            <header className="profile-screen__header">
                <button type="button" onClick={onBack}>← Home</button>
                <div><span className="eyebrow">Profilo giocatore</span><h1 id="profile-title">{profile.nickname}</h1></div>
                <button type="button" onClick={onLogout}>Logout</button>
            </header>

            <section className="profile-screen__creature">
                {visualUrl ? <img className="profile-screen__creature-image" src={visualUrl} alt="Visuale ufficiale della creatura" /> : null}
                <div><span>Creatura attuale</span><h2>{creature.name ?? 'Creatura iniziale'}</h2><p>{creature.base_creature_key}</p></div>
                <div><strong>Livello {creature.level}</strong><small>Esperienza: {experience.current} / {experience.required}</small></div>
            </section>

            <section className="profile-screen__visual" aria-label="Progressione visuale">
                <div><span>Versione visuale</span><strong>{visualVersionNumber ?? 1}</strong><small>{visualTrait ?? 'Forma base'}</small></div>
                {visualProgress ? <div><span>Percorso visivo</span><strong>{visualProgress.status === 'READY' ? 'Trasformazione sbloccata' : `${visualProgress.progress} / ${visualProgress.target} vittorie`}</strong></div> : null}
                {onOpenEvolution ? <button type="button" onClick={onOpenEvolution}>Apri evoluzione</button> : null}
                {onOpenBackgroundCleanup ? <button type="button" onClick={onOpenBackgroundCleanup}>Ripulisci visuali</button> : null}
            </section>
            {visualHistory?.length ? <section className="profile-screen__visual-history"><h2>Storico visuale</h2><ol>{visualHistory.map((entry) => <li key={entry.versionNumber}>v{entry.versionNumber} · {entry.visualTraitId} · {entry.conceptName}</li>)}</ol></section> : null}

            <section className="profile-screen__stats" aria-label="Statistiche">
                <article><span>Partite</span><strong>{stats.played}</strong></article>
                <article><span>Vittorie</span><strong>{stats.wins}</strong></article>
                <article><span>Pareggi</span><strong>{stats.draws}</strong></article>
                <article><span>Sconfitte</span><strong>{stats.losses}</strong></article>
                <article><span>Vittorie</span><strong>{winRate}%</strong></article>
            </section>

            <section className="profile-screen__history" aria-labelledby="history-title">
                <h2 id="history-title">Ultime partite</h2>
                {errorMessage ? <p className="profile-screen__error" role="alert">{errorMessage}</p> : null}
                {isLoadingHistory ? <p>Caricamento cronologia…</p> : history.length ? (
                    <ol>
                        {history.slice(0, 10).map((item) => <li key={item.gameId}>
                            <div><strong>{item.outcome === 'win' ? 'Vittoria' : item.outcome === 'draw' ? 'Pareggio' : 'Sconfitta'}</strong><span>{item.mode === 'VS_BOT' ? 'Contro bot' : 'PvP'} · {formatDate(item.date)}</span></div>
                            <div><span>vs {item.opponentNickname}</span><strong>{item.score} – {item.opponentScore}</strong>{item.roomCode ? <small>Stanza {item.roomCode}</small> : null}</div>
                        </li>)}
                    </ol>
                ) : <p>Nessuna partita conclusa ancora.</p>}
            </section>
        </section>
    )
}
