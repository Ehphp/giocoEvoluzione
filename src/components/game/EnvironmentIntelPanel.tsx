import type { EnvironmentPressure, EnvironmentEventMock } from '../../game/ui-context'

type EnvironmentIntelPanelProps = {
    biomeName: string
    pressures: EnvironmentPressure[]
    favoredTraits: string[]
    penalizedTraits: string[]
    activeEvent: EnvironmentEventMock | null
}

export function EnvironmentIntelPanel({ biomeName, pressures, favoredTraits, penalizedTraits, activeEvent }: EnvironmentIntelPanelProps) {
    return (
        <section className="environment-intel" aria-label="Pressioni ambientali">
            <header className="environment-intel__header">
                <div>
                    <span className="environment-intel__eyebrow">Ecosistema condiviso</span>
                    <strong>{biomeName}</strong>
                </div>
                <span className="environment-intel__mock-tag">Dati bioma + stima UI</span>
            </header>

            <div className="environment-intel__pressures">
                {pressures.map((pressure) => (
                    <article key={pressure.id} className="environment-pressure">
                        <span>{pressure.label}</span>
                        <strong>{pressure.intensity}</strong>
                        <div className="environment-pressure__meter" aria-hidden="true">
                            <span style={{ width: `${Math.max(12, pressure.score * 25)}%` }} />
                        </div>
                    </article>
                ))}
            </div>

            <div className="environment-intel__traits">
                <div>
                    <span>Favoriti</span>
                    <p>{favoredTraits.join(' · ') || 'n/d'}</p>
                </div>
                <div>
                    <span>Penalizzati</span>
                    <p>{penalizedTraits.join(' · ') || 'n/d'}</p>
                </div>
            </div>

            {activeEvent ? (
                <div className={`environment-event environment-event--${activeEvent.kind}`}>
                    <strong>{activeEvent.title}</strong>
                    <span>{activeEvent.detail}</span>
                </div>
            ) : null}
        </section>
    )
}
