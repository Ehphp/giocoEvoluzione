import { describe, expect, it } from 'vitest'
import {
    applyProportionFindings,
    mergeVisualInspection,
    parseOrientationArbiterAssessment,
    parseObservedVisualState,
    parseVisualInspection,
    type ObservedVisualState,
    type Vision1DiagnosticEvidence,
    type VisualInspection,
    visualRepairBrief,
} from './visual-inspection.ts'

const evidence: Vision1DiagnosticEvidence = Object.freeze({
    type: 'EXTRA_LIMB',
    imageRegion: 'CENTER_IMAGE_RIGHT',
    confidence: 0.93,
    description: 'Additional limb-like structure.',
})
const observed: ObservedVisualState = Object.freeze({
    schemaVersion: 'observed-visual-v1',
    orientation: { viewpoint: 'PROFILE' as const, facing: 'IMAGE_RIGHT' as const },
    observedBodyPlan: 'quadruped',
    headAndEyes: 'one head',
    limbsAndLimbLikeStructures: 'four legs and a possible extra structure',
    tail: 'one tail',
    hornsAntlers: 'none',
    dorsalStructures: 'none',
    appendages: 'possible extra structure',
    skinCovering: 'scales',
    primaryColors: [],
    distinctiveStructures: [],
    targetRegions: [],
})

function prior(): VisualInspection {
    return mergeVisualInspection({
        previous: null,
        generation: 3,
        inspectedAt: '2026-08-17T00:00:00.000Z',
        detector: { status: 'COMPLETE', evidence: [evidence] },
        mapper: {
            status: 'COMPLETE',
            usedVision1Evidence: true,
            evidenceAssessments: [{ evidenceIndex: 0, disposition: 'CONFIRMED', verificationNote: 'visible' }],
            structuralConcerns: [evidence],
            observedVisualState: observed,
        },
    })
}

