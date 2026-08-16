import { describe, expect, it, vi } from 'vitest'

import { createTestPng } from '../../../shared/creature-transformations/image-test-fixtures.ts'
import { FAL_SEEDREAM_MODEL } from './fal-flux-image-provider.ts'
import { orchestrateGetTransformationRequestStatus, orchestrateRunSeedreamDiagnostic } from './edge-orchestration.ts'
import { readCreatureTransformationLabPolicy } from './lab-policy.ts'
import { createInMemoryRequestRepository } from './test-request-repository.ts'
import { createTestResolver, createTestStorage } from './test-creature-fixtures.ts'

const PROFILE_ID = 'profile-1'
const CREATURE_ID = '00000000-0000-4000-8000-000000000001'

const LAB_ENVIRONMENT: Record<string, string> = {
    CREATURE_TRANSFORMATION_LAB_ENABLED: 'true',
    CREATURE_TRANSFORMATION_LAB_PROFILE_IDS: PROFILE_ID,
    FAL_FLUX_API_KEY: 'seedream-key',
    FAL_FLUX_ESTIMATED_COST_USD: '0.02',
    FAL_FLUX_MAX_ESTIMATED_COST_USD: '0.03',
    CREATURE_TRANSFORMATION_DAILY_BUDGET_USD: '1',
}

function base64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
}

function createInput(options: {
    repository: ReturnType<typeof createInMemoryRequestRepository>
    idempotencyKey: string
    submit?: ReturnType<typeof vi.fn>
    deferBackgroundTask?: ReturnType<typeof vi.fn>
    bodyOverrides?: Record<string, unknown>
    policyOverrides?: Record<string, string>
    generateMicroConcept?: ReturnType<typeof vi.fn>
}) {
    const submit = options.submit ?? vi.fn(async () => ({
        provider: 'fal.ai' as const,
        model: FAL_SEEDREAM_MODEL,
        providerRequestId: 'fal-seedream-diagnostic',
        estimatedCostUsd: 0.02,
    }))
    const input = {
        profileId: PROFILE_ID,
        canGenerateImages: true,
        requestId: `http-${options.idempotencyKey}`,
        body: {
            operation: 'RUN_SEEDREAM_DIAGNOSTIC',
            creatureId: CREATURE_ID,
            evolutionTargetId: 'DORSAL_STRUCTURES',
            idempotencyKey: options.idempotencyKey,
            experimentMode: 'FIXED_FULL_PROMPT',
            fixedFullPrompt: 'Mantieni la creatura e aggiungi una cresta dorsale leggibile.',
            chainMode: 'NONE',
            source: { base64: base64(createTestPng()), mimeType: 'image/png' },
            seedream: {
                imageSize: { width: 1920, height: 2880 },
                numImages: 1,
                maxImages: 1,
                seed: 42,
                syncMode: false,
                enableSafetyChecker: true,
            },
            ...options.bodyOverrides,
        },
        policy: readCreatureTransformationLabPolicy((name) => ({ ...LAB_ENVIRONMENT, ...options.policyOverrides })[name]),
        resolver: createTestResolver(),
        repository: options.repository.repository,
        storage: createTestStorage(),
        visualRepository: { async getVersion() { throw new Error('La diagnostica non deve leggere visuali produttive senza un id sorgente.') } },
        createSeedreamDiagnosticProvider: () => ({ submitSeedreamDiagnostic: submit }),
        ...(options.generateMicroConcept ? { createFluxMicroConceptGenerator: () => ({ generate: options.generateMicroConcept }) } : {}),
        falWebhookUrl: 'https://project.supabase.co/functions/v1/fal-creature-transformation-webhook',
        ...(options.deferBackgroundTask ? { deferBackgroundTask: options.deferBackgroundTask } : {}),
    }
    return { input, submit }
}

