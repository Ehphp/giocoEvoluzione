import { describe, expect, it } from 'vitest'

import {
    parseCreatureTransformationRequest,
    parseDiscardCreatureTransformationRequest,
    parseGenerateUnlockedTransformationRequest,
    parseRollbackCreatureVisualVersionRequest,
} from './request-validation.ts'

const TRACK_ID = '4f083244-18b0-4d1f-93c6-16742388d0a1'
const CURRENT_VERSION_ID = 'a62b2b0a-0aa9-4c3c-884a-ddd26785c504'
const REQUEST_ID = '6c1f0b3e-7f4a-4a52-9d0e-2f5b1c8a7d34'

describe('visual progression request validation', () => {
    it('accepts the minimal unlocked-generation contract only', () => {
        expect(
            parseGenerateUnlockedTransformationRequest({
                operation: 'GENERATE_UNLOCKED_TRANSFORMATION',
                creatureId: 'creature',
                progressTrackId: TRACK_ID,
                idempotencyKey: 'key',
            }),
        ).toMatchObject({ valid: true })
        expect(
            parseGenerateUnlockedTransformationRequest({
                operation: 'GENERATE_UNLOCKED_TRANSFORMATION',
                creatureId: 'creature',
                progressTrackId: TRACK_ID,
                idempotencyKey: 'key',
                model: 'client-controlled',
            }),
        ).toMatchObject({ valid: false })
        // Production generation can never carry a structural mutation from the client.
        expect(
            parseGenerateUnlockedTransformationRequest({
                operation: 'GENERATE_UNLOCKED_TRANSFORMATION',
                creatureId: 'creature',
                progressTrackId: TRACK_ID,
                idempotencyKey: 'key',
                bodyPlanMutationId: 'ADD_LIMB_PAIR',
            }),
        ).toMatchObject({ valid: false })
        // Prompts are server-owned: no client-supplied prompt or template selection is accepted.
        expect(
            parseGenerateUnlockedTransformationRequest({
                operation: 'GENERATE_UNLOCKED_TRANSFORMATION',
                creatureId: 'creature',
                progressTrackId: TRACK_ID,
                idempotencyKey: 'key',
                fixedFullPrompt: 'forbidden',
            }),
        ).toMatchObject({ valid: false })
        expect(
            parseGenerateUnlockedTransformationRequest({
                operation: 'GENERATE_UNLOCKED_TRANSFORMATION',
                creatureId: 'creature',
                progressTrackId: TRACK_ID,
                idempotencyKey: 'key',
                promptTemplateVersion: 'flux-minimal-v1',
            }),
        ).toMatchObject({ valid: false })
    })

    it('accepts only the visual version rollback contract', () => {
        const request = {
            operation: 'ROLLBACK_CREATURE_VISUAL_VERSION' as const,
            creatureId: 'creature',
            targetVersionId: TRACK_ID,
            expectedCurrentVisualVersionId: CURRENT_VERSION_ID,
        }

        expect(parseRollbackCreatureVisualVersionRequest(request)).toMatchObject({ valid: true })
        expect(parseRollbackCreatureVisualVersionRequest({ ...request, reason: 'OWNER_CONFIRMED' })).toMatchObject({
            valid: false,
        })
    })

    it('accepts only the discard contract', () => {
        const request = {
            operation: 'DISCARD_CREATURE_TRANSFORMATION' as const,
            creatureId: 'creature',
            progressTrackId: TRACK_ID,
            transformationRequestId: REQUEST_ID,
        }

        expect(parseDiscardCreatureTransformationRequest(request)).toMatchObject({ valid: true })
        // Discarding closes a path; it can never carry progression the client made up.
        expect(parseDiscardCreatureTransformationRequest({ ...request, wins: 99 })).toMatchObject({
            valid: false,
        })
        // Discarding must name the exact proposal it is rejecting.
        expect(parseDiscardCreatureTransformationRequest({ ...request, transformationRequestId: undefined })).toMatchObject({
            valid: false,
        })
    })

    it('implements only the operations the game actually calls', () => {
        const implemented = [
            'GET_REQUEST_STATUS',
            'GENERATE_UNLOCKED_TRANSFORMATION',
            'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE',
            'GET_VISUAL_PROGRESS',
            'GET_CURRENT_VISUAL',
            'GET_GAME_VISUALS',
            'ADOPT_CREATURE_TRANSFORMATION',
            'DISCARD_CREATURE_TRANSFORMATION',
            'ROLLBACK_CREATURE_VISUAL_VERSION',
        ]

        for (const operation of implemented) {
            // A bare body is rejected on its own contract, never as an unknown operation.
            expect(parseCreatureTransformationRequest({ operation }), operation).not.toMatchObject({
                code: 'OPERATION_NOT_IMPLEMENTED',
            })
        }
    })

    it('no longer implements the retired lab, diagnostic and legacy operations', () => {
        const retired = [
            // Retired with the transformation lab and the background-cleanup screen.
            'GENERATE_FLUX_EVOLUTION_CHAIN_STEP',
            'RUN_SEEDREAM_DIAGNOSTIC',
            'GET_LAB_USAGE',
            'GET_GENERATED_IMAGE_CATALOG',
            'LIST_VISUAL_BACKGROUND_CLEANUP',
            'SUBMIT_VISUAL_BACKGROUND_CLEANUP',
            // Superseded by the `open_evolution_track_from_ready_target` database routine.
            'SELECT_VISUAL_PROGRESS_TRACK',
            // Legacy concept and image operations.
            'GENERATE_CONCEPT',
            'GENERATE_IMAGE',
            'GENERATE_LINEAGE_FIRST_EXPERIMENT',
            'GENERATE_CURRENT_PIPELINE_EXPERIMENT',
            'GET_BENCHMARK_RESULTS',
            'SUBMIT_EXPERIMENT_REVIEW',
            'SUBMIT_LINEAGE_COMPARISON_REVIEW',
            'GET_LINEAGE_COMPARISON_REVIEWS',
        ]

        for (const operation of retired) {
            expect(
                parseCreatureTransformationRequest({ operation, creatureId: 'creature', idempotencyKey: 'key' }),
                operation,
            ).toMatchObject({ valid: false, code: 'OPERATION_NOT_IMPLEMENTED' })
        }
    })
})
