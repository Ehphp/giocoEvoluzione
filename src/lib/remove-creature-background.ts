export class CreatureBackgroundRemovalError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options)
        this.name = 'CreatureBackgroundRemovalError'
    }
}

const BACKGROUND_REMOVAL_MODEL = 'isnet_fp16' as const

export async function removeCreatureBackground(rawImage: Blob): Promise<Blob> {
    if (rawImage.type && rawImage.type !== 'image/png') {
        throw new CreatureBackgroundRemovalError('Il raw della creatura non e un PNG valido.')
    }
    try {
        const { removeBackground } = await import('@imgly/background-removal')
        const result = await removeBackground(rawImage, {
            device: 'cpu',
            model: BACKGROUND_REMOVAL_MODEL,
            output: { format: 'image/png' },
        })
        if (result.type !== 'image/png' || !result.size) {
            throw new CreatureBackgroundRemovalError('Il tool non ha prodotto un PNG trasparente utilizzabile.')
        }
        if (result.size > 10 * 1024 * 1024) {
            throw new CreatureBackgroundRemovalError('Il PNG elaborato supera il limite tecnico di 10 MB.')
        }
        return result
    } catch (error) {
        if (error instanceof CreatureBackgroundRemovalError) throw error
        throw new CreatureBackgroundRemovalError('La rimozione dello sfondo non e riuscita.', { cause: error })
    }
}