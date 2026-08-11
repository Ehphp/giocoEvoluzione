export const CREATURE_MASTER_DIMENSIONS = Object.freeze({ width: 1024, height: 1536 })

export function getNormalizedCreatureMasterDimensions(width: number, height: number) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || Math.abs(width / height - 2 / 3) > 0.001) {
        throw new Error('Il PNG della creatura deve mantenere il rapporto 2:3.')
    }
    return CREATURE_MASTER_DIMENSIONS
}

/** Preserves alpha while restoring the canonical master canvas after FLUX raw generation. */
export async function normalizeCreatureMasterPng(rawPng: Blob): Promise<Blob> {
    if (rawPng.type && rawPng.type !== 'image/png') throw new Error('Il master della creatura deve essere un PNG.')
    const bitmap = await createImageBitmap(rawPng)
    try {
        const { width, height } = getNormalizedCreatureMasterDimensions(bitmap.width, bitmap.height)
        if (bitmap.width === width && bitmap.height === height) return rawPng
        const canvas = new OffscreenCanvas(width, height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Il browser non supporta la normalizzazione del master della creatura.')
        context.imageSmoothingEnabled = true
        context.imageSmoothingQuality = 'high'
        context.clearRect(0, 0, width, height)
        context.drawImage(bitmap, 0, 0, width, height)
        const normalized = await canvas.convertToBlob({ type: 'image/png' })
        if (!normalized.size || normalized.type !== 'image/png') throw new Error('Il browser non ha prodotto un PNG master valido.')
        return normalized
    } finally {
        bitmap.close()
    }
}
