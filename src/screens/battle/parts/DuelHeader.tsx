import { Avatar, Button, IconButton, Pips, PopoverMenu } from '../../../ui/components'
import { BackIcon, BoltIcon, EyeIcon, MeteorIcon, ShieldCheckIcon, SparkIcon, TrophyIcon } from '../../../ui/icons'
import type { CombatMutationSlotV2, DuelPlayerV2, RoundInfoV2 } from '../controller/types'

type DuelHeaderProps = {
    player: DuelPlayerV2
    opponent: DuelPlayerV2
    round: RoundInfoV2
    onRequestLeave: () => void
    onActivateSymbiosis?: () => void
    onActivateFineDelMondo?: () => void
}

function statusLabel(status: DuelPlayerV2['status']): string {
    if (status === 'ready') {
        return 'Scelta inviata'
    }

    if (status === 'disconnected') {
        return 'Disconnesso'
    }

    return 'Sta scegliendo'
}

function mutationStatusLabel(status: CombatMutationSlotV2['status']): string {
    if (status === 'armed') {
        return 'attiva'
    }

    if (status === 'consumed') {
        return 'consumata'
    }

    if (status === 'linked') return 'collegata'

    return 'disponibile'
}

function MutationIcon({ iconKey }: { iconKey: CombatMutationSlotV2['iconKey'] }) {
    switch (iconKey) {
        case 'elastic-limbs':
            return <BoltIcon />
        case 'adaptive-core':
            return <EyeIcon />
        case 'armored-memory':
            return <ShieldCheckIcon />
        case 'fine-del-mondo':
            return <MeteorIcon />
        default:
            return <SparkIcon />
    }
}

function MutationSlots({ mutations, side, onActivateSymbiosis, onActivateFineDelMondo }: { mutations: CombatMutationSlotV2[]; side: 'player' | 'opponent'; onActivateSymbiosis?: () => void; onActivateFineDelMondo?: () => void }) {
    if (!mutations.length) {
        return null
    }

    return (
        <div className={`duel-card__mutations duel-card__mutations--${side}`} role="list" aria-label={`Mutazioni ${side === 'player' ? 'del giocatore' : 'dell avversario'}`}>
            {mutations.map((mutation) => {
                const stateLabel = mutationStatusLabel(mutation.status)

                const label = `${mutation.label}, ${stateLabel}. ${mutation.shortDescription}${mutation.linkLabel ? ` ${mutation.linkLabel}.` : ''}`
                const activate = mutation.id === 'SYMBIOSIS' ? onActivateSymbiosis : mutation.id === 'FINE_DEL_MONDO' ? onActivateFineDelMondo : undefined
                const canActivate = side === 'player' && mutation.status === 'available' && activate
                return (
                    <span key={mutation.id} className="duel-mutation-wrap" role="listitem">
                        {canActivate ? (
                            <IconButton label={`Attiva ${mutation.label}`} className={`duel-mutation duel-mutation--${mutation.status}`} onClick={activate}>
                                <MutationIcon iconKey={mutation.iconKey} />
                            </IconButton>
                        ) : (
                            <span className={`duel-mutation duel-mutation--${mutation.status}`} title={label} aria-label={label}>
                                <MutationIcon iconKey={mutation.iconKey} />
                            </span>
                        )}
                        {mutation.linkLabel ? <small className="duel-mutation__link" title={mutation.linkLabel}>{mutation.linkLabel}</small> : null}
                    </span>
                )
            })}
        </div>
    )
}

