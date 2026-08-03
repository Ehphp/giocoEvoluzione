import { useEffect, useState, type CSSProperties } from 'react'

import type { CreatureVisual } from '../gameSelectionAssets'
import { shouldMirrorCreature, type CreatureFacing } from './creatureOrientation'

type BattleStageProps = {
    playerCreature: CreatureVisual
    opponentCreature: CreatureVisual
}

type BattleSide = 'player' | 'opponent'

function CreatureLayer({ visual, side }: { visual: CreatureVisual; side: BattleSide }) {
    const [source, setSource] = useState(visual.src)
    useEffect(() => setSource(visual.src), [visual.src])
    const facing: CreatureFacing = side === 'player' ? 'right' : 'left'
    const isMirrored = shouldMirrorCreature(visual.nativeFacing, facing)
    const style = {
        '--battle-creature-scale': visual.scale ?? 1,
        '--battle-creature-height': `${145 * (visual.scale ?? 1)}%`,
        '--battle-creature-offset-x': `${visual.offsetX ?? 0}%`,
        '--battle-creature-offset-y': `${visual.offsetY ?? 0}%`,
    } as CSSProperties

    return (
        <div className={`battle-stage__creature battle-stage__creature--${side}`} style={style} data-facing={facing}>
            <span className="battle-stage__ground-shadow" aria-hidden="true" />
            <img
                className={`battle-stage__sprite ${isMirrored ? 'is-mirrored' : ''}`}
                src={source}
                alt={visual.alt}
                onError={() => setSource(side === 'player' ? '/assets/battle/creatures/verdant-hatchling.png' : '/assets/battle/creatures/amethyst-hatchling.png')}
            />
        </div>
    )
}

export function BattleStage({ playerCreature, opponentCreature }: BattleStageProps) {
    return (
        <section className="battle-stage" aria-label="Scena di battaglia">
            <div className="battle-stage__atmosphere" aria-hidden="true" />
            <CreatureLayer visual={playerCreature} side="player" />
            <CreatureLayer visual={opponentCreature} side="opponent" />
            <img className="battle-stage__versus" src="/assets/game-ui/battle-versus.png" alt="" aria-hidden="true" />
            <div className="battle-stage__foreground" aria-hidden="true" />
        </section>
    )
}
