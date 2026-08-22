import { useEffect, useState, type CSSProperties } from 'react'

import {
    DEFAULT_BATTLE_OPPONENT_CREATURE,
    DEFAULT_BATTLE_PLAYER_CREATURE,
    type CreatureVisual,
} from '../controller/gene-selection-assets'
import { shouldMirrorCreature, type CreatureFacing } from '../controller/creature-orientation'

type BattleArenaProps = {
    playerCreature: CreatureVisual | null
    opponentCreature: CreatureVisual | null
}

type BattleSide = 'player' | 'opponent'

function CreatureLayer({ visual, side }: { visual: CreatureVisual; side: BattleSide }) {
    const [source, setSource] = useState(visual.src)
    const [usesFallback, setUsesFallback] = useState(false)

    useEffect(() => {
        setSource(visual.src)
        setUsesFallback(false)
    }, [visual.src])

    const facing: CreatureFacing = side === 'player' ? 'right' : 'left'
    const fallbackVisual = side === 'player' ? DEFAULT_BATTLE_PLAYER_CREATURE : DEFAULT_BATTLE_OPPONENT_CREATURE
    const isMirrored = shouldMirrorCreature(usesFallback ? fallbackVisual.nativeFacing : visual.nativeFacing, facing)
    const style = {
        '--arena-creature-scale': visual.scale ?? 1,
        '--arena-creature-offset-x': `${visual.offsetX ?? 0}%`,
        '--arena-creature-offset-y': `${visual.offsetY ?? 0}%`,
    } as CSSProperties

    return (
        <div className={`arena__creature arena__creature--${side}`} style={style} data-facing={facing}>
            <span className="arena__shadow" aria-hidden="true" />
            <img
                className={`arena__sprite ${isMirrored ? 'is-mirrored' : ''}`}
                src={source}
                alt={visual.alt}
                onError={() => {
                    if (source !== fallbackVisual.src) {
                        setSource(fallbackVisual.src)
                        setUsesFallback(true)
                    }
                }}
            />
        </div>
    )
}

/*
 * No VS emblem between the creatures: it sat on the centre line and made the two halves read as
 * unequal. The header already says who is facing whom, and each creature now owns exactly half
 * the arena, which reads as a fair split on its own.
 */
export function BattleArena({ playerCreature, opponentCreature }: BattleArenaProps) {
    return (
        <section className="arena" aria-label="Scena di battaglia">
            {playerCreature ? <CreatureLayer visual={playerCreature} side="player" /> : null}
            {opponentCreature ? <CreatureLayer visual={opponentCreature} side="opponent" /> : null}
        </section>
    )
}
