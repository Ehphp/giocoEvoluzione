import { describe, expect, it } from 'vitest'

import { parseCreatureTransformationRequest, parseGenerateFluxEvolutionChainStepRequest, parseGenerateUnlockedTransformationRequest, parseListVisualBackgroundCleanupRequest, parseRollbackCreatureVisualVersionRequest, parseSelectCreatureVisualProgressTrackRequest, parseSubmitVisualBackgroundCleanupRequest } from './request-validation.ts'

const TRACK_ID = '4f083244-18b0-4d1f-93c6-16742388d0a1'
const CURRENT_VERSION_ID = 'a62b2b0a-0aa9-4c3c-884a-ddd26785c504'

describe('visual progression request validation', () => {
    it('accepts the minimal unlocked-generation contract only', () => {
        expect(parseGenerateUnlockedTransformationRequest({ operation: 'GENERATE_UNLOCKED_TRANSFORMATION', creatureId: 'creature', progressTrackId: TRACK_ID, idempotencyKey: 'key' })).toMatchObject({ valid: true })
        expect(parseGenerateUnlockedTransformationRequest({ operation: 'GENERATE_UNLOCKED_TRANSFORMATION', creatureId: 'creature', progressTrackId: TRACK_ID, idempotencyKey: 'key', model: 'client-controlled' })).toMatchObject({ valid: false })
        // Production generation can never carry a structural mutation from the client.
        expect(parseGenerateUnlockedTransformationRequest({ operation: 'GENERATE_UNLOCKED_TRANSFORMATION', creatureId: 'creature', progressTrackId: TRACK_ID, idempotencyKey: 'key', bodyPlanMutationId: 'ADD_LIMB_PAIR' })).toMatchObject({ valid: false })
    })

    it('requires exactly one valid evolution target when a track is selected', () => {
        expect(parseSelectCreatureVisualProgressTrackRequest({ operation: 'SELECT_VISUAL_PROGRESS_TRACK', creatureId: 'creature', evolutionTargetId: 'DORSAL_STRUCTURES' })).toMatchObject({ valid: true })
        expect(parseSelectCreatureVisualProgressTrackRequest({ operation: 'SELECT_VISUAL_PROGRESS_TRACK', creatureId: 'creature' })).toMatchObject({ valid: false, code: 'INVALID_EVOLUTION_TARGET' })
        // Legacy taxonomy and legacy trait selection are both refused.
        expect(parseSelectCreatureVisualProgressTrackRequest({ operation: 'SELECT_VISUAL_PROGRESS_TRACK', creatureId: 'creature', evolutionTargetId: 'TORSO_AND_BACK' })).toMatchObject({ valid: false })
        expect(parseSelectCreatureVisualProgressTrackRequest({ operation: 'SELECT_VISUAL_PROGRESS_TRACK', creatureId: 'creature', visualTraitId: 'IMPACT_ADAPTATION' })).toMatchObject({ valid: false })
    })

    it('accepts a structural mutation only from the Lab chain contract and only from the catalogue', () => {
        const base = { operation: 'GENERATE_FLUX_EVOLUTION_CHAIN_STEP', creatureId: 'creature', evolutionTargetId: 'LIMBS_AND_FEET', previousStepRequestIds: [], idempotencyKey: 'key' }

        expect(parseGenerateFluxEvolutionChainStepRequest(base)).toMatchObject({ valid: true })
        expect(parseGenerateFluxEvolutionChainStepRequest({ ...base, promptTemplateVersion: 'flux-micro-v7' })).toMatchObject({ valid: true, request: { promptTemplateVersion: 'flux-micro-v7' } })
        expect(parseGenerateFluxEvolutionChainStepRequest({ ...base, promptTemplateVersion: 'flux-micro-v6' })).toMatchObject({ valid: true, request: { promptTemplateVersion: 'flux-micro-v6' } })
        expect(parseGenerateFluxEvolutionChainStepRequest({ ...base, promptTemplateVersion: 'flux-micro-v5' })).toMatchObject({ valid: true, request: { promptTemplateVersion: 'flux-micro-v5' } })
        expect(parseGenerateFluxEvolutionChainStepRequest({ ...base, promptTemplateVersion: 'flux-minimal-v1' })).toMatchObject({ valid: true, request: { promptTemplateVersion: 'flux-minimal-v1' } })
        expect(parseGenerateFluxEvolutionChainStepRequest({ ...base, promptTemplateVersion: 'flux-minimal-v2' })).toMatchObject({ valid: false })
        expect(parseGenerateFluxEvolutionChainStepRequest({ ...base, bodyPlanMutationId: 'ADD_LIMB_PAIR' })).toMatchObject({ valid: true, request: { bodyPlanMutationId: 'ADD_LIMB_PAIR' } })
        expect(parseGenerateFluxEvolutionChainStepRequest({ ...base, bodyPlanMutationId: 'GROW_EXTRA_HEAD' })).toMatchObject({ valid: false })
        expect(parseGenerateFluxEvolutionChainStepRequest({ ...base, prompt: 'client instructions' })).toMatchObject({ valid: false })
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

    it('no longer implements any legacy concept or image operation', () => {
        for (const operation of ['GENERATE_CONCEPT', 'GENERATE_IMAGE', 'GENERATE_LINEAGE_FIRST_EXPERIMENT', 'GENERATE_CURRENT_PIPELINE_EXPERIMENT', 'GET_BENCHMARK_RESULTS', 'SUBMIT_EXPERIMENT_REVIEW', 'SUBMIT_LINEAGE_COMPARISON_REVIEW', 'GET_LINEAGE_COMPARISON_REVIEWS']) {
            expect(parseCreatureTransformationRequest({ operation, creatureId: 'creature', idempotencyKey: 'key' }), operation)
                .toMatchObject({ valid: false, code: 'OPERATION_NOT_IMPLEMENTED' })
        }
    })
})