function PlayerProfileMenu({ player, status, onRequestLeave }: { player: DuelPlayerV2; status: DuelPlayerV2['status']; onRequestLeave: () => void }) {
    return (
        <PopoverMenu
            className="duel-card__profile-menu"
            triggerClassName="duel-card__profile-trigger"
            label={`Azioni di ${player.name}`}
            triggerLabel={`Apri azioni per ${player.name}`}
            trigger={
                <>
                    <Avatar name={player.name} src={player.creatureVisual?.src ?? player.avatarUrl} size={42} />
                    <span className={`duel-card__state duel-card__state--${status}`} title={statusLabel(status)} aria-hidden="true" />
                </>
            }
        >
            {(close) => (
                <Button
                    tone="ghost"
                    size="sm"
                    role="menuitem"
                    onClick={() => {
                        close()
                        onRequestLeave()
                    }}
                >
                    <BackIcon aria-hidden="true" />
                    Esci dalla partita
                </Button>
            )}
        </PopoverMenu>
    )
}

function DuelCard({ player, role, side, round, onRequestLeave }: { player: DuelPlayerV2; role: string; side: 'player' | 'opponent'; round: RoundInfoV2; onRequestLeave?: () => void }) {
    return (
        <article
            className={`duel-card duel-card--${side}`}
            aria-label={`${role}: ${player.name}, ${player.score} round vinti su ${round.total}${player.roundValueTotal === null ? '' : `, valore totale ${player.roundValueTotal}`}, ${statusLabel(player.status).toLowerCase()}`}
        >
            {side === 'player' && onRequestLeave ? (
                <PlayerProfileMenu player={player} status={player.status} onRequestLeave={onRequestLeave} />
            ) : (
                <span className="duel-card__portrait">
                    <Avatar name={player.name} src={player.creatureVisual?.src ?? player.avatarUrl} size={42} />
                    <span className={`duel-card__state duel-card__state--${player.status}`} title={statusLabel(player.status)} aria-hidden="true" />
                </span>
            )}
            <div className="duel-card__copy">
                <strong className="duel-card__name ev-truncate" title={player.name}>{player.name}</strong>
                <span className="duel-card__score">
                    <TrophyIcon aria-hidden="true" />
                    <b>{player.score}</b>
                    {player.roundValueTotal !== null ? (
                        <small className="duel-card__tiebreak" title="Valore totale dei round, usato per il tiebreak">TB {player.roundValueTotal}</small>
                    ) : null}
                </span>
                <Pips
                    total={round.total}
                    filled={player.score}
                    color={side === 'player' ? 'var(--ev-player-light)' : 'var(--ev-opponent-light)'}
                    label={`${player.score} round vinti su ${round.total}`}
                    size="compact"
                />
            </div>
        </article>
    )
}

export function DuelHeader({ player, opponent, round, onRequestLeave, onActivateSymbiosis, onActivateFineDelMondo }: DuelHeaderProps) {
    return (
        <header className="duel-header" aria-label="Stato dello scontro">
            <div className="duel-header__competitor duel-header__competitor--player">
                <DuelCard player={player} role="Tu" side="player" round={round} onRequestLeave={onRequestLeave} />
                <MutationSlots mutations={player.combatMutations ?? []} side="player" onActivateSymbiosis={onActivateSymbiosis} onActivateFineDelMondo={onActivateFineDelMondo} />
            </div>
            {/*
              * VS and, under it, one dot per scheduled round lit as the match advances. Its own column
              * rather than an overlay: the dots are wider than the seam between the profiles, so
              * floating them there covered the players' names. No text, and no card of its own — the
              * pill this replaced cost 34px of a 664px screen.
              */}
            <div className="duel-header__match">
                <span className="duel-header__versus" aria-hidden="true">VS</span>
                <span className="duel-header__rounds">
                    <Pips
                        total={round.total}
                        filled={round.current}
                        size="compact"
                        label={`Round ${round.current} di ${round.total}`}
                    />
                </span>
            </div>
            <div className="duel-header__competitor duel-header__competitor--opponent">
                <DuelCard player={opponent} role="Avversario" side="opponent" round={round} />
                <MutationSlots mutations={opponent.combatMutations ?? []} side="opponent" />
            </div>
        </header>
    )
}
