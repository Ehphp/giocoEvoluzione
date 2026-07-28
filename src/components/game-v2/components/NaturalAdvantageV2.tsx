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
            <div className="natural-advantage-v2__summary">
                <strong>{selectedGene.name}</strong>
                <span>{selectedGene.prediction?.useScore ?? 0} PT</span>
                <span>LV {selectedGene.level}</span>
            </div>
            <p className="natural-advantage-v2__matchup">
                <span className="natural-advantage-v2__strong">Forte contro <b>{TRAIT_LABELS[strongAgainst]} +1</b></span>
                <span className="natural-advantage-v2__weak">Teme <b>{TRAIT_LABELS[fearedBy]}</b></span>
                <small>Si attiva solo se entrambi usano</small>
            </p>
        </section>
    )
}
