import { useMemo, useState } from 'react'

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
    visualHistory?: ReadonlyArray<{ id: string; versionNumber: number; visualTraitId: string | null; conceptName: string | null; signedUrl: string; expiresAt: string }>
    currentVisualVersionId?: string | null
    onSelectVisualVersion?: (versionId: string) => Promise<void>
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
    const [selectedVisualVersionId, setSelectedVisualVersionId] = useState<string | null>(null)
    const [isSelectingVisual, setIsSelectingVisual] = useState(false)
    const [visualSelectionError, setVisualSelectionError] = useState<string | null>(null)
    const selectedVersionId = selectedVisualVersionId ?? currentVisualVersionId ?? null
    const selectedIndex = Math.max(0, visualHistory?.findIndex((entry) => entry.id === selectedVersionId) ?? 0)
    const selectedVisual = visualHistory?.[selectedIndex]
    const activeVisualUrl = selectedVisual?.signedUrl ?? visualUrl

    async function selectVisualVersion(versionId: string) {
        if (!onSelectVisualVersion || versionId === currentVisualVersionId) return
        setSelectedVisualVersionId(versionId)
        setVisualSelectionError(null)
        setIsSelectingVisual(true)
        try { await onSelectVisualVersion(versionId) }
        catch (error) { setSelectedVisualVersionId(null); setVisualSelectionError(error instanceof Error ? error.message : 'Non e stato possibile cambiare la versione visuale.') }
        finally { setIsSelectingVisual(false) }
    }

    return (
        <section className="profile-screen" aria-labelledby="profile-title">
            <header className="profile-screen__header">
                <button type="button" onClick={onBack}>← Home</button>
                <div><span className="eyebrow">Profilo giocatore</span><h1 id="profile-title">{profile.nickname}</h1></div>
                <button type="button" onClick={onLogout}>Logout</button>
            </header>

            <section className="profile-screen__creature" aria-label="Creatura attiva">
                <div className="profile-screen__creature-intro">
                    <span>Creatura attuale</span>
                    <h2>{creature.name ?? 'Creatura iniziale'}</h2>
                    <p>{creature.base_creature_key}</p>
                </div>
                <figure className="profile-screen__creature-stage">
                    {activeVisualUrl ? <img className="profile-screen__creature-image" src={activeVisualUrl} alt={`Versione attiva di ${creature.name ?? 'Creatura iniziale'}`} /> : null}
                    <figcaption>{selectedVisual ? `v${selectedVisual.versionNumber} · ${selectedVisual.conceptName ?? 'Forma base'}` : `v${visualVersionNumber ?? 1} · ${visualTrait ?? 'Forma base'}`}</figcaption>
                </figure>
                <div className="profile-screen__creature-level"><strong>Livello {creature.level}</strong><small>Esperienza: {experience.current} / {experience.required}</small></div>
            </section>

            <section className="profile-screen__visual" aria-label="Progressione visuale">
                <div><span>Versione visuale</span><strong>{visualVersionNumber ?? 1}</strong><small>{visualTrait ?? 'Forma base'}</small></div>
                {visualProgress ? <div><span>Percorso visivo</span><strong>{visualProgress.status === 'READY' ? 'Trasformazione sbloccata' : `${visualProgress.progress} / ${visualProgress.target} vittorie`}</strong></div> : null}
                <div className="profile-screen__visual-actions">
                    {onOpenEvolution ? <button type="button" className="profile-screen__evolution-button" onClick={onOpenEvolution}>Evolvi creatura</button> : null}
                    {onOpenBackgroundCleanup ? <button type="button" className="profile-screen__cleanup-button" onClick={onOpenBackgroundCleanup}>Ripulisci visuali</button> : null}
                </div>
            </section>
            {visualHistory?.length ? <section className="profile-screen__visual-history"><div className="profile-screen__visual-history-heading"><h2>Forme sbloccate</h2><span>Seleziona la versione attiva</span></div><div className="profile-screen__visual-selector"><input type="range" min="0" max={Math.max(0, visualHistory.length - 1)} value={selectedIndex} disabled={isSelectingVisual || !onSelectVisualVersion} onChange={(event) => { const next = visualHistory[Number(event.target.value)]; if (next) void selectVisualVersion(next.id) }} aria-label="Scegli la versione visuale della creatura" /><div>{visualHistory.map((entry) => <button key={entry.id} type="button" className={entry.id === currentVisualVersionId ? 'is-active' : ''} disabled={isSelectingVisual || !onSelectVisualVersion} onClick={() => void selectVisualVersion(entry.id)}>v{entry.versionNumber}</button>)}</div>{visualSelectionError ? <p className="profile-screen__error" role="alert">{visualSelectionError}</p> : null}</div></section> : null}

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
