import { useEffect, useState, type CSSProperties } from 'react'

import type { HomeCreatureImage } from './types'

type CreatureArtProps = {
    image: HomeCreatureImage
    className?: string
}

export function CreatureArt({ image, className }: CreatureArtProps) {
    const [source, setSource] = useState(image.src)
    const [hasFailed, setHasFailed] = useState(false)

    useEffect(() => {
        setSource(image.src)
        setHasFailed(false)
    }, [image.src])

    const style = {
        '--home-creature-scale': image.scale ?? 1,
        '--home-creature-offset-x': `${image.offsetX ?? 0}%`,
        '--home-creature-offset-y': `${image.offsetY ?? 0}%`,
    } as CSSProperties

    function handleImageError() {
        if (source !== image.fallbackSrc) {
            setSource(image.fallbackSrc)
            return
        }

        setHasFailed(true)
    }

    if (hasFailed) {
        return <div className={className} role="img" aria-label={image.alt}>Creatura non disponibile</div>
    }

    return <img className={className} src={source} alt={image.alt} style={style} onError={handleImageError} />
}
