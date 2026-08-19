import { describe, expect, it } from 'vitest'
import { mergeVisualInspection, parseObservedVisualState, parseVisualInspection, type ObservedVisualState, type Vision1DiagnosticEvidence, type VisualInspection, visualRepairBrief } from './visual-inspection.ts'

const evidence: Vision1DiagnosticEvidence = Object.freeze({ type: 'EXTRA_LIMB', imageRegion: 'CENTER_IMAGE_RIGHT', confidence: 0.93, description: 'Additional limb-like structure.' })
const observed: ObservedVisualState = Object.freeze({
    schemaVersion: 'observed-visual-v1', orientation: { viewpoint: 'PROFILE' as const, facing: 'IMAGE_RIGHT' as const }, observedBodyPlan: 'quadruped',
    headAndEyes: 'one head', limbsAndLimbLikeStructures: 'four legs and a possible extra structure', tail: 'one tail', hornsAntlers: 'none',
    dorsalStructures: 'none', appendages: 'possible extra structure', skinCovering: 'scales', primaryColors: [], distinctiveStructures: [], targetRegions: [],
})

function prior(): VisualInspection {
    return mergeVisualInspection({
        previous: null, generation: 3, inspectedAt: '2026-08-17T00:00:00.000Z',
        detector: { status: 'COMPLETE', evidence: [evidence] },
        mapper: { status: 'COMPLETE', usedVision1Evidence: true, evidenceAssessments: [{ evidenceIndex: 0, disposition: 'CONFIRMED', verificationNote: 'visible' }], structuralConcerns: [evidence], observedVisualState: observed },
    })
}

describe('visual inspection repair lifecycle', () => {
    it('parses Vision 2 short descriptions while keeping prior inspections readable', () => {
        const description = 'Una creatura quadrupede dalle scaglie verdi, con una coda lunga e soffici corna arancioni.'
        expect(parseObservedVisualState({ ...observed, shortDescription: description })?.shortDescription).toBe(description)
        expect(parseObservedVisualState({ ...observed, shortDescription: `${description} Ha anche una cresta.` })).toBeNull()
        expect(parseObservedVisualState(observed)?.shortDescription).toBeUndefined()
    })

    it('resolves prior debt only after detector absence and a successful mapper without a compatible concern', () => {
        const next = mergeVisualInspection({
            previous: prior(), generation: 4, inspectedAt: '2026-08-17T00:01:00.000Z',
            detector: { status: 'COMPLETE', evidence: [] },
            mapper: { status: 'COMPLETE', usedVision1Evidence: false, evidenceAssessments: [], structuralConcerns: [], observedVisualState: observed },
        })
        expect(next.visualAnomalies).toEqual([expect.objectContaining({ type: 'EXTRA_LIMB', status: 'RESOLVED', resolvedAtGeneration: 4 })])
    })

    it('keeps debt unresolved when the detector misses it but the mapper still sees compatible evidence', () => {
        const next = mergeVisualInspection({
            previous: prior(), generation: 4, inspectedAt: '2026-08-17T00:01:00.000Z',
            detector: { status: 'COMPLETE', evidence: [] },
            mapper: { status: 'COMPLETE', usedVision1Evidence: false, evidenceAssessments: [], structuralConcerns: [evidence], observedVisualState: observed },
        })
        expect(next.visualAnomalies).toEqual([expect.objectContaining({ type: 'EXTRA_LIMB', status: 'UNRESOLVED', detectedAtGeneration: 3 })])
    })

    it('retains a POSSIBLE assessment as mapper evidence without changing canonical anatomy', () => {
        const inspection = mergeVisualInspection({
            previous: null, generation: 3, inspectedAt: '2026-08-17T00:00:00.000Z',
            detector: { status: 'COMPLETE', evidence: [evidence] },
            mapper: { status: 'COMPLETE', usedVision1Evidence: true, evidenceAssessments: [{ evidenceIndex: 0, disposition: 'POSSIBLE', verificationNote: 'partially occluded' }], structuralConcerns: [evidence], observedVisualState: observed },
        })
        expect(inspection.stateMapper.evidenceAssessments).toEqual([expect.objectContaining({ disposition: 'POSSIBLE' })])
        expect(inspection.visualAnomalies).toEqual([expect.objectContaining({ status: 'UNRESOLVED' })])
    })

    it('preserves the prior debt when Vision 1 is unavailable, even if Vision 2 is also unavailable', () => {
        const next = mergeVisualInspection({
            previous: prior(), generation: 4, inspectedAt: '2026-08-17T00:01:00.000Z',
            detector: { status: 'UNAVAILABLE', evidence: [] },
            mapper: { status: 'UNAVAILABLE', usedVision1Evidence: false, evidenceAssessments: [], structuralConcerns: [] },
        })
        expect(next.visualAnomalies).toEqual([expect.objectContaining({ type: 'EXTRA_LIMB', status: 'UNRESOLVED' })])
    })

    it('keeps repair instructions compact and secondary to the chosen target', () => {
        expect(visualRepairBrief(prior())).toContain('secondary to the selected evolution target')
    })

    it('accepts bounded persisted horizontal-mirror correction metadata', () => {
        const parsed = parseVisualInspection({
            ...prior(),
            assetCorrection: { type: 'HORIZONTAL_MIRROR', appliedAt: '2026-08-17T00:00:01.000Z', outputFacing: 'IMAGE_LEFT', correctedFacing: 'IMAGE_RIGHT' },
        })
        expect(parsed?.assetCorrection).toMatchObject({ type: 'HORIZONTAL_MIRROR', correctedFacing: 'IMAGE_RIGHT' })
    })
})
