import { useCallback, useEffect, useRef, useState } from 'react'

import { measureCreatureSubject, type CreatureSubject } from '../../../lib/creature-subject'
import {
    getCreatureBattleRenderMetrics,
    type CreatureBattleImageBox,
} from '../controller/creature-battle-framing'

function readImageBox(image: HTMLImageElement): CreatureBattleImageBox | null {
    if (!image.naturalWidth || !image.naturalHeight || !image.clientWidth || !image.clientHeight) {
        return null
    }

    return {
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        renderedWidth: image.clientWidth,
        renderedHeight: image.clientHeight,
    }
}

/** Measures foreground bounds once per source and follows layout changes without touching game data. */
export function useCreatureBattleFraming(input: { src: string; heightMeters: number }) {
    const imageRef = useRef<HTMLImageElement>(null)
    const [subject, setSubject] = useState<CreatureSubject | null>(null)
    const [imageBox, setImageBox] = useState<CreatureBattleImageBox | null>(null)

    const updateImageBox = useCallback(() => {
        const image = imageRef.current
        const next = image ? readImageBox(image) : null

        setImageBox((previous) => (
            previous?.naturalWidth === next?.naturalWidth
            && previous?.naturalHeight === next?.naturalHeight
            && previous?.renderedWidth === next?.renderedWidth
            && previous?.renderedHeight === next?.renderedHeight
                ? previous
                : next
        ))
    }, [])

    useEffect(() => {
        let active = true

        setSubject(null)
        void measureCreatureSubject(input.src).then((next) => {
            if (active) {
                setSubject(next)
            }
        })

        return () => {
            active = false
        }
    }, [input.src])

    useEffect(() => {
        const image = imageRef.current

        if (!image) {
            return undefined
        }

        updateImageBox()

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateImageBox)

            return () => {
                window.removeEventListener('resize', updateImageBox)
            }
        }

        const observer = new ResizeObserver(updateImageBox)
        observer.observe(image)

        return () => {
            observer.disconnect()
        }
    }, [input.src, updateImageBox])

    return {
        imageRef,
        onImageLoad: updateImageBox,
        subject,
        metrics: getCreatureBattleRenderMetrics({
            heightMeters: input.heightMeters,
            subject,
            imageBox,
        }),
    }
}
