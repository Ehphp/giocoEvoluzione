import { TRAIT_LABELS } from '../../../game/config'
import { NATURAL_ADVANTAGE, NATURAL_ADVANTAGE_BONUS } from '../../../../shared/game-rules/catalog.ts'
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
            <div className="natural-advantage-v2__heading">
                <span className="natural-advantage-v2__icon" aria-hidden="true">
                    {selectedGene.imageUrl ? <img src={selectedGene.imageUrl} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} /> : null}
                </span>
                <strong>Vantaggio naturale</strong>
                <span className="natural-advantage-v2__info" aria-hidden="true">i</span>
            </div>
            <div className="natural-advantage-v2__grid">
                <p className="natural-advantage-v2__fact natural-advantage-v2__fact--strong"><span aria-hidden="true">↗</span><small>Forte contro</small><b>{TRAIT_LABELS[strongAgainst]} +{NATURAL_ADVANTAGE_BONUS}</b></p>
                <p className="natural-advantage-v2__fact natural-advantage-v2__fact--weak"><span aria-hidden="true">↘</span><small>Teme</small><b>{TRAIT_LABELS[fearedBy]}</b></p>
                <p className="natural-advantage-v2__fact natural-advantage-v2__fact--condition"><span aria-hidden="true">★</span><small>Si attiva se</small><b>entrambi usano USA</b><em>contro {TRAIT_LABELS[strongAgainst]}</em></p>
            </div>
        </section>
    )
}
