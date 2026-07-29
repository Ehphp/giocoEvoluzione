import type { CSSProperties } from 'react'

import type { CreatureVisual } from '../gameSelectionAssets'

type BattleStageProps = {
    background: string
    playerCreature: CreatureVisual
    opponentCreature: CreatureVisual
}

function CreatureLayer({ visual, side }: { visual: CreatureVisual; side: 'player' | 'opponent' }) {
    const style = {
        '--battle-creature-scale': visual.scale ?? 1,
        '--battle-creature-height': `${145 * (visual.scale ?? 1)}%`,
        '--battle-creature-offset-x': `${visual.offsetX ?? 0}%`,
        '--battle-creature-offset-y': `${visual.offsetY ?? 0}%`,
    } as CSSProperties

    return (
        <div className={`battle-stage__creature battle-stage__creature--${side}`} style={style}>
            <span className="battle-stage__ground-shadow" aria-hidden="true" />
            <img src={visual.src} alt={visual.alt} />
        </div>
    )
}

export function BattleStage({ background, playerCreature, opponentCreature }: BattleStageProps) {
    return (
        <section className="battle-stage" aria-label="Scena di battaglia">
            <img className="battle-stage__background" src={background} alt="" />
            <div className="battle-stage__atmosphere" aria-hidden="true" />
            <CreatureLayer visual={playerCreature} side="player" />
            <div className="battle-stage__versus" aria-label="contro">VS</div>
            <CreatureLayer visual={opponentCreature} side="opponent" />
            <div className="battle-stage__foreground" aria-hidden="true" />
        </section>
    )
}
