import { Badge } from './components'
import { BattleIcon, CollectionIcon, LockIcon, ProfileIcon, RankingIcon, ShopIcon } from './icons'

/**
 * Primary destination bar.
 *
 * The five slots mirror the product concept; the three shipped surfaces (play, profile) are
 * live and the rest render locked until their capability is enabled, so no layout changes
 * are needed when they ship.
 */

export type DockTab = 'shop' | 'collection' | 'battle' | 'ranking' | 'profile'

export type DockCapabilities = {
    shop?: boolean
    collection?: boolean
    ranking?: boolean
    profile?: boolean
}

type DockItem = {
    id: DockTab
    label: string
    icon: React.JSX.Element
}

const DOCK_ITEMS: DockItem[] = [
    { id: 'shop', label: 'Negozio', icon: <ShopIcon /> },
    { id: 'collection', label: 'Collezione', icon: <CollectionIcon /> },
    { id: 'battle', label: 'Battaglia', icon: <BattleIcon /> },
    { id: 'ranking', label: 'Classifica', icon: <RankingIcon /> },
    { id: 'profile', label: 'Profilo', icon: <ProfileIcon /> },
]

type DockProps = {
    active: DockTab
    capabilities: DockCapabilities
    onNavigate: (tab: DockTab) => void
    badges?: Partial<Record<DockTab, number>>
    /** Locks every destination except the active one, e.g. while a match is running. */
    locked?: boolean
}

export function Dock({ active, capabilities, onNavigate, badges, locked = false }: DockProps) {
    return (
        <nav className="ev-dock" aria-label="Navigazione principale">
            <div className="ev-dock__bar">
                {DOCK_ITEMS.map((item) => {
                    const isActive = item.id === active
                    const isAvailable = item.id === 'battle' ? true : Boolean(capabilities[item.id])
                    const isDisabled = isActive || !isAvailable || locked
                    const badge = badges?.[item.id]

                    return (
                        <button
                            key={item.id}
                            type="button"
                            className={`ev-dock__item ${isActive ? 'is-active' : ''}`}
                            aria-current={isActive ? 'page' : undefined}
                            aria-label={isAvailable ? item.label : `${item.label} — disponibile presto`}
                            disabled={isDisabled}
                            onClick={() => onNavigate(item.id)}
                        >
                            <span className="ev-dock__icon" aria-hidden="true">{item.icon}</span>
                            <span>{item.label}</span>
                            {badge ? <Badge className="ev-dock__badge">{badge}</Badge> : null}
                            {!isAvailable ? <span className="ev-dock__lock" aria-hidden="true"><LockIcon /></span> : null}
                        </button>
                    )
                })}
            </div>
        </nav>
    )
}
