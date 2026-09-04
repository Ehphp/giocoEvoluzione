import { describe, expect, it } from 'vitest'

import {
    MAX_CREATURE_HEIGHT_METERS,
    MIN_CREATURE_HEIGHT_METERS,
    RELATIVE_HEIGHT_CONFIDENCE_THRESHOLD,
    createRelativeHeightComparison,
    getRelativeHeightMultiplier,
    parseRelativeHeightAssessment,
    parseRelativeHeightComparison,
    resolveRelativeHeightResult,
} from './relative-height-comparison.ts'

describe('relative height comparison', () => {
    const completeAssessment = {
        status: 'COMPLETE' as const,
        change: 'TALLER' as const,
        confidence: 0.8,
        confounders: [],
        shortReason: 'The bearing body is visibly taller.',
    }

    it('accepts only the bounded comparison response contract', () => {
        expect(parseRelativeHeightAssessment(completeAssessment)).toEqual(completeAssessment)
        expect(parseRelativeHeightAssessment({ ...completeAssessment, unknown: true })).toBeNull()
        expect(parseRelativeHeightAssessment({ ...completeAssessment, confidence: Number.NaN })).toBeNull()
        expect(parseRelativeHeightAssessment({ ...completeAssessment, confounders: ['NOT_A_CONFOUNDER'] })).toBeNull()
    })

    it('keeps the legacy height contract valid while accepting at most four regional proportion findings', () => {
        const enriched = parseRelativeHeightAssessment({
            ...completeAssessment,
            proportionFindings: [
                {
                    region: 'TRUNK',
                    change: 'INTRODUCED',
                    authorization: 'AUTHORIZED',
                    confidence: .95,
                    reason: 'The trunk length follows the selected target.',
                },
                {
                    region: 'NECK',
                    change: 'INTRODUCED',
                    authorization: 'UNAUTHORIZED',
                    confidence: .9,
                    reason: 'The neck elongation is unrelated to the target.',
                },
            ],
        })

        expect(enriched?.proportionFindings).toHaveLength(2)
        expect(
            parseRelativeHeightAssessment({
                ...completeAssessment,
                proportionFindings: Array.from({ length: 5 }, () => ({
                    region: 'HEAD',
                    change: 'PREEXISTING',
                    authorization: 'NOT_APPLICABLE',
                    confidence: .8,
                    reason: 'Too many findings.',
                })),
            }),
        ).toBeNull()
    })

    it('maps each relative category deterministically', () => {
        expect(getRelativeHeightMultiplier('MUCH_SHORTER')).toBe(0.85)
        expect(getRelativeHeightMultiplier('SHORTER')).toBe(0.93)
        expect(getRelativeHeightMultiplier('UNCHANGED')).toBe(1)
        expect(getRelativeHeightMultiplier('TALLER')).toBe(1.08)
        expect(getRelativeHeightMultiplier('MUCH_TALLER')).toBe(1.18)
    })

    it('uses only complete, sufficiently confident and comparable assessments', () => {
        expect(
            resolveRelativeHeightResult({ sourceHeightMeters: 1.4, assessment: completeAssessment }),
        ).toBeCloseTo(1.512)
        expect(
            resolveRelativeHeightResult({
                sourceHeightMeters: 1.4,
                assessment: { ...completeAssessment, confidence: RELATIVE_HEIGHT_CONFIDENCE_THRESHOLD - 0.01 },
            }),
        ).toBe(1.4)
        expect(
            resolveRelativeHeightResult({
                sourceHeightMeters: 1.4,
                assessment: { ...completeAssessment, status: 'AMBIGUOUS' },
            }),
        ).toBe(1.4)
        expect(
            resolveRelativeHeightResult({
                sourceHeightMeters: 1.4,
                assessment: { ...completeAssessment, confounders: ['FEET_NOT_VISIBLE'] },
            }),
        ).toBe(1.4)
    })

    it('falls back safely for unavailable assessments and invalid legacy source data', () => {
        expect(resolveRelativeHeightResult({ sourceHeightMeters: Number.NaN, assessment: null })).toBe(1.4)
        expect(
            resolveRelativeHeightResult({
                sourceHeightMeters: 1.4,
                assessment: {
                    ...completeAssessment,
                    status: 'UNAVAILABLE',
                    confidence: 0,
                    shortReason: 'The provider was unavailable.',
                },
            }),
        ).toBe(1.4)
    })

    it('clamps accepted biological results at both bounds', () => {
        expect(
            resolveRelativeHeightResult({
                sourceHeightMeters: 0.1,
                assessment: { ...completeAssessment, change: 'MUCH_SHORTER' },
            }),
        ).toBe(MIN_CREATURE_HEIGHT_METERS)
        expect(
            resolveRelativeHeightResult({
                sourceHeightMeters: 10,
                assessment: { ...completeAssessment, change: 'MUCH_TALLER' },
            }),
        ).toBe(MAX_CREATURE_HEIGHT_METERS)
    })

    it('persists a validated absolute value and rejects tampered or unusable comparisons', () => {
        const comparison = createRelativeHeightComparison({
            sourceVersionId: 'version-2',
            sourceHeightMeters: 1.4,
            assessment: completeAssessment,
        })
        expect(comparison).toEqual({
            schemaVersion: 'relative-height-v1',
            sourceVersionId: 'version-2',
            sourceHeightMeters: 1.4,
            resultHeightMeters: 1.512,
            change: 'TALLER',
            confidence: 0.8,
            confounders: [],
        })
        expect(parseRelativeHeightComparison(comparison)).toEqual(comparison)
        expect(parseRelativeHeightComparison({ ...comparison!, resultHeightMeters: 1.7 })).toBeNull()
        expect(
            createRelativeHeightComparison({
                sourceVersionId: 'version-2',
                sourceHeightMeters: 1.4,
                assessment: { ...completeAssessment, status: 'AMBIGUOUS' },
            }),
        ).toBeNull()
    })
})
