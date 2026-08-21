import { useMemo, useState } from 'react'

import { GAME_SELECTION_ASSETS } from '../../components/game-v2/gameSelectionAssets'
import type { PlayerCreatureRecord, ProfileMatchHistoryItem, ProfileRecord } from '../../lib/profile-api'
import { getExperienceProgress } from '../../lib/progression'
import { COMBAT_MUTATION_CATALOG } from '../../../shared/game-rules/catalog.ts'
import type { CombatMutationId, CombatMutationLoadout } from '../../../shared/game-rules/types.ts'
import { ASSETS, fallbackToDefaultCreatureImage } from '../../ui/assets'
import { Dock, type DockTab } from '../../ui/Dock'
import { AppShell, Button, Chip, IconButton, Notice, Overlay, Panel, ProgressBar, SectionLabel } from '../../ui/components'
import { ChevronIcon, DnaIcon, ExitIcon, SparkIcon, TrophyIcon } from '../../ui/icons'

import './ProfileScreen.css'

type ProfileScreenProps = {
    profile: ProfileRecord
    creature: PlayerCreatureRecord
    history: ProfileMatchHistoryItem[]
    isLoadingHistory: boolean
    errorMessage: string | null
    onBack: () => void
    onOpenCollection: () => void
    onOpenRanking: () => void
    onLogout: () => void
    visualUrl?: string | null
    visualVersionNumber?: number | null
    visualTrait?: string | null
    onOpenEvolution?: () => void
    onOpenBackgroundCleanup?: () => void
    onSetCombatMutationLoadout?: (loadout: CombatMutationLoadout) => Promise<void>
}

const OUTCOME_LABEL = { win: 'Vittoria', draw: 'Pareggio', loss: 'Sconfitta' } as const
const OUTCOME_TONE = { win: 'good', draw: 'info', loss: 'bad' } as const
const RATING_FORMATTER = new Intl.NumberFormat('it-IT')

function formatDate(value: string) {
    const date = new Date(value)

    return Number.isNaN(date.getTime()) ? 'Data non disponibile' : new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(date)
}

function requireCombatMutationLoadout(loadout: CombatMutationLoadout | undefined): CombatMutationLoadout {
    if (!loadout) throw new Error('Loadout Combat Mutations della creatura non disponibile.')
    return loadout
}

