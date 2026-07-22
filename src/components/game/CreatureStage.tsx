import { CreatureVisual } from '../CreatureVisual'
import type { TraitCollection } from '../../game/types'

type CreatureStageProps = {
    playerName: string
    traits: TraitCollection
    currentEnvironment: string
    dominantTraitLabel: string
    dominantTraitLevel: number
    opponentName: string
    opponentAvatarSrc: string
    environmentEffectClass: string
}

export function CreatureStage({
    playerName,
    traits,
    currentEnvironment,
    dominantTraitLabel,
    dominantTraitLevel,
    opponentName,
    opponentAvatarSrc,
    environmentEffectClass,
}: CreatureStageProps) {
    return (
        <section className={`game-creature-stage ${environmentEffectClass}`}>
            <div className="game-creature-stage__meta">
                <span className="game-pill game-pill--environment">{currentEnvironment}</span>
                <span className="game-pill">{dominantTraitLabel}</span>
                <span className="game-pill game-pill--level">Lv {dominantTraitLevel}</span>
            </div>

            <div className="game-creature-stage__visual-wrap">
                <CreatureVisual traits={traits} playerName={playerName} className="game-creature-stage__visual" showCaption={false} />

                <aside className="game-creature-stage__opponent-presence" aria-label="Presenza avversario nello stesso ecosistema">
                    <div className="game-creature-stage__opponent-avatar-wrap">
                        <img src={opponentAvatarSrc} alt={`Creatura avversaria ${opponentName}`} className="game-creature-stage__opponent-avatar" />
                    </div>
                    <strong>{opponentName}</strong>
                </aside>
            </div>
        </section>
    )
}