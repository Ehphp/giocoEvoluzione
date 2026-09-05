import { useEffect, useState, type CSSProperties } from 'react'

import { BoltIcon, DnaIcon } from '../../../ui/icons'
import {
    DEFAULT_BATTLE_OPPONENT_CREATURE,
    DEFAULT_BATTLE_PLAYER_CREATURE,
    type CreatureVisual,
} from '../controller/gene-selection-assets'
import { shouldMirrorCreature, type CreatureFacing } from '../controller/creature-orientation'
import type { BattleDropTarget } from './use-battle-gene-interaction'
import { useCreatureBattleFraming } from './use-creature-battle-framing'

type BattleArenaProps = {
    playerCreature: CreatureVisual | null
    opponentCreature: CreatureVisual | null
    isGeneDragging: boolean
    activeDropTarget: BattleDropTarget | null
    canDropOnPlayer: boolean
    canDropOnOpponent: boolean
    registerDropZone: (target: BattleDropTarget, element: HTMLDivElement | null) => void
}

type BattleSide = 'player' | 'opponent'

function CreatureLayer({ visual, side }: { visual: CreatureVisual; side: BattleSide }) {
    const [source, setSource] = useState(visual.src)
    const [usesFallback, setUsesFallback] = useState(false)
    const { imageRef, metrics, onImageLoad, subject } = useCreatureBattleFraming({
        src: source,
        heightMeters: visual.heightMeters,
    })

    useEffect(() => {
        setSource(visual.src)
        setUsesFallback(false)
    }, [visual.src])

    const facing: CreatureFacing = side === 'player' ? 'right' : 'left'
    const fallbackVisual = side === 'player' ? DEFAULT_BATTLE_PLAYER_CREATURE : DEFAULT_BATTLE_OPPONENT_CREATURE
    const isMirrored = shouldMirrorCreature(usesFallback ? fallbackVisual.nativeFacing : visual.nativeFacing, facing)
    const style = {
        '--arena-framing-normalization': metrics.framingNormalization,
        '--arena-biological-scale': metrics.biologicalScale,
        '--arena-render-scale': metrics.renderScale,
        '--arena-ground-offset': `${metrics.groundOffsetPixels}px`,
        '--arena-creature-offset-x': `${visual.offsetX ?? 0}%`,
        '--arena-creature-offset-y': `${visual.offsetY ?? 0}%`,
    } as CSSProperties

    return (
        <div
            className={`arena__creature arena__creature--${side}`}
            style={style}
            data-facing={facing}
            data-framing-normalization={metrics.framingNormalization.toFixed(3)}
            data-biological-scale={metrics.biologicalScale.toFixed(3)}
            data-render-scale={metrics.renderScale.toFixed(3)}
            data-subject-height-ratio={subject?.heightRatio.toFixed(3)}
            data-visible-height-px={metrics.visibleHeightPixels?.toFixed(1)}
        >
            <span className="arena__shadow" aria-hidden="true" />
            <img
                className={`arena__sprite ${isMirrored ? 'is-mirrored' : ''}`}
                ref={imageRef}
                src={source}
                alt={visual.alt}
                onLoad={onImageLoad}
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
export function BattleArena({ playerCreature, opponentCreature, isGeneDragging, activeDropTarget, canDropOnPlayer, canDropOnOpponent, registerDropZone }: BattleArenaProps) {
    return (
        <section className={`arena ${isGeneDragging ? 'is-gene-dragging' : ''}`} aria-label="Scena di battaglia">
            {playerCreature ? <CreatureLayer visual={playerCreature} side="player" /> : null}
            {opponentCreature ? <CreatureLayer visual={opponentCreature} side="opponent" /> : null}
            <div
                ref={(element) => registerDropZone('player', element)}
                className={`arena__drop-zone arena__drop-zone--player ${activeDropTarget === 'player' ? 'is-active' : ''}`}
                data-drop-state={canDropOnPlayer ? 'valid' : 'disabled'}
                aria-hidden="true"
            >
                <span className="arena__drop-label"><DnaIcon /> EVOLVI</span>
            </div>
            <div
                ref={(element) => registerDropZone('opponent', element)}
                className={`arena__drop-zone arena__drop-zone--opponent ${activeDropTarget === 'opponent' ? 'is-active' : ''}`}
                data-drop-state={canDropOnOpponent ? 'valid' : 'disabled'}
                aria-hidden="true"
            >
                <span className="arena__drop-label"><BoltIcon /> USA</span>
            </div>
        </section>
    )
}