describe('Seedream diagnostic orchestration', () => {
    it('submits the Fal queue request and persists RUNNING without requiring a background scheduler', async () => {
        const persistence = createInMemoryRequestRepository()
        const scheduled = vi.fn()
        const context = createInput({ repository: persistence, idempotencyKey: 'seedream-sync', deferBackgroundTask: scheduled })

        const result = await orchestrateRunSeedreamDiagnostic(context.input as never)

        expect(result).toMatchObject({
            success: true,
            accepted: true,
            requestPersistence: { status: 'RUNNING', idempotencyStatus: 'CREATED' },
        })
        expect(context.submit).toHaveBeenCalledWith(expect.objectContaining({
            webhookUrl: 'https://project.supabase.co/functions/v1/fal-creature-transformation-webhook',
            sourceUrl: expect.stringMatching(/^data:image\/png;base64,/),
        }))
        expect(scheduled).not.toHaveBeenCalled()
        expect(persistence.calls).toMatchObject({ markRunning: 1, markSucceeded: 0, markFailed: 0 })
        expect(persistence.get(PROFILE_ID, 'seedream-sync')).toMatchObject({
            status: 'RUNNING',
            providerRequestId: 'fal-seedream-diagnostic',
            sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            falWorkflow: { kind: 'SEEDREAM_DIAGNOSTIC', chainStep: 1 },
        })
    })

    it('persists a failed record when the provider errors', async () => {
        const persistence = createInMemoryRequestRepository()
        const submit = vi.fn(async () => { throw new Error('provider unavailable') })
        const context = createInput({ repository: persistence, idempotencyKey: 'seedream-failure', submit })

        const result = await orchestrateRunSeedreamDiagnostic(context.input as never)

        expect(result).toMatchObject({
            success: false,
            code: 'INTERNAL_ERROR',
            requestPersistence: { status: 'FAILED', idempotencyStatus: 'CREATED' },
        })
        expect(persistence.calls).toMatchObject({ markRunning: 1, markSucceeded: 0, markFailed: 1 })
        expect(persistence.get(PROFILE_ID, 'seedream-failure')).toMatchObject({ status: 'FAILED', errorCode: 'INTERNAL_ERROR' })
    })

    it('persists the locked prompt variant, target and server-owned fixed concept', async () => {
        const persistence = createInMemoryRequestRepository()
        const context = createInput({
            repository: persistence,
            idempotencyKey: 'seedream-locked-fixed',
            bodyOverrides: {
                evolutionTargetId: 'HEAD_AND_CROWN',
                experimentMode: 'fixed-concept-locked-prompt',
                fixedFullPrompt: undefined,
            },
        })

        await expect(orchestrateRunSeedreamDiagnostic(context.input as never)).resolves.toMatchObject({ success: true, accepted: true })
        expect(context.submit).toHaveBeenCalledWith(expect.objectContaining({
            prompt: expect.stringContaining('NEW MUTATION — ORANGE VELVET JUVENILE ANTLERS'),
        }))
        const stored = persistence.get(PROFILE_ID, 'seedream-locked-fixed')
        expect(stored).toMatchObject({
            evolutionTargetId: 'HEAD_AND_CROWN',
            promptTemplateVersion: 'seedream-locked-dynamic-v1',
            promptText: expect.stringContaining('VIEWPOINT LOCK'),
            conceptSnapshot: { conceptName: 'ORANGE VELVET JUVENILE ANTLERS' },
            falWorkflow: {
                variantId: 'fixed-concept-locked-prompt',
                conceptSource: 'fixed',
                promptStrategy: 'lockedDynamic',
            },
        })
        const status = await orchestrateGetTransformationRequestStatus({
            ...context.input,
            requestId: 'http-seedream-locked-fixed-status',
            body: { operation: 'GET_REQUEST_STATUS', transformationRequestId: stored!.id },
        } as never)
        expect(status).toMatchObject({
            success: true,
            diagnostic: {
                variantId: 'fixed-concept-locked-prompt',
                conceptSource: 'fixed',
                promptStrategy: 'lockedDynamic',
                target: 'HEAD_AND_CROWN',
                concept: { conceptName: 'ORANGE VELVET JUVENILE ANTLERS' },
                seed: 42,
            },
        })
    })

    it('interpolates the generated E concept into the persisted and submitted locked prompt', async () => {
        const persistence = createInMemoryRequestRepository()
        const generatedConcept = {
            conceptName: 'TEST_DYNAMIC_MUTATION_123',
            mutationIdea: 'Grow a living crown crest from the existing skull.',
            visualDetails: ['rounded vascular branches'],
            avoid: ['artificial accessories'],
        }
        const generateMicroConcept = vi.fn(async () => generatedConcept)
        const context = createInput({
            repository: persistence,
            idempotencyKey: 'seedream-locked-dynamic',
            generateMicroConcept,
            policyOverrides: { OPENAI_API_KEY: 'concept-key', FLUX_MICRO_CONCEPT_MODEL: 'concept-model' },
            bodyOverrides: {
                evolutionTargetId: 'HEAD_AND_CROWN',
                experimentMode: 'dynamic-concept-locked-prompt',
                fixedFullPrompt: undefined,
            },
        })

        await expect(orchestrateRunSeedreamDiagnostic(context.input as never)).resolves.toMatchObject({ success: true, accepted: true })
        expect(generateMicroConcept).toHaveBeenCalledOnce()
        expect(context.submit).toHaveBeenCalledWith(expect.objectContaining({
            prompt: expect.stringContaining('NEW MUTATION — TEST_DYNAMIC_MUTATION_123'),
        }))
        const stored = persistence.get(PROFILE_ID, 'seedream-locked-dynamic')
        expect(stored).toMatchObject({
            promptTemplateVersion: 'seedream-locked-dynamic-v1',
            promptText: expect.stringContaining(generatedConcept.mutationIdea),
            conceptSnapshot: { conceptName: 'TEST_DYNAMIC_MUTATION_123' },
            falWorkflow: { conceptSource: 'dynamic', promptStrategy: 'lockedDynamic' },
        })
        expect(stored?.promptText).not.toContain('ORANGE VELVET JUVENILE ANTLERS')
    })
})