describe('visual inspection repair lifecycle', () => {
    it('parses only the bounded orientation arbiter result schema', () => {
        expect(
            parseOrientationArbiterAssessment({
                status: 'COMPLETE',
                results: ['UNCERTAIN', 'DIRECTIONAL_RIGHT'],
            }),
        ).toEqual({ status: 'COMPLETE', results: ['UNCERTAIN', 'DIRECTIONAL_RIGHT'] })
        expect(parseOrientationArbiterAssessment({ status: 'COMPLETE', results: ['CENTER'] })).toBeNull()
        expect(parseOrientationArbiterAssessment({ status: 'COMPLETE', results: ['UNCERTAIN', 'CLEAR_FRONT', 'X'] })).toBeNull()
    })

    it('parses Vision 2 short descriptions while keeping prior inspections readable', () => {
        const description = 'Una creatura quadrupede dalle scaglie verdi, con una coda lunga e soffici corna arancioni.'
        expect(parseObservedVisualState({ ...observed, shortDescription: description })?.shortDescription).toBe(
            description,
        )
        expect(
            parseObservedVisualState({ ...observed, shortDescription: `${description} Ha anche una cresta.` }),
        ).toBeNull()
        expect(parseObservedVisualState(observed)?.shortDescription).toBeUndefined()
    })

    it('resolves prior debt only after detector absence and a successful mapper without a compatible concern', () => {
        const next = mergeVisualInspection({
            previous: prior(),
            generation: 4,
            inspectedAt: '2026-08-17T00:01:00.000Z',
            detector: { status: 'COMPLETE', evidence: [] },
            mapper: {
                status: 'COMPLETE',
                usedVision1Evidence: false,
                evidenceAssessments: [],
                structuralConcerns: [],
                observedVisualState: observed,
            },
        })
        expect(next.visualAnomalies).toEqual([
            expect.objectContaining({ type: 'EXTRA_LIMB', status: 'RESOLVED', resolvedAtGeneration: 4 }),
        ])
    })

    it('keeps debt unresolved when the detector misses it but the mapper still sees compatible evidence', () => {
        const next = mergeVisualInspection({
            previous: prior(),
            generation: 4,
            inspectedAt: '2026-08-17T00:01:00.000Z',
            detector: { status: 'COMPLETE', evidence: [] },
            mapper: {
                status: 'COMPLETE',
                usedVision1Evidence: false,
                evidenceAssessments: [],
                structuralConcerns: [evidence],
                observedVisualState: observed,
            },
        })
        expect(next.visualAnomalies).toEqual([
            expect.objectContaining({ type: 'EXTRA_LIMB', status: 'UNRESOLVED', detectedAtGeneration: 3 }),
        ])
    })

    it('retains a POSSIBLE assessment as mapper evidence without changing canonical anatomy', () => {
        const inspection = mergeVisualInspection({
            previous: null,
            generation: 3,
            inspectedAt: '2026-08-17T00:00:00.000Z',
            detector: { status: 'COMPLETE', evidence: [evidence] },
            mapper: {
                status: 'COMPLETE',
                usedVision1Evidence: true,
                evidenceAssessments: [
                    { evidenceIndex: 0, disposition: 'POSSIBLE', verificationNote: 'partially occluded' },
                ],
                structuralConcerns: [evidence],
                observedVisualState: observed,
            },
        })
        expect(inspection.stateMapper.evidenceAssessments).toEqual([
            expect.objectContaining({ disposition: 'POSSIBLE' }),
        ])
        expect(inspection.visualAnomalies).toEqual([expect.objectContaining({ status: 'UNRESOLVED' })])
    })

    it('preserves the prior debt when Vision 1 is unavailable, even if Vision 2 is also unavailable', () => {
        const next = mergeVisualInspection({
            previous: prior(),
            generation: 4,
            inspectedAt: '2026-08-17T00:01:00.000Z',
            detector: { status: 'UNAVAILABLE', evidence: [] },
            mapper: {
                status: 'UNAVAILABLE',
                usedVision1Evidence: false,
                evidenceAssessments: [],
                structuralConcerns: [],
            },
        })
        expect(next.visualAnomalies).toEqual([expect.objectContaining({ type: 'EXTRA_LIMB', status: 'UNRESOLVED' })])
    })

    it('keeps repair instructions compact and secondary to the chosen target', () => {
        expect(visualRepairBrief(prior())).toContain('secondary to the selected evolution target')
    })

    it('accepts bounded persisted horizontal-mirror correction metadata', () => {
        const parsed = parseVisualInspection({
            ...prior(),
            orientationArbiter: {
                status: 'COMPLETE',
                results: ['UNCERTAIN', 'DIRECTIONAL_RIGHT'],
            },
            assetCorrection: {
                type: 'HORIZONTAL_MIRROR',
                appliedAt: '2026-08-17T00:00:01.000Z',
                outputFacing: 'IMAGE_LEFT',
                correctedFacing: 'IMAGE_RIGHT',
            },
        })
        expect(parsed?.assetCorrection).toMatchObject({ type: 'HORIZONTAL_MIRROR', correctedFacing: 'IMAGE_RIGHT' })
        expect(parsed?.orientationArbiter).toEqual({
            status: 'COMPLETE',
            results: ['UNCERTAIN', 'DIRECTIONAL_RIGHT'],
        })
    })

    it('keeps a valid relative-height comparison optional and rejects malformed legacy extensions', () => {
        const heightComparison = {
            schemaVersion: 'relative-height-v1',
            sourceVersionId: 'version-2',
            sourceHeightMeters: 1.4,
            resultHeightMeters: 1.512,
            change: 'TALLER',
            confidence: 0.8,
            confounders: [],
        }
        expect(parseVisualInspection({ ...prior(), heightComparison })?.heightComparison).toEqual(heightComparison)
        expect(parseVisualInspection({ ...prior(), heightComparison: { ...heightComparison, confidence: 0.2 } })).toBeNull()
        expect(parseVisualInspection(prior())?.heightComparison).toBeUndefined()
    })

    it('records the APBENZ trunk, neck and inherited head findings without treating authorized anatomy as drift', () => {
        const inspection = applyProportionFindings({
            inspection: mergeVisualInspection({
                previous: null,
                generation: 7,
                inspectedAt: '2026-09-03T20:08:16.716Z',
                detector: { status: 'COMPLETE', evidence: [] },
                mapper: {
                    status: 'COMPLETE',
                    usedVision1Evidence: false,
                    evidenceAssessments: [],
                    structuralConcerns: [],
                    observedVisualState: observed,
                },
            }),
            generation: 7,
            proportionFindings: [
                {
                    region: 'TRUNK',
                    change: 'INTRODUCED',
                    authorization: 'AUTHORIZED',
                    confidence: .96,
                    reason: 'The trunk is about 30% longer as requested by BODY_SHAPE.',
                },
                {
                    region: 'NECK',
                    change: 'INTRODUCED',
                    authorization: 'UNAUTHORIZED',
                    confidence: .9,
                    reason: 'The neck is visibly longer although the concept only allows a slight base taper.',
                },
                {
                    region: 'HEAD',
                    change: 'PREEXISTING',
                    authorization: 'NOT_APPLICABLE',
                    confidence: .94,
                    reason: 'The oversized head was already visible in the source image.',
                },
            ],
        })

        expect(inspection.proportionFindings).toHaveLength(3)
        expect(inspection.visualAnomalies).toEqual([
            expect.objectContaining({
                type: 'BODY_PROPORTION_DRIFT',
                proportionRegion: 'NECK',
                status: 'UNRESOLVED',
                detectedAtGeneration: 7,
            }),
        ])
        expect(visualRepairBrief(inspection)).toContain('NECK: The neck is visibly longer')
    })

    it('resolves the APBENZ neck debt when a later source/result comparison improves it', () => {
        const withNeckDebt = applyProportionFindings({
            inspection: mergeVisualInspection({
                previous: null,
                generation: 7,
                inspectedAt: '2026-09-03T20:08:16.716Z',
                detector: { status: 'COMPLETE', evidence: [] },
                mapper: {
                    status: 'COMPLETE',
                    usedVision1Evidence: false,
                    evidenceAssessments: [],
                    structuralConcerns: [],
                    observedVisualState: observed,
                },
            }),
            generation: 7,
            proportionFindings: [
                {
                    region: 'NECK',
                    change: 'INTRODUCED',
                    authorization: 'UNAUTHORIZED',
                    confidence: .9,
                    reason: 'The neck is longer than the selected BODY_SHAPE mutation permits.',
                },
            ],
        })
        const next = applyProportionFindings({
            inspection: mergeVisualInspection({
                previous: withNeckDebt,
                generation: 8,
                inspectedAt: '2026-09-03T20:12:00.000Z',
                detector: { status: 'COMPLETE', evidence: [] },
                mapper: {
                    status: 'COMPLETE',
                    usedVision1Evidence: false,
                    evidenceAssessments: [],
                    structuralConcerns: [],
                    observedVisualState: observed,
                },
            }),
            generation: 8,
            proportionFindings: [
                {
                    region: 'NECK',
                    change: 'IMPROVED',
                    authorization: 'NOT_APPLICABLE',
                    confidence: .88,
                    reason: 'The previous neck elongation is no longer visually material.',
                },
            ],
        })

        expect(next.visualAnomalies).toEqual([
            expect.objectContaining({
                type: 'BODY_PROPORTION_DRIFT',
                proportionRegion: 'NECK',
                status: 'RESOLVED',
                detectedAtGeneration: 7,
                resolvedAtGeneration: 8,
            }),
        ])
        expect(visualRepairBrief(next)).toBeNull()
    })

    it('retains a pre-existing neck debt until a later comparison actually improves it', () => {
        const priorDebt = {
            type: 'BODY_PROPORTION_DRIFT' as const,
            imageRegion: 'CENTER_IMAGE' as const,
            description: 'NECK: The neck is too long.',
            confidence: .9,
            status: 'UNRESOLVED' as const,
            detectedAtGeneration: 7,
            proportionRegion: 'NECK' as const,
        }
        const next = applyProportionFindings({
            inspection: mergeVisualInspection({
                previous: {
                    ...prior(),
                    visualAnomalies: [priorDebt],
                },
                generation: 8,
                inspectedAt: '2026-09-03T20:12:00.000Z',
                detector: { status: 'COMPLETE', evidence: [] },
                mapper: {
                    status: 'COMPLETE',
                    usedVision1Evidence: false,
                    evidenceAssessments: [],
                    structuralConcerns: [],
                    observedVisualState: observed,
                },
            }),
            generation: 8,
            proportionFindings: [
                {
                    region: 'NECK',
                    change: 'PREEXISTING',
                    authorization: 'NOT_APPLICABLE',
                    confidence: .9,
                    reason: 'The longer neck was already present in the source image.',
                },
            ],
        })

        expect(next.visualAnomalies).toEqual([
            expect.objectContaining({
                type: 'BODY_PROPORTION_DRIFT',
                proportionRegion: 'NECK',
                status: 'UNRESOLVED',
                detectedAtGeneration: 7,
            }),
        ])
    })

    it('keeps legacy inspections readable when proportion findings are absent or malformed', () => {
        expect(parseVisualInspection(prior())?.proportionFindings).toBeUndefined()
        expect(
            parseVisualInspection({
                ...prior(),
                proportionFindings: Array.from({ length: 5 }, () => ({
                    region: 'HEAD',
                    change: 'PREEXISTING',
                    authorization: 'NOT_APPLICABLE',
                    confidence: .9,
                    reason: 'Too many findings.',
                })),
            }),
        ).toBeNull()
    })
})
