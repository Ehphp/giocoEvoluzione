import { describe, expect, it } from 'vitest'

import { parseGenerateUnlockedTransformationRequest, parseSelectCreatureVisualProgressTrackRequest } from './request-validation.ts'

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

})
