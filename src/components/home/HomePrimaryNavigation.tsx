import type { HomeViewModel } from './types'

type HomePrimaryNavigationProps = {
    navigation: HomeViewModel['navigation']
    onOpenPlayModes: () => void
    onOpenProfile: () => void
}

export function HomePrimaryNavigation({ navigation, onOpenPlayModes, onOpenProfile }: HomePrimaryNavigationProps) {
    const playItem = navigation.find((item) => item.id === 'play')
    const futureItems = navigation.filter((item) => item.id !== 'play')

    return (
        <nav className="home-primary-navigation" aria-label="Navigazione principale">
            {playItem ? (
                <button type="button" className="home-primary-navigation__play" onClick={onOpenPlayModes}>
                    <span>{playItem.label}</span>
                    <small>Crea una partita, sfida il bot o inserisci un codice</small>
                </button>
            ) : null}
            <div className="home-primary-navigation__future" aria-label="Sezioni future">
                {futureItems.map((item) => (
                    <button key={item.id} type="button" disabled={!item.available} aria-disabled={!item.available} onClick={item.id === 'profile' ? onOpenProfile : undefined}>
                        {item.label}
                    </button>
                ))}
            </div>
        </nav>
    )
}
