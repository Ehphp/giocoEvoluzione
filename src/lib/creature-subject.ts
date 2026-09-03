/**
 * Where a creature is actually drawn inside a transparent sprite.
 *
 * Generated display assets retain their canonical canvas, but not a canonical amount of empty
 * space around the animal. Measuring the alpha foreground once lets presentation layers size and
 * ground the creature rather than its transparent file box. A failed measurement is cached as
 * `null` and callers retain their safe, unadjusted layout.
 */

export type CreatureSubject = Readonly<{
    /** Opaque height as a fraction of the sprite height. */
    heightRatio: number
    /** Transparent space below the lowest opaque foreground pixel, as a fraction of sprite height. */
    bottomMarginRatio: number
    /** See the home-stage width constraint: the padded sprite box must still fit horizontally. */
    boxWidthPerHeight: number
    /** Centre of the opaque foreground, as fractions of sprite width and height. */
    centreX: number
    centreY: number
}>

const SAMPLE_EDGE = 192
const OPAQUE_ALPHA = 24

const cache = new Map<string, CreatureSubject | null>()

export async function measureCreatureSubject(src: string): Promise<CreatureSubject | null> {
    const cached = cache.get(src)

    if (cached !== undefined) {
        return cached
    }

    const subject = await readCreatureSubject(src)
    cache.set(src, subject)

    return subject
}

async function readCreatureSubject(src: string): Promise<CreatureSubject | null> {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
        return null
    }

    try {
        const image = new Image()
        image.crossOrigin = 'anonymous'
        image.src = src

        if (typeof image.decode === 'function') {
            await image.decode()
        } else {
            await new Promise<void>((resolve, reject) => {
                image.onload = () => resolve()
                image.onerror = () => reject(new Error('load failed'))
            })
        }

        const { naturalWidth, naturalHeight } = image

        if (!naturalWidth || !naturalHeight) {
            return null
        }

        const scale = Math.min(1, SAMPLE_EDGE / Math.max(naturalWidth, naturalHeight))
        const width = Math.max(1, Math.round(naturalWidth * scale))
        const height = Math.max(1, Math.round(naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const context = canvas.getContext('2d', { willReadFrequently: true })

        if (!context) {
            return null
        }

        context.drawImage(image, 0, 0, width, height)

        const { data } = context.getImageData(0, 0, width, height)
        let minX = width
        let minY = height
        let maxX = -1
        let maxY = -1

        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                if (data[(y * width + x) * 4 + 3]! <= OPAQUE_ALPHA) {
                    continue
                }

                if (x < minX) minX = x
                if (x > maxX) maxX = x
                if (y < minY) minY = y
                if (y > maxY) maxY = y
            }
        }

        if (maxX < 0 || maxY < 0) {
            return null
        }

        const subjectHeight = maxY + 1 - minY
        const centreX = (minX + maxX + 1) / 2 / width
        const aspect = naturalWidth / naturalHeight

        return Object.freeze({
            heightRatio: subjectHeight / height,
            bottomMarginRatio: (height - maxY - 1) / height,
            boxWidthPerHeight: 2 * aspect * Math.max(centreX, 1 - centreX),
            centreX,
            centreY: (minY + maxY + 1) / 2 / height,
        })
    } catch {
        return null
    }
}
