import { describe, expect, it } from 'vitest'

import { parseGenerateUnlockedTransformationRequest, parseSelectCreatureVisualProgressTrackRequest, parseSubmitBackgroundRemovalCandidateRequest } from './request-validation.ts'

const TRACK_ID = '4f083244-18b0-4d1f-93c6-16742388d0a1'

describe('visual progression request validation', () => {
    it('accepts the minimal unlocked-generation contract only', () => {
        expect(parseGenerateUnlockedTransformationRequest({ operation: 'GENERATE_UNLOCKED_TRANSFORMATION', creatureId: 'creature', progressTrackId: TRACK_ID, idempotencyKey: 'key' })).toMatchObject({ valid: true })
        expect(parseGenerateUnlockedTransformationRequest({ operation: 'GENERATE_UNLOCKED_TRANSFORMATION', creatureId: 'creature', progressTrackId: TRACK_ID, idempotencyKey: 'key', model: 'client-controlled' })).toMatchObject({ valid: false })
    })

    it('does not accept gameplay or target fields during trait selection', () => {
        expect(parseSelectCreatureVisualProgressTrackRequest({ operation: 'SELECT_VISUAL_PROGRESS_TRACK', creatureId: 'creature', visualTraitId: 'IMPACT_ADAPTATION' })).toMatchObject({ valid: true })
        expect(parseSelectCreatureVisualProgressTrackRequest({ operation: 'SELECT_VISUAL_PROGRESS_TRACK', creatureId: 'creature', visualTraitId: 'IMPACT_ADAPTATION', target: 99 })).toMatchObject({ valid: false })
    })

    it('accepts only opaque candidate bytes and never client controlled Storage or ownership fields', () => {
        const candidate = { operation: 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE', transformationRequestId: TRACK_ID, candidatePngBase64: 'YWJjZA==' }
        expect(parseSubmitBackgroundRemovalCandidateRequest(candidate)).toMatchObject({ valid: true })
        expect(parseSubmitBackgroundRemovalCandidateRequest({ ...candidate, profileId: 'attacker-profile' })).toMatchObject({ valid: false })
        expect(parseSubmitBackgroundRemovalCandidateRequest({ ...candidate, resultPath: 'candidates/attacker.png' })).toMatchObject({ valid: false })
    })
})