function StatTile({ label, value, tone = 'neutral', emphasized = false }: { label: string; value: string | number; tone?: 'neutral' | 'good' | 'info' | 'bad'; emphasized?: boolean }) {
    return (
        <article className={`profile-stat profile-stat--${tone} ${emphasized ? 'profile-stat--emphasized' : ''}`}>
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
    onOpenCollection,
    onOpenRanking,
    onLogout,
    visualUrl,
    visualVersionNumber,
    visualTrait,
    onOpenEvolution,
    onOpenBackgroundCleanup,
    onSetCombatMutationLoadout,
}: ProfileScreenProps) {
    const experience = getExperienceProgress(creature.experience)
    const stats = useMemo(() => history.reduce((total, item) => ({
        played: total.played + 1,
        wins: total.wins + (item.outcome === 'win' ? 1 : 0),
        draws: total.draws + (item.outcome === 'draw' ? 1 : 0),
        losses: total.losses + (item.outcome === 'loss' ? 1 : 0),
    }), { played: 0, wins: 0, draws: 0, losses: 0 }), [history])
    const winRate = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0
    const [openMutationSlot, setOpenMutationSlot] = useState<0 | 1 | null>(null)
    const [isUpdatingMutation, setIsUpdatingMutation] = useState(false)
    const [mutationError, setMutationError] = useState<string | null>(null)
    const combatMutationLoadout = requireCombatMutationLoadout(creature.combat_mutation_loadout)
    const activeVisualUrl = visualUrl ?? ASSETS.creatures.default

    async function selectCombatMutation(mutation: CombatMutationId) {
        if (openMutationSlot === null || !onSetCombatMutationLoadout || isUpdatingMutation || combatMutationLoadout[1 - openMutationSlot] === mutation) return
        const next = openMutationSlot === 0
            ? [mutation, combatMutationLoadout[1]]
            : [combatMutationLoadout[0], mutation]
        setIsUpdatingMutation(true)
        setMutationError(null)
        try {
            await onSetCombatMutationLoadout(next as unknown as CombatMutationLoadout)
            setOpenMutationSlot(null)
        } catch (error) {
            setMutationError(error instanceof Error ? error.message : 'Non e stato possibile aggiornare le mutazioni.')
        } finally {
            setIsUpdatingMutation(false)
        }
    }

    function handleNavigate(tab: DockTab) {
        if (tab === 'battle') {
            onBack()
        }

        if (tab === 'collection') {
            onOpenCollection()
        }

        if (tab === 'ranking') {
            onOpenRanking()
        }
    }

    const dock = (
        <Dock
            active="profile"
            capabilities={{ collection: true, ranking: true, profile: true }}
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
                        <span className="ev-eyebrow ev-eyebrow--light">Creatura attiva</span>
                        <h1 id="profile-title" className="ev-truncate">{profile.nickname}</h1>
                    </div>
                    <IconButton label="Esci dall account" variant="danger" onClick={onLogout}>
                        <ExitIcon />
                    </IconButton>
                </header>

                <Panel className="profile-hero" compact>
                    <figure className="profile-hero__stage">
                        <span className="profile-hero__halo" aria-hidden="true" />
                        <img
                            src={activeVisualUrl}
                            alt={`Versione attiva di ${creature.name ?? 'Creatura iniziale'}`}
                            onError={(event) => fallbackToDefaultCreatureImage(event.currentTarget)}
                        />
                    </figure>
                    <div className="profile-hero__copy">
                        <span className="ev-eyebrow">Creatura attuale</span>
                        <h2>{creature.name ?? 'Creatura iniziale'}</h2>
                        <div className="profile-hero__chips">
                            <Chip tone="good" icon={<SparkIcon />}>Livello {creature.level}</Chip>
                            <Chip tone="info">Rating {RATING_FORMATTER.format(profile.skill_rating)}</Chip>
                            <Chip tone="info" icon={<DnaIcon />}>
                                {`v${visualVersionNumber ?? 1} · ${visualTrait ?? 'Forma base'}`}
                            </Chip>
                        </div>
                        <div className="profile-hero__xp">
                            <ProgressBar current={experience.current} total={experience.required} label={`Esperienza ${experience.current} su ${experience.required}`} />
                            <small>{experience.current} / {experience.required} XP</small>
                        </div>
                    </div>
                </Panel>

                <Panel className="profile-stats" flat compact aria-label="Statistiche della creatura">
                    <StatTile label="Partite" value={stats.played} />
                    <StatTile label="Vittorie" value={stats.wins} tone="good" />
                    <StatTile label="Pareggi" value={stats.draws} tone="info" />
                    <StatTile label="Sconfitte" value={stats.losses} tone="bad" />
                    <StatTile label="Win rate" value={`${winRate}%`} emphasized />
                </Panel>

                <Panel className="profile-mutations" compact>
                    <span className="ev-eyebrow">Mutazioni di combattimento</span>
                    <div className="profile-mutations__slots">
                        {[0, 1].map((slot) => {
                            const mutation = combatMutationLoadout[slot]!
                            return (
                                <Button key={slot} className="profile-mutation__slot" tone="cream" block size="sm" disabled={!onSetCombatMutationLoadout || isUpdatingMutation} onClick={() => { setMutationError(null); setOpenMutationSlot(slot as 0 | 1) }}>
                                    <DnaIcon className="profile-mutation__icon" aria-hidden="true" />
                                    <span className="profile-mutation__copy">
                                        <span>Slot {slot + 1}:</span>
                                        <strong>{COMBAT_MUTATION_CATALOG[mutation].label}</strong>
                                    </span>
                                    <ChevronIcon aria-hidden="true" />
                                </Button>
                            )
                        })}
                    </div>
                    <small className="profile-mutations__hint">Le modifiche vengono salvate subito e valgono per le prossime partite.</small>
                    {mutationError ? <Notice tone="error">{mutationError}</Notice> : null}
                </Panel>

                {onOpenEvolution || onOpenBackgroundCleanup ? (
                    <div className="profile-actions">
                        {onOpenEvolution ? (
                            <Button tone="evolve" block onClick={onOpenEvolution}>
                                <DnaIcon aria-hidden="true" />
                                Evolvi creatura
                            </Button>
                        ) : null}
                        {onOpenBackgroundCleanup ? <Button className="profile-actions__cleanup" tone="cream" size="sm" onClick={onOpenBackgroundCleanup}>Ripulisci visuali</Button> : null}
                    </div>
                ) : null}

                {openMutationSlot !== null ? (
                    <Overlay label={`Scegli mutazione per slot ${openMutationSlot + 1}`} onClose={isUpdatingMutation ? undefined : () => setOpenMutationSlot(null)}>
                        <Panel className="ev-stack">
                            <span className="ev-eyebrow">Scegli una mutazione</span>
                            {Object.values(COMBAT_MUTATION_CATALOG).map((mutation) => {
                                const selectedElsewhere = combatMutationLoadout[1 - openMutationSlot] === mutation.id
                                return <Button key={mutation.id} tone="cream" block disabled={isUpdatingMutation || selectedElsewhere} onClick={() => void selectCombatMutation(mutation.id)}>{mutation.label}: {mutation.description}</Button>
                            })}
                        </Panel>
                    </Overlay>
                ) : null}

                <SectionLabel className="profile-history-label">Ultime partite</SectionLabel>
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
