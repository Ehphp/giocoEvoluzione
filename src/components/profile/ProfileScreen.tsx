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
                <div><span>Creatura attuale</span><h2>{creature.name ?? 'Creatura iniziale'}</h2><p>{creature.base_creature_key}</p></div>
                <div><strong>Livello {creature.level}</strong><small>Esperienza: {experience.current} / {experience.required}</small></div>
            </section>

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
