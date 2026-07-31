import { CreatureArt } from './CreatureArt'
import type { HomeViewModel } from './types'

type HomeCreatureStageProps = {
    creature: HomeViewModel['creature']
    shortcuts: HomeViewModel['shortcuts']
}

export function HomeCreatureStage({ creature, shortcuts }: HomeCreatureStageProps) {
    if (!creature) {
        return null
    }

    return (
        <section className="home-creature-stage" aria-label="La tua creatura" data-testid="home-creature-stage">
            <div className="home-creature-stage__shade" aria-hidden="true" />
            <CreatureArt image={creature.image} className="home-creature-stage__creature" />

            <div className="home-creature-stage__summary">
                <span>La tua creatura</span>
                <strong>{creature.name}</strong>
                {creature.level ? <small>Livello {creature.level}</small> : null}
                {creature.evolution ? <small>{creature.evolution.label ?? `Evoluzione ${creature.evolution.current}/${creature.evolution.total}`}</small> : null}
            </div>

            {shortcuts.length ? (
                <nav className="home-creature-stage__shortcuts" aria-label="Accessi rapidi creatura">
                    {shortcuts.map((shortcut) => (
                        <button key={shortcut.id} type="button" disabled={!shortcut.available}>
                            {shortcut.label}{shortcut.badge ? ` (${shortcut.badge})` : ''}
                        </button>
                    ))}
                </nav>
            ) : null}
        </section>
    )
}
