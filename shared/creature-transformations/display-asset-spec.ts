export const CREATURE_DISPLAY_MAX_SIDE = 768
export const CREATURE_DISPLAY_WEBP_QUALITY = 0.92

export type CreatureDisplayDimensions = Readonly<{
    width: number
    height: number
}>

export function getCreatureDisplayDimensions(width: number, height: number, maxSide = CREATURE_DISPLAY_MAX_SIDE): CreatureDisplayDimensions {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || !Number.isFinite(maxSide) || maxSide < 1) {
        throw new Error('Le dimensioni del display asset non sono valide.')
    }
    const scale = Math.min(1, maxSide / Math.max(width, height))
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}