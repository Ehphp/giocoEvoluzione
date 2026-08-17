import { describe, expect, it } from 'vitest'

import {
    applyHorizontalMirrorCorrection,
    decideHorizontalMirrorCorrection,
    mergeVisualInspection,
    type ObservedVisualState,
    type VisualInspection,
} from './visual-inspection.ts'

type Facing = ObservedVisualState['orientation']['facing']

function observed(facing: Facing): ObservedVisualState {
    return {
        schemaVersion: 'observed-visual-v1', orientation: { viewpoint: 'PROFILE', facing }, observedBodyPlan: 'quadruped',
        headAndEyes: 'one head', limbsAndLimbLikeStructures: 'four legs', tail: 'one tail', hornsAntlers: 'none', dorsalStructures: 'none',
        appendages: 'none', skinCovering: 'scales', primaryColors: ['green'], distinctiveStructures: [], targetRegions: [],
    }
}

function inspection(facing: Facing, mirrored = true): VisualInspection {
    const evidence = mirrored ? [{ type: 'MIRRORED_SUBJECT' as const, imageRegion: 'CENTER_IMAGE_LEFT' as const, description: 'Subject mirrors the supplied source.', confidence: 0.93 }] : []
    return mergeVisualInspection({
        previous: null, generation: 4, inspectedAt: '2026-08-17T00:00:00.000Z',
        detector: { status: 'COMPLETE', evidence },
        mapper: {
            status: 'COMPLETE', usedVision1Evidence: mirrored,
            evidenceAssessments: mirrored ? [{ evidenceIndex: 0, disposition: 'CONFIRMED' as const, verificationNote: 'opposite-facing mirror is visible' }] : [],
            structuralConcerns: evidence, observedVisualState: observed(facing),
        },
    })
}

describe('Seedream horizontal mirror correction decision', () => {
    it.each([
        ['IMAGE_RIGHT', 'FLIP'],
        ['IMAGE_LEFT', 'KEEP'],
        ['UNKNOWN', 'KEEP'],
        ['CENTER', 'KEEP'],
    ] as const)('flips only a raw output that faces right in the observed image: %s', (outputFacing, action) => {
        expect(decideHorizontalMirrorCorrection({ inspection: inspection(outputFacing) }).action).toBe(action)
    })

    it('does not require MIRRORED_SUBJECT when the raw output faces right', () => {
        expect(decideHorizontalMirrorCorrection({ inspection: inspection('IMAGE_RIGHT', false) })).toMatchObject({ action: 'FLIP', reason: 'OUTPUT_FACING_RIGHT' })
    })

    it('records the correction, updates the persisted orientation and cannot flip the same inspection twice', () => {
        const raw = inspection('IMAGE_RIGHT')
        const corrected = applyHorizontalMirrorCorrection({
            inspection: raw, outputFacing: 'IMAGE_RIGHT', correctedFacing: 'IMAGE_LEFT', generation: 4, appliedAt: '2026-08-17T00:00:01.000Z',
        })

        expect(corrected).toMatchObject({
            observedVisualState: { orientation: { facing: 'IMAGE_LEFT' } },
            assetCorrection: { type: 'HORIZONTAL_MIRROR', outputFacing: 'IMAGE_RIGHT', correctedFacing: 'IMAGE_LEFT' },
            visualAnomalies: [expect.objectContaining({ type: 'MIRRORED_SUBJECT', status: 'RESOLVED', resolvedAtGeneration: 4 })],
        })
        expect(corrected.anomalyDetector.evidence[0]).toMatchObject({ imageRegion: 'CENTER_IMAGE_RIGHT' })
        expect(decideHorizontalMirrorCorrection({ inspection: corrected })).toMatchObject({ action: 'KEEP', reason: 'ALREADY_CORRECTED' })
    })
})
