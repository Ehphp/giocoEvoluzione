import { describe, expect, it } from 'vitest'

import { classifyExperimentReview, summarizeCreatureTransformationBenchmark, validateExperimentReviewInput } from './experiment-reviews.ts'

const review = {
    transformationRequestId: 'request-1', reviewerProfileId: 'profile-1', createdAt: '2026-08-03T00:00:00.000Z', updatedAt: '2026-08-03T00:00:00.000Z',
    scores: { identityPreservation: 4, facePreservation: 4, poseComposition: 4, traitReadability: 3, styleCoherence: 4, anatomyQuality: 4, technicalQuality: 5, overall: 4 } as const,
    verdict: 'ACCEPTABLE_EXPERIMENT' as const, issueFlags: [] as const, notes: null,
}

describe('experiment reviews and descriptive benchmark metrics', () => {
    it('validates controlled score, flag, verdict and note constraints', () => {
        expect(validateExperimentReviewInput({ scores: review.scores, verdict: review.verdict, issueFlags: [], notes: 'ok' })).toBeNull()
        expect(validateExperimentReviewInput({ scores: { ...review.scores, overall: 6 }, verdict: review.verdict, issueFlags: [] })).toBeTruthy()
        expect(validateExperimentReviewInput({ scores: review.scores, verdict: 'UNKNOWN', issueFlags: [] })).toBeTruthy()
        expect(validateExperimentReviewInput({ scores: review.scores, verdict: review.verdict, issueFlags: ['NOT_A_FLAG'] })).toBeTruthy()
        expect(validateExperimentReviewInput({ scores: review.scores, verdict: review.verdict, issueFlags: [], notes: 'a'.repeat(2001) })).toBeTruthy()
    })

    it('classifies pass, fail and unreviewed without promoting an asset', () => {
        expect(classifyExperimentReview(null)).toBe('UNREVIEWED')
        expect(classifyExperimentReview(review)).toBe('PASS')
        expect(classifyExperimentReview({ ...review, issueFlags: ['FACE_CHANGED'] })).toBe('FAIL')
        expect(classifyExperimentReview({ ...review, issueFlags: ['UNREQUESTED_PALETTE_CHANGE'] })).toBe('FAIL')
    })

    it('aggregates trait, profile, readiness, latency, costs and issue frequencies descriptively', () => {
        const metrics = summarizeCreatureTransformationBenchmark([
            { requestId: 'request-1', benchmarkCaseId: 'case-a', generationProfileId: 'profile-a', visualTraitId: 'IMPACT_ADAPTATION', promptTemplateVersion: 'creature-transformation-v1', status: 'SUCCEEDED', assetReadiness: 'FINAL_ASSET', generationLatencyMs: 100, estimatedCostUsd: 0.2, actualCostUsd: null, review },
            { requestId: 'request-2', benchmarkCaseId: 'case-b', generationProfileId: 'profile-b', visualTraitId: 'AQUATIC_MORPHOLOGY', promptTemplateVersion: 'creature-transformation-v2-experimental', status: 'FAILED', assetReadiness: null, generationLatencyMs: 300, estimatedCostUsd: 0.3, actualCostUsd: 0.25, review: null },
        ])
        expect(metrics).toMatchObject({ generated: 2, succeeded: 1, failed: 1, finalAssets: 1, experimentOnly: 0, estimatedCostUsdTotal: 0.5, actualCostUsdTotal: 0.25, estimatedCostUsdPerAcceptable: 0.5 })
        expect(metrics.latencyMs).toMatchObject({ mean: 200, median: 100, p95: 300 })
        expect(metrics.passRateByTrait.IMPACT_ADAPTATION).toBe(1)
    })
})
