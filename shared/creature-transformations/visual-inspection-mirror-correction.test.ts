import { describe, expect, it } from 'vitest'

import {
    applyHorizontalMirrorCorrection,
    decideSeedreamCenterFacing,
    decideHorizontalMirrorCorrection,
    mergeVisualInspection,
    shouldRejectSeedreamCenterFacing,
    type OrientationArbiterAssessment,
    type ObservedVisualState,
    type VisualInspection,
} from './visual-inspection.ts'

type Facing = ObservedVisualState['orientation']['facing']

function observed(facing: Facing): ObservedVisualState {
    return {
        schemaVersion: 'observed-visual-v1',
        orientation: { viewpoint: 'PROFILE', facing },
        observedBodyPlan: 'quadruped',
        headAndEyes: 'one head',
        limbsAndLimbLikeStructures: 'four legs',
        tail: 'one tail',
        hornsAntlers: 'none',
        dorsalStructures: 'none',
        appendages: 'none',
        skinCovering: 'scales',
        primaryColors: ['green'],
        distinctiveStructures: [],
        targetRegions: [],
    }
}

function inspection(
    facing: Facing,
    mirrored = true,
    orientationArbiter?: OrientationArbiterAssessment,
): VisualInspection {
    const evidence = mirrored
        ? [
              {
                  type: 'MIRRORED_SUBJECT' as const,
                  imageRegion: 'CENTER_IMAGE_LEFT' as const,
                  description: 'Subject mirrors the supplied source.',
                  confidence: 0.93,
              },
          ]
        : []
    return mergeVisualInspection({
        previous: null,
        generation: 4,
        inspectedAt: '2026-08-17T00:00:00.000Z',
        detector: { status: 'COMPLETE', evidence },
        mapper: {
            status: 'COMPLETE',
            usedVision1Evidence: mirrored,
            evidenceAssessments: mirrored
                ? [
                      {
                          evidenceIndex: 0,
                          disposition: 'CONFIRMED' as const,
                          verificationNote: 'opposite-facing mirror is visible',
                      },
                  ]
                : [],
            structuralConcerns: evidence,
            observedVisualState: observed(facing),
        },
        orientationArbiter,
    })
}

describe('Seedream horizontal mirror correction decision', () => {
    it('rejects CENTER only after the orientation arbiter confirms a clear front', () => {
        expect(shouldRejectSeedreamCenterFacing(inspection('CENTER'))).toBe(false)
        expect(
            shouldRejectSeedreamCenterFacing(
                inspection('CENTER', true, { status: 'COMPLETE', results: ['CLEAR_FRONT'] }),
            ),
        ).toBe(true)
        expect(shouldRejectSeedreamCenterFacing(inspection('UNKNOWN'))).toBe(false)
        expect(shouldRejectSeedreamCenterFacing(null)).toBe(false)
    })

    it.each([
        ['DIRECTIONAL_RIGHT', ['DIRECTIONAL_RIGHT'], 'ARBITER_DIRECTIONAL', false],
        ['CLEAR_FRONT', ['CLEAR_FRONT'], 'ARBITER_CLEAR_FRONT', true],
        ['UNCERTAIN then directional', ['UNCERTAIN', 'DIRECTIONAL_LEFT'], 'ARBITER_DIRECTIONAL', false],
        ['UNCERTAIN twice', ['UNCERTAIN', 'UNCERTAIN'], 'ARBITER_UNCERTAIN_FAIL_OPEN', false],
    ] as const)('applies the CENTER arbiter policy for %s', (_label, results, reason, rejects) => {
        const center = inspection('CENTER', true, { status: 'COMPLETE', results })
        expect(decideSeedreamCenterFacing({ inspection: center })).toMatchObject({
            action: rejects ? 'REJECT' : 'ACCEPT',
            reason,
        })
        expect(shouldRejectSeedreamCenterFacing(center)).toBe(rejects)
    })

    it.each([
        ['IMAGE_LEFT', 'FLIP'],
        ['IMAGE_RIGHT', 'KEEP'],
        ['UNKNOWN', 'KEEP'],
        ['CENTER', 'KEEP'],
    ] as const)('flips only a raw output whose Vision facing maps to visible right: %s', (outputFacing, action) => {
        expect(decideHorizontalMirrorCorrection({ inspection: inspection(outputFacing) }).action).toBe(action)
    })

    it('does not require MIRRORED_SUBJECT when the raw output is IMAGE_LEFT', () => {
        expect(decideHorizontalMirrorCorrection({ inspection: inspection('IMAGE_LEFT', false) })).toMatchObject({
            action: 'FLIP',
            reason: 'OUTPUT_FACING_LEFT',
        })
    })

    it('does not let an arbiter directional result alter horizontal mirror correction', () => {
        const center = inspection('CENTER', true)
        const arbitratedCenter = inspection('CENTER', true, {
            status: 'COMPLETE',
            results: ['DIRECTIONAL_RIGHT'],
        })
        expect(decideHorizontalMirrorCorrection({ inspection: arbitratedCenter })).toEqual(
            decideHorizontalMirrorCorrection({ inspection: center }),
        )
    })

    it('records the correction, updates the persisted orientation and cannot flip the same inspection twice', () => {
        const raw = inspection('IMAGE_LEFT')
        const corrected = applyHorizontalMirrorCorrection({
            inspection: raw,
            outputFacing: 'IMAGE_LEFT',
            correctedFacing: 'IMAGE_RIGHT',
            generation: 4,
            appliedAt: '2026-08-17T00:00:01.000Z',
        })

        expect(corrected).toMatchObject({
            observedVisualState: { orientation: { facing: 'IMAGE_RIGHT' } },
            assetCorrection: { type: 'HORIZONTAL_MIRROR', outputFacing: 'IMAGE_LEFT', correctedFacing: 'IMAGE_RIGHT' },
            visualAnomalies: [
                expect.objectContaining({ type: 'MIRRORED_SUBJECT', status: 'RESOLVED', resolvedAtGeneration: 4 }),
            ],
        })
        expect(corrected.anomalyDetector.evidence[0]).toMatchObject({ imageRegion: 'CENTER_IMAGE_RIGHT' })
        expect(decideHorizontalMirrorCorrection({ inspection: corrected })).toMatchObject({
            action: 'KEEP',
            reason: 'ALREADY_CORRECTED',
        })
    })
})
