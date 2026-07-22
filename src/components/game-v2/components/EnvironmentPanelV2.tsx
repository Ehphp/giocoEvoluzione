import type { EnvironmentV2 } from '../types'

type EnvironmentPanelV2Props = {
    environment: EnvironmentV2
}

export function EnvironmentPanelV2({ environment }: EnvironmentPanelV2Props) {
    return (
        <section className="gene-v2-environment" aria-label="Ambiente del round">
            <div className="gene-v2-environment-art" role="img" aria-label={`Ambiente ${environment.name}`}>
                <img src={environment.imageUrl} alt="" loading="lazy" onError={(event) => {
                    event.currentTarget.style.display = 'none'
                }} />
                <span>{environment.name.slice(0, 3).toUpperCase()}</span>
            </div>

            <div className="gene-v2-environment-copy">
                <span className="gene-v2-eyebrow">Ambiente</span>
                <strong>{environment.name}</strong>
                <p>{environment.description}</p>
                <div className="gene-v2-modifiers" aria-label="Modificatori ambiente">
                    {environment.modifiers.map((modifier) => (
                        <span key={modifier.id} className={`gene-v2-modifier is-${modifier.tone}`}>
                            <small>{modifier.label}</small>
                            <strong>{modifier.value}</strong>
                        </span>
                    ))}
                </div>
            </div>
        </section>
    )
}
