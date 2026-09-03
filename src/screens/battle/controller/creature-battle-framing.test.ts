import { describe, expect, it } from 'vitest'

import type { CreatureSubject } from '../../../lib/creature-subject'
import { getCreatureBattleRenderMetrics } from './creature-battle-framing'

const SAME_CANVAS = {
    naturalWidth: 512,
    naturalHeight: 768,
    renderedWidth: 320,
    renderedHeight: 600,
}

const TIGHT_SUBJECT: CreatureSubject = {
    heightRatio: .82,
    bottomMarginRatio: .04,
    boxWidthPerHeight: 1,
    centreX: .5,
    centreY: .5,
}

const PADDED_SUBJECT: CreatureSubject = {
    heightRatio: .65,
    bottomMarginRatio: .21,
    boxWidthPerHeight: 1,
    centreX: .5,
    centreY: .47,
}

function foregroundFoot(metrics: ReturnType<typeof getCreatureBattleRenderMetrics>, subject: CreatureSubject): number {
    return metrics.groundOffsetPixels
        - metrics.containedCanvasHeight! * subject.bottomMarginRatio * metrics.renderScale
}

describe('getCreatureBattleRenderMetrics', () => {
    it('normalizes equal biological heights from equal canvases with different alpha bounds', () => {
        const tight = getCreatureBattleRenderMetrics({
            heightMeters: 1.4,
            subject: TIGHT_SUBJECT,
            imageBox: SAME_CANVAS,
        })
        const padded = getCreatureBattleRenderMetrics({
            heightMeters: 1.4,
            subject: PADDED_SUBJECT,
            imageBox: SAME_CANVAS,
        })

        expect(tight.framingNormalization).toBe(1)
        expect(padded.framingNormalization).toBeCloseTo(.82 / .65)
        expect(tight.visibleHeightPixels).toBeCloseTo(padded.visibleHeightPixels!)
    })

    it('makes 1.652m visibly 25–30% taller than 1.4m after framing normalization', () => {
        const reference = getCreatureBattleRenderMetrics({
            heightMeters: 1.4,
            subject: TIGHT_SUBJECT,
            imageBox: SAME_CANVAS,
        })
        const taller = getCreatureBattleRenderMetrics({
            heightMeters: 1.652,
            subject: TIGHT_SUBJECT,
            imageBox: SAME_CANVAS,
        })
        const visibleRatio = taller.visibleHeightPixels! / reference.visibleHeightPixels!

        expect(visibleRatio).toBeGreaterThan(1.25)
        expect(visibleRatio).toBeLessThan(1.3)
    })

    it('puts different transparent lower margins on the same ground line', () => {
        const tight = getCreatureBattleRenderMetrics({
            heightMeters: 1.4,
            subject: TIGHT_SUBJECT,
            imageBox: SAME_CANVAS,
        })
        const padded = getCreatureBattleRenderMetrics({
            heightMeters: 1.4,
            subject: PADDED_SUBJECT,
            imageBox: SAME_CANVAS,
        })

        expect(foregroundFoot(tight, TIGHT_SUBJECT)).toBeCloseTo(0)
        expect(foregroundFoot(padded, PADDED_SUBJECT)).toBeCloseTo(0)
    })

    it('falls back safely to uncalibrated framing when alpha bounds cannot be read', () => {
        const metrics = getCreatureBattleRenderMetrics({
            heightMeters: 1.4,
            subject: null,
            imageBox: null,
        })

        expect(metrics.framingNormalization).toBe(1)
        expect(metrics.renderScale).toBe(1)
        expect(metrics.groundOffsetPixels).toBe(0)
        expect(metrics.visibleHeightPixels).toBeNull()
    })
})
