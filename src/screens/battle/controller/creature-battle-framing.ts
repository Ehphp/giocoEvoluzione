import { getCreatureBattleScale } from '../../../../shared/creature-scale.ts'
import type { CreatureSubject } from '../../../lib/creature-subject'

export type CreatureBattleImageBox = Readonly<{
    naturalWidth: number
    naturalHeight: number
    renderedWidth: number
    renderedHeight: number
}>

export type CreatureBattleRenderMetrics = Readonly<{
    framingNormalization: number
    biologicalScale: number
    renderScale: number
    containedCanvasHeight: number | null
    groundOffsetPixels: number
    visibleHeightPixels: number | null
}>

/*
 * The local starter foreground measures ~87% of its canvas. Keeping the target just below that
 * preserves its established arena footprint while allowing generated assets with extra padding to
 * reach the same visible body height automatically.
 */
export const BATTLE_TARGET_VISIBLE_HEIGHT_RATIO = .82
export const MIN_BATTLE_FRAMING_NORMALIZATION = .75
export const MAX_BATTLE_FRAMING_NORMALIZATION = 1.35

function finitePositive(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function ratio(value: unknown): number | null {
    return finitePositive(value) && value <= 1 ? value : null
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value))
}

export function getCreatureFramingNormalization(subject: CreatureSubject | null | undefined): number {
    const heightRatio = ratio(subject?.heightRatio)

    return heightRatio === null
        ? 1
        : clamp(
            BATTLE_TARGET_VISIBLE_HEIGHT_RATIO / heightRatio,
            MIN_BATTLE_FRAMING_NORMALIZATION,
            MAX_BATTLE_FRAMING_NORMALIZATION,
        )
}

export function getContainedCanvasHeight(imageBox: CreatureBattleImageBox | null | undefined): number | null {
    if (
        !finitePositive(imageBox?.naturalWidth)
        || !finitePositive(imageBox?.naturalHeight)
        || !finitePositive(imageBox?.renderedWidth)
        || !finitePositive(imageBox?.renderedHeight)
    ) {
        return null
    }

    return imageBox.naturalHeight * Math.min(
        imageBox.renderedWidth / imageBox.naturalWidth,
        imageBox.renderedHeight / imageBox.naturalHeight,
    )
}

/**
 * Derives the presentation-only transform from the alpha foreground and real biological height.
 * Translation happens after scaling in CSS, so the foreground's lowest opaque pixel remains on the
 * common ground line even when transparent bottom padding differs between two otherwise equal files.
 */
export function getCreatureBattleRenderMetrics(input: {
    heightMeters: number
    subject: CreatureSubject | null | undefined
    imageBox: CreatureBattleImageBox | null | undefined
}): CreatureBattleRenderMetrics {
    const framingNormalization = getCreatureFramingNormalization(input.subject)
    const biologicalScale = getCreatureBattleScale(input.heightMeters)
    const renderScale = framingNormalization * biologicalScale
    const containedCanvasHeight = getContainedCanvasHeight(input.imageBox)
    const bottomMarginRatio = ratio(input.subject?.bottomMarginRatio)
    const visibleHeightRatio = ratio(input.subject?.heightRatio)
    const groundOffsetPixels = containedCanvasHeight !== null && bottomMarginRatio !== null
        ? containedCanvasHeight * bottomMarginRatio * renderScale
        : 0
    const visibleHeightPixels = containedCanvasHeight !== null && visibleHeightRatio !== null
        ? containedCanvasHeight * visibleHeightRatio * renderScale
        : null

    return Object.freeze({
        framingNormalization,
        biologicalScale,
        renderScale,
        containedCanvasHeight,
        groundOffsetPixels,
        visibleHeightPixels,
    })
}
