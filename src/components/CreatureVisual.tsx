import { useEffect, useMemo, useRef, useState } from 'react'

import { CREATURE_ASSETS, TRAIT_LABELS, getDominantTrait, type DominantTrait } from '../game/config'
import type { TraitCollection, TraitType } from '../game/types'

type PlayerTraits = TraitCollection

type CreatureVisualProps = {
    traits: PlayerTraits
    playerName?: string
    previousDominantTrait?: TraitType | 'BASE'
    className?: string
    showCaption?: boolean
}

export function CreatureVisual({ traits, playerName, previousDominantTrait, className, showCaption = true }: CreatureVisualProps) {
    const [imageFailed, setImageFailed] = useState(false)
    const [isChanging, setIsChanging] = useState(false)
    const lastDominantTraitRef = useRef<DominantTrait | undefined>(undefined)
    const hasMountedRef = useRef(false)

    const stablePreviousDominantTrait = previousDominantTrait ?? lastDominantTraitRef.current
    const dominantTrait = useMemo(() => getDominantTrait(traits, stablePreviousDominantTrait), [stablePreviousDominantTrait, traits])
    const creatureAsset = CREATURE_ASSETS[dominantTrait]
    const dominantTraitLabel = dominantTrait === 'BASE' ? 'Forma base' : TRAIT_LABELS[dominantTrait]
    const fallbackText = dominantTrait === 'BASE' ? 'Forma base' : `Specializzazione dominante: ${dominantTraitLabel}`
    const ariaLabel = playerName ? `${playerName}: ${fallbackText}` : fallbackText

    useEffect(() => {
        setImageFailed(false)
    }, [creatureAsset])

    useEffect(() => {
        const previousTrait = lastDominantTraitRef.current
        lastDominantTraitRef.current = dominantTrait

        if (!hasMountedRef.current) {
            hasMountedRef.current = true

            return
        }

        if (previousTrait && previousTrait !== dominantTrait) {
            setIsChanging(true)

            const timeoutId = window.setTimeout(() => setIsChanging(false), 280)

            return () => window.clearTimeout(timeoutId)
        }
    }, [dominantTrait])

    function handleImageError() {
        if (import.meta.env.DEV) {
            console.warn(`Creature asset non disponibile: ${creatureAsset}`)
        }

        setImageFailed(true)
    }

    return (
        <div className={className ? `creature-visual ${className}` : 'creature-visual'} aria-label={ariaLabel}>
            <div className="creature-stage creature-visual__stage">
                {!imageFailed ? (
                    <img
                        key={creatureAsset}
                        src={creatureAsset}
                        alt={ariaLabel}
                        className={`creature-visual__image${isChanging ? ' is-changing' : ''}`}
                        onError={handleImageError}
                    />
                ) : (
                    <div className="creature-visual__fallback">
                        <strong>{playerName ?? 'Creatura'}</strong>
                        <span>{fallbackText}</span>
                    </div>
                )}
            </div>

            {showCaption ? <p className="creature-caption">{fallbackText}</p> : null}
        </div>
    )
}