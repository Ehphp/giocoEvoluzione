import { Badge } from './components'
import { playCue } from './feedback/feedback'
import { BattleIcon, CollectionIcon, CreatureIcon, LockIcon, RankingIcon, ShopIcon } from './icons'

/**
 * Primary destination bar.
 *
 * The five slots mirror the product concept; the three shipped surfaces (play, profile) are
 * live and the rest render locked until their capability is enabled, so no layout changes
 * are needed when they ship.
 *
 * Icons only. The labels repeated what five unmistakable glyphs already said and cost the dock a
 * whole line of height; they live on as the accessible name of each button, which is where a
 * screen reader looks for them anyway.
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
    { id: 'profile', label: 'Creatura', icon: <CreatureIcon /> },
]

type DockProps = {
    /** The slot to light up, or `null` on a screen that is inside something rather than one of them. */
    active: DockTab | null
    capabilities: DockCapabilities
    onNavigate: (tab: DockTab) => void
    badges?: Partial<Record<DockTab, number>>
    /** Locks every destination except the active one, e.g. while a match is running. */
    locked?: boolean
}

export function Dock({ active, capabilities, onNavigate, badges, locked = false }: DockProps) {
    const activeIndex = active === null ? -1 : DOCK_ITEMS.findIndex((item) => item.id === active)

    return (
        <nav className="ev-dock" aria-label="Navigazione principale">
            <div
                className="ev-dock__bar"
                /* The pill is placed in CSS from these two: which slot it sits on, out of how many. */
                style={{
                    ['--ev-dock-slots' as string]: DOCK_ITEMS.length,
                    ['--ev-dock-active' as string]: Math.max(0, activeIndex),
                }}
            >
                {/* No pill where nothing is current: there is no slot for it to sit on. */}
                {activeIndex >= 0 ? <span className="ev-dock__pill" aria-hidden="true" /> : null}
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
                            onClick={() => {
                                playCue('tap')
                                onNavigate(item.id)
                            }}
                        >
                            <span className="ev-dock__icon" aria-hidden="true">{item.icon}</span>
                            {badge ? <Badge className="ev-dock__badge">{badge}</Badge> : null}
                            {!isAvailable ? <span className="ev-dock__lock" aria-hidden="true"><LockIcon /></span> : null}
                        </button>
                    )
                })}
            </div>
        </nav>
    )
}
