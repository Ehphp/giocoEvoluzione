/**
 * Where the animal actually is inside a creature sprite.
 *
 * The sprites do not share a framing: `verdant-hatchling.webp` carries 33.5% of its height as
 * transparent margin below the animal, `amethyst-hatchling.webp` 35.4%, the base art none — and the
 * generated evolution visuals are their own thing again. CSS cannot tell margin from animal, so
 * laying the art out by the file's box either leaves the creature small (a sprite that is mostly
 * margin) or drops it through the plaque (a compensation constant measured on a different sprite).
 *
 * Reading the opaque bounds once per image removes the guess: the layout can then size and centre
 * the *animal* rather than the file. Everything here degrades to `null`, which the caller renders
 * as a plain `contain` fit — the safe behaviour, just not the flattering one.
 */

export type CreatureSubject = {
    /** Opaque height as a fraction of the sprite's height. Scale by 1/this to fill a box. */
    heightRatio: number
    /**
     * How wide the whole sprite has to be drawn, per unit of its height, for the opaque area to stay
     * centred inside that width — `2 × aspect × the larger side of the opaque centre`. A caller
     * sizing by height divides its available width by this to get a height that keeps the entire
     * sprite box on screen, not just the animal: the transparent margin is a real element box and
     * would otherwise hang off the viewport, since centring is done on the animal, not the file.
     */
    boxWidthPerHeight: number
    /** Centre of the opaque area, as fractions of the sprite's width and height. */
    centreX: number
    centreY: number
}

/**
 * Long edge of the scratch canvas. The bounds only steer layout, so sampling a 1024×1536 sprite at
 * this size costs a fraction of the pixels and still lands within a couple of source pixels.
 */
const SAMPLE_EDGE = 192

/** Averaged-down edges go translucent, so this sits above "blurred edge" and below "artwork". */
const OPAQUE_ALPHA = 24

const cache = new Map<string, CreatureSubject | null>()

/**
 * Reads the sprite's opaque bounds, or returns `null` when they cannot be read — no canvas (tests,
 * SSR), a decode failure, or a cross-origin image served without CORS headers, which taints the
 * canvas and makes `getImageData` throw. Results are cached per URL, including the failures.
 *
 * This loads its own copy of the image with `crossOrigin` set rather than reusing the rendered one:
 * setting `crossOrigin` on the displayed sprite would make it fail to *display* against a host that
 * omits the headers, which is a far worse trade than losing the measurement.
 */
export async function measureCreatureSubject(src: string): Promise<CreatureSubject | null> {
    const cached = cache.get(src)

    if (cached !== undefined) {
        return cached
    }

    const subject = await read(src)
    cache.set(src, subject)

    return subject
}

async function read(src: string): Promise<CreatureSubject | null> {
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

        // Throws a SecurityError when the image tainted the canvas; the catch turns that into null.
        const { data } = context.getImageData(0, 0, width, height)

        let minX = width
        let minY = height
        let maxX = -1
        let maxY = -1

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
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

        const subjectHeight = (maxY + 1 - minY) / height
        const centreX = (minX + maxX + 1) / 2 / width
        const aspect = naturalWidth / naturalHeight

        return {
            heightRatio: subjectHeight,
            // The sprite is centred on `centreX`, so its wider half is what has to fit.
            boxWidthPerHeight: 2 * aspect * Math.max(centreX, 1 - centreX),
            centreX,
            centreY: (minY + maxY + 1) / 2 / height,
        }
    } catch {
        return null
    }
}
