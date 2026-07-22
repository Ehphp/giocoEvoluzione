import type { HabitatZone } from '../../game/ui-context'

type HabitatMiniMapProps = {
    zones: HabitatZone[]
}

export function HabitatMiniMap({ zones }: HabitatMiniMapProps) {
    return (
        <section className="habitat-mini-map" aria-label="Mappa competitiva habitat">
            <header className="habitat-mini-map__header">
                <strong>Mappa habitat</strong>
                <span>Schema UI semplificato</span>
            </header>

            <div className="habitat-mini-map__grid">
                {zones.map((zone) => (
                    <article key={zone.id} className={`habitat-zone habitat-zone--${zone.control}`}>
                        <span>{zone.label}</span>
                    </article>
                ))}
            </div>

            <div className="habitat-mini-map__legend">
                <span className="habitat-dot habitat-dot--player">Tu</span>
                <span className="habitat-dot habitat-dot--opponent">Avversario</span>
                <span className="habitat-dot habitat-dot--neutral">Neutrale</span>
                <span className="habitat-dot habitat-dot--hazard">Pericolo</span>
            </div>
        </section>
    )
}
