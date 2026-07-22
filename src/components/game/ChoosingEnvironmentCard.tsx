import { TRAIT_CATALOG } from '../../game/traits-catalog'
import type { Environment, TraitType } from '../../game/types'

type ChoosingEnvironmentCardProps = {
    environment: Environment | null
    biomeLabel: string
    description: string
}

type ModifierBadge = {
    trait: TraitType
    label: string
    value: number
}

const ENVIRONMENT_CODES: Record<Environment, string> = {
    FOREST: 'FOR',
    MOUNTAIN: 'MNT',
    SWAMP: 'SWP',
}

function getModifierBadges(environment: Environment | null): ModifierBadge[] {
    if (!environment) {
        return []
    }

    return (Object.values(TRAIT_CATALOG) as Array<(typeof TRAIT_CATALOG)[TraitType]>)
        .map((entry) => ({
            trait: entry.id,
            label: entry.label,
            value: entry.modifiers[environment],
        }))
        .sort((a, b) => b.value - a.value || TRAIT_CATALOG[a.trait].displayOrder - TRAIT_CATALOG[b.trait].displayOrder)
        .slice(0, 3)
}

export function ChoosingEnvironmentCard({ environment, biomeLabel, description }: ChoosingEnvironmentCardProps) {
    const modifierBadges = getModifierBadges(environment)
    const environmentCode = environment ? ENVIRONMENT_CODES[environment] : 'BIO'

    return (
        <section className="environment-duel-card" aria-label="Ambiente corrente">
            <div className={`environment-duel-card__art ${environment ? `environment-duel-card__art--${environment.toLowerCase()}` : ''}`} aria-hidden="true">
                <span>{environmentCode}</span>
            </div>

            <div className="environment-duel-card__copy">
                <span className="environment-duel-card__eyebrow">Ambiente</span>
                <strong>{biomeLabel}</strong>
                <p>{description}</p>

                <div className="environment-duel-card__badges" aria-label="Modificatori ambientali chiave">
                    {modifierBadges.map((badge) => (
                        <span key={badge.trait} className="environment-duel-card__badge">
                            <span>{badge.label}</span>
                            <strong>+{badge.value}/3</strong>
                        </span>
                    ))}
                </div>
            </div>
        </section>
    )
}