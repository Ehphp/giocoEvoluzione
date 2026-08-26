export class CreatureBackgroundRemovalError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options)
        this.name = 'CreatureBackgroundRemovalError'
    }
}

const BACKGROUND_REMOVAL_MODELS = ['isnet', 'isnet_fp16'] as const
const BACKGROUND_REMOVAL_TIMEOUT_MS = 120_000
const SUPPORTED_RAW_MIME_TYPES = new Set(['image/png', 'image/jpeg'])

function withTimeout<T>(operation: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
            reject(new CreatureBackgroundRemovalError('Il modello di rimozione sfondo non ha risposto entro due minuti.'))
        }, BACKGROUND_REMOVAL_TIMEOUT_MS)
        operation.then(
            (result) => { window.clearTimeout(timeoutId); resolve(result) },
            (error) => { window.clearTimeout(timeoutId); reject(error) },
        )
    })
}

export async function removeCreatureBackground(rawImage: Blob): Promise<Blob> {
    if (rawImage.type && !SUPPORTED_RAW_MIME_TYPES.has(rawImage.type)) {
        throw new CreatureBackgroundRemovalError('Il raw della creatura deve essere un PNG o JPEG valido.')
    }
    let lastError: unknown = null
    try {
        const { removeBackground } = await import('@imgly/background-removal')
        for (const model of BACKGROUND_REMOVAL_MODELS) {
            try {
                const result = await withTimeout(removeBackground(rawImage, {
                    device: 'cpu',
                    model,
                    output: { format: 'image/png' },
                }))
                if (result.type !== 'image/png' || !result.size) {
                    throw new CreatureBackgroundRemovalError('Il tool non ha prodotto un PNG trasparente utilizzabile.')
                }
                if (result.size > 10 * 1024 * 1024) {
                    throw new CreatureBackgroundRemovalError('Il PNG elaborato supera il limite tecnico di 10 MB.')
                }
                return result
            } catch (error) {
                lastError = error
            }
        }
    } catch (error) {
        if (error instanceof CreatureBackgroundRemovalError) throw error
        lastError = error
    }
    const detail = lastError instanceof Error && lastError.message.trim() ? ` Dettaglio: ${lastError.message}` : ''
    throw new CreatureBackgroundRemovalError(`La rimozione dello sfondo non e riuscita.${detail}`, { cause: lastError })
}
