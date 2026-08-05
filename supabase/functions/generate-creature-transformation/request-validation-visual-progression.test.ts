import { describe, expect, it } from 'vitest'

import { parseGenerateUnlockedTransformationRequest, parseListVisualBackgroundCleanupRequest, parseRollbackCreatureVisualVersionRequest, parseSelectCreatureVisualProgressTrackRequest, parseSubmitVisualBackgroundCleanupRequest } from './request-validation.ts'

const TRACK_ID = '4f083244-18b0-4d1f-93c6-16742388d0a1'
const CURRENT_VERSION_ID = 'a62b2b0a-0aa9-4c3c-884a-ddd26785c504'

describe('visual progression request validation', () => {
    it('accepts the minimal unlocked-generation contract only', () => {
        expect(parseGenerateUnlockedTransformationRequest({ operation: 'GENERATE_UNLOCKED_TRANSFORMATION', creatureId: 'creature', progressTrackId: TRACK_ID, idempotencyKey: 'key' })).toMatchObject({ valid: true })
        expect(parseGenerateUnlockedTransformationRequest({ operation: 'GENERATE_UNLOCKED_TRANSFORMATION', creatureId: 'creature', progressTrackId: TRACK_ID, idempotencyKey: 'key', model: 'client-controlled' })).toMatchObject({ valid: false })
    })

    it('does not accept gameplay or target fields during trait selection', () => {
        expect(parseSelectCreatureVisualProgressTrackRequest({ operation: 'SELECT_VISUAL_PROGRESS_TRACK', creatureId: 'creature', visualTraitId: 'IMPACT_ADAPTATION' })).toMatchObject({ valid: true })
        expect(parseSelectCreatureVisualProgressTrackRequest({ operation: 'SELECT_VISUAL_PROGRESS_TRACK', creatureId: 'creature', visualTraitId: 'IMPACT_ADAPTATION', target: 99 })).toMatchObject({ valid: false })
    })

    it('accepts only the bounded contracts for visual background cleanup', () => {
        expect(parseListVisualBackgroundCleanupRequest({ operation: 'LIST_VISUAL_BACKGROUND_CLEANUP' })).toMatchObject({ valid: true })
        expect(parseListVisualBackgroundCleanupRequest({ operation: 'LIST_VISUAL_BACKGROUND_CLEANUP', profileId: 'client-controlled' })).toMatchObject({ valid: false })
        expect(parseSubmitVisualBackgroundCleanupRequest({ operation: 'SUBMIT_VISUAL_BACKGROUND_CLEANUP', visualVersionId: TRACK_ID, candidatePngBase64: 'aGVsbG8=' })).toMatchObject({ valid: true })
        expect(parseSubmitVisualBackgroundCleanupRequest({ operation: 'SUBMIT_VISUAL_BACKGROUND_CLEANUP', visualVersionId: TRACK_ID, candidatePngBase64: '' })).toMatchObject({ valid: false })
    })

    it('accepts only the visual version rollback contract', () => {
        const request = {
            operation: 'ROLLBACK_CREATURE_VISUAL_VERSION' as const,
            creatureId: 'creature',
            targetVersionId: TRACK_ID,
            expectedCurrentVisualVersionId: CURRENT_VERSION_ID,
        }

        expect(parseRollbackCreatureVisualVersionRequest(request)).toMatchObject({ valid: true })
        expect(parseRollbackCreatureVisualVersionRequest({ ...request, reason: 'OWNER_CONFIRMED' })).toMatchObject({ valid: false })
    })

})
