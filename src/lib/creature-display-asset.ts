import { CREATURE_DISPLAY_MAX_SIDE, CREATURE_DISPLAY_WEBP_QUALITY, getCreatureDisplayDimensions } from '../../shared/creature-transformations/display-asset-spec.ts'

export { CREATURE_DISPLAY_MAX_SIDE }

export type CreatureDisplayAsset = Readonly<{
    blob: Blob
    width: number
    height: number
}>

export async function createCreatureDisplayAsset(masterPng: Blob, maxSide = CREATURE_DISPLAY_MAX_SIDE): Promise<CreatureDisplayAsset> {
    if (masterPng.type && masterPng.type !== 'image/png') throw new Error('Il master della creatura deve essere un PNG.')
    if (!Number.isFinite(maxSide) || maxSide < 1) throw new Error('La dimensione massima del display asset non e valida.')

    const bitmap = await createImageBitmap(masterPng)
    try {
        const { width, height } = getCreatureDisplayDimensions(bitmap.width, bitmap.height, maxSide)
        const canvas = new OffscreenCanvas(width, height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Il browser non supporta la conversione dell immagine della creatura.')
        context.drawImage(bitmap, 0, 0, width, height)
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality: CREATURE_DISPLAY_WEBP_QUALITY })
        if (!blob.size || blob.type !== 'image/webp') throw new Error('Il browser non ha prodotto un display asset WebP valido.')
        return { blob, width, height }
    } finally {
        bitmap.close()
    }
}