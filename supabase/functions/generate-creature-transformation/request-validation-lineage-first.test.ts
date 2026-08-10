import { describe, expect, it } from 'vitest'
import { parseGenerateCurrentPipelineExperimentRequest, parseGenerateLineageFirstExperimentRequest } from './request-validation.ts'

describe('lineage-first request validation', () => {
    const base = { operation: 'GENERATE_LINEAGE_FIRST_EXPERIMENT', creatureId: 'creature-1', evolutionTargetId: 'TAIL', lineage: { identityTraits: ['same emerald hatchling'], acquiredTraits: [{ target: 'TAIL', description: 'segmented fins' }] }, idempotencyKey: 'lineage-1' }

    it('accepts only bounded experimental lineage inputs', () => {
        expect(parseGenerateLineageFirstExperimentRequest(base)).toMatchObject({ valid: true, request: { evolutionTargetId: 'TAIL' } })
        expect(parseGenerateLineageFirstExperimentRequest({ ...base, visualTraitId: 'LOCOMOTION_ADAPTATION' })).toMatchObject({ valid: false, code: 'INVALID_REQUEST' })
    })

    it('requires a UUID when an iterative experimental source is supplied', () => {
        expect(parseGenerateLineageFirstExperimentRequest({ ...base, experimentalSourceRequestId: 'not-a-uuid' })).toMatchObject({ valid: false })
    })

    it('lets pipeline A use the same validated experimental source as pipeline B', () => {
        const current = { operation: 'GENERATE_CURRENT_PIPELINE_EXPERIMENT', creatureId: 'creature-1', evolutionTargetId: 'TAIL', experimentalSourceRequestId: 'a8d5c988-a8f0-4a53-9eee-5af9b3ef759c', idempotencyKey: 'current-1' }
        expect(parseGenerateCurrentPipelineExperimentRequest(current)).toMatchObject({ valid: true, request: { experimentalSourceRequestId: current.experimentalSourceRequestId } })
        expect(parseGenerateCurrentPipelineExperimentRequest({ ...current, experimentalSourceRequestId: 'not-a-uuid' })).toMatchObject({ valid: false, code: 'INVALID_REQUEST' })
    })

    it('accepts only the controlled creative-profile enum and UUID comparison key for A calibration', () => {
        const current = { operation: 'GENERATE_CURRENT_PIPELINE_EXPERIMENT', creatureId: 'creature-1', evolutionTargetId: 'TAIL', creativeProfile: 'EXPRESSIVE', comparisonKey: 'a8d5c988-a8f0-4a53-9eee-5af9b3ef759c', idempotencyKey: 'current-expressive-1' }
        expect(parseGenerateCurrentPipelineExperimentRequest(current)).toMatchObject({ valid: true, request: { creativeProfile: 'EXPRESSIVE', comparisonKey: current.comparisonKey } })
        expect(parseGenerateCurrentPipelineExperimentRequest({ ...current, creativeProfile: 'free-form' })).toMatchObject({ valid: false, code: 'INVALID_REQUEST' })
        expect(parseGenerateCurrentPipelineExperimentRequest({ ...current, comparisonKey: 'not-a-uuid' })).toMatchObject({ valid: false, code: 'INVALID_REQUEST' })
    })
})
