import { TRAIT_LABELS } from '../../../game/config'
import { NATURAL_ADVANTAGE } from '../../../../shared/game-rules/catalog.ts'
import type { GeneCardV2 } from '../types'

type NaturalAdvantageV2Props = {
    selectedGene: GeneCardV2 | null
}

export function NaturalAdvantageV2({ selectedGene }: NaturalAdvantageV2Props) {
    if (!selectedGene) {
        return null
    }

    const strongAgainst = NATURAL_ADVANTAGE[selectedGene.traitType]
    const fearedBy = (Object.keys(NATURAL_ADVANTAGE) as Array<keyof typeof NATURAL_ADVANTAGE>)
        .find((trait) => NATURAL_ADVANTAGE[trait] === selectedGene.traitType)

    if (!strongAgainst || !fearedBy) {
        return null
    }

    return (
        <section className="natural-advantage-v2" aria-label={`Vantaggio naturale di ${selectedGene.name}`}>
            <div className="natural-advantage-v2__title">
                <span aria-hidden="true" />
                <strong>VANTAGGIO NATURALE</strong>
                <span aria-hidden="true" />
            </div>
            <div className="natural-advantage-v2__row natural-advantage-v2__row--strong">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20.5 3.5C13.3 3.2 7.7 5.3 5 10.1c-1.6 2.8-1.4 6.1-1.3 7.4 1.7.3 5.2.4 8.1-1.2 4.6-2.5 6.8-7.7 8.7-12.8ZM5.8 17.2c2.8-4.6 6.7-7.5 11.7-9.3" />
                </svg>
                <span>Forte contro: <b>{TRAIT_LABELS[strongAgainst]} +1</b></span>
            </div>
            <div className="natural-advantage-v2__row natural-advantage-v2__row--weak">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3.2 20 6.4v5.2c0 4.7-3.1 7.7-8 9.2-4.9-1.5-8-4.5-8-9.2V6.4l8-3.2Zm0 4.1-3.5 1.4v2.6c0 2.1 1.2 3.8 3.5 4.8 2.3-1 3.5-2.7 3.5-4.8V8.7L12 7.3Z" />
                </svg>
                <span>Teme: <b>{TRAIT_LABELS[fearedBy]}</b></span>
            </div>
            <p>Si attiva solo se entrambi usano</p>
        </section>
    )
}
