import type { HomeViewModel } from './types'

type HomeTopBarProps = {
    player: HomeViewModel['player']
    isOnline: boolean
}

export function HomeTopBar({ player, isOnline }: HomeTopBarProps) {
    const displayName = player.displayName ?? 'Allenatore locale'
    const initial = displayName.slice(0, 1).toUpperCase()

    return (
        <header className="home-topbar">
            <div className="home-profile-summary">
                {player.avatarUrl ? (
                    <img className="home-profile-summary__avatar" src={player.avatarUrl} alt="" />
                ) : (
                    <span className="home-profile-summary__avatar home-profile-summary__avatar--fallback" aria-hidden="true">{initial}</span>
                )}
                <div>
                    <span className="home-profile-summary__eyebrow">{player.rankLabel ?? 'Ospite locale'}</span>
                    <strong>{displayName}</strong>
                </div>
            </div>
            <span className={`home-topbar__connection${isOnline ? ' is-online' : ' is-offline'}`}>
                {isOnline ? 'Online' : 'Offline'}
            </span>
        </header>
    )
}
