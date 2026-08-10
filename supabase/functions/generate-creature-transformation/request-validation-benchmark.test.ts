import { describe, expect, it } from 'vitest'

import { createValidConcept } from '../../../shared/creature-transformations/concept-test-fixtures.ts'
import { parseGenerateImageRequest, parseGetGeneratedImageCatalogRequest, parseSubmitExperimentReviewRequest } from './request-validation.ts'

describe('benchmark request validation', () => {
    it('accepts only paired benchmark case and controlled profile identifiers', () => {
        expect(parseGenerateImageRequest({ operation: 'GENERATE_IMAGE', creatureId: 'creature-1', concept: createValidConcept(), imageProviderMode: 'REAL', idempotencyKey: 'key-1', benchmarkCaseId: 'baseline-impact-adaptation-i2', generationProfileId: 'openai-medium-v1' })).toMatchObject({ valid: true })
        expect(parseGenerateImageRequest({ operation: 'GENERATE_IMAGE', creatureId: 'creature-1', concept: createValidConcept(), imageProviderMode: 'REAL', idempotencyKey: 'key-1', benchmarkCaseId: 'baseline-impact-adaptation-i2' })).toMatchObject({ valid: false })
        expect(parseGenerateImageRequest({ operation: 'GENERATE_IMAGE', creatureId: 'creature-1', concept: createValidConcept(), imageProviderMode: 'REAL', idempotencyKey: 'key-1', model: 'client-override' })).toMatchObject({ valid: false })
    })

    it('rejects non-controlled review scores, flags and verdicts before persistence', () => {
        expect(parseSubmitExperimentReviewRequest({ operation: 'SUBMIT_EXPERIMENT_REVIEW', transformationRequestId: '00000000-0000-4000-8000-000000000001', scores: { identityPreservation: 4, facePreservation: 4, poseComposition: 4, traitReadability: 3, styleCoherence: 4, anatomyQuality: 4, technicalQuality: 4, overall: 4 }, verdict: 'PROMISING', issueFlags: [] })).toMatchObject({ valid: true })
        expect(parseSubmitExperimentReviewRequest({ operation: 'SUBMIT_EXPERIMENT_REVIEW', transformationRequestId: '00000000-0000-4000-8000-000000000001', scores: {}, verdict: 'UNKNOWN', issueFlags: ['ARBITRARY'] })).toMatchObject({ valid: false })
    })

    it('accepts only bounded pages for the generated image catalog', () => {
        expect(parseGetGeneratedImageCatalogRequest({ operation: 'GET_GENERATED_IMAGE_CATALOG' })).toMatchObject({ valid: true })
        expect(parseGetGeneratedImageCatalogRequest({ operation: 'GET_GENERATED_IMAGE_CATALOG', page: 4 })).toMatchObject({ valid: true, request: { page: 4 } })
        expect(parseGetGeneratedImageCatalogRequest({ operation: 'GET_GENERATED_IMAGE_CATALOG', page: -1 })).toMatchObject({ valid: false })
        expect(parseGetGeneratedImageCatalogRequest({ operation: 'GET_GENERATED_IMAGE_CATALOG', page: 1.2 })).toMatchObject({ valid: false })
        expect(parseGetGeneratedImageCatalogRequest({ operation: 'GET_GENERATED_IMAGE_CATALOG', page: 1000 })).toMatchObject({ valid: false })
        expect(parseGetGeneratedImageCatalogRequest({ operation: 'GET_GENERATED_IMAGE_CATALOG', cursor: 'client-controlled' })).toMatchObject({ valid: false })
    })
})
