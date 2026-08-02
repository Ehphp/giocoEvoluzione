import { describe, expect, it } from 'vitest'

import { createValidConcept } from '../../../shared/creature-transformations/concept-test-fixtures.ts'
import { createTestPng } from '../../../shared/creature-transformations/image-test-fixtures.ts'
import { CreatureImageProviderError, type CreatureImageProvider } from '../../../shared/creature-transformations/image-generation.ts'
import { NoopImagePostProcessor } from '../../../shared/creature-transformations/image-post-processor.ts'
import type { CreatureTransformationLabPolicy } from './lab-policy.ts'
import { orchestrateGenerateImage, orchestrateGetTransformationRequestStatus } from './edge-orchestration.ts'
import { SupabaseCreatureIdentityResolver, type PlayerCreatureRepository } from './supabase-creature-identity-resolver.ts'
import { SupabaseCreatureTransformationStorageAdapter, type CreatureTransformationStorageClient } from './supabase-creature-transformation-storage.ts'
import { createInMemoryRequestRepository } from './test-request-repository.ts'

const policy: CreatureTransformationLabPolicy = {
    enabled: true,
    allowedConceptModes: new Set(['MOCK']),
    allowedImageProviderModes: new Set(['MOCK']),
    signedUrlTtlSeconds: 300,
    dailyRequestLimit: 10,
    dailyBudgetUsd: 1,
    staleRequestSeconds: 900,
    realImage: {
        enabled: true, provider: 'OPENAI', allowedProfileIds: new Set(['profile-1']), apiKey: 'not-a-real-key', model: 'configured-image-model',
        quality: 'medium', timeoutMs: 120000, estimatedCostUsd: 0.12,
    },
}

function request(overrides: Record<string, unknown> = {}) {
    return {
        operation: 'GENERATE_IMAGE', creatureId: 'creature-1', concept: { ...createValidConcept(), identityToPreserve: ['grandi occhi ambrati', 'corpo verde squamoso e tozzo', 'cresta dorsale di spine fogliari'] }, imageProviderMode: 'REAL', idempotencyKey: 'real-key-1', ...overrides,
    }
}

function resolver(owner = 'profile-1') {
    const repository: PlayerCreatureRepository = {
        async findByCreatureId() {
            return { id: 'creature-1', profileId: owner, baseCreatureKey: 'VERDANT_HATCHLING' }
        },
    }
    return new SupabaseCreatureIdentityResolver(repository)
}

function storage() {
    const uploadCalls: string[] = []
    const client: CreatureTransformationStorageClient = {
        from: () => ({
            download: async () => ({ data: new Blob([createTestPng()], { type: 'image/png' }), error: null }),
            upload: async (path) => { uploadCalls.push(path); return { error: null } },
            createSignedUrl: async (path) => ({ data: { signedUrl: `https://signed.example/${path}` }, error: null }),
        }),
    }
    return { adapter: new SupabaseCreatureTransformationStorageAdapter(client, { now: () => 0 }), uploadCalls }
}

function input(overrides: Partial<Parameters<typeof orchestrateGenerateImage>[0]> = {}) {
    const stored = storage()
    const requests = createInMemoryRequestRepository()
    const tasks: Promise<void>[] = []
    const provider: CreatureImageProvider = {
        async transformCreature() {
            return {
                image: createTestPng({ colorType: 2 }), mimeType: 'image/png', provider: 'openai-image-api', model: 'configured-image-model', isMock: false,
                providerRequestId: 'openai-request-1', latencyMs: 25, estimatedCostUsd: 0.12, warnings: [],
            }
        },
    }
    return {
        profileId: 'profile-1', requestId: 'http-real-1', body: request(), policy, resolver: resolver(), storage: stored.adapter,
        createImageProvider: () => { throw new Error('mock provider must not be used') }, createRealImageProvider: () => provider,
        deferBackgroundTask: (task: Promise<void>) => { tasks.push(task) }, postProcessor: new NoopImagePostProcessor(), repository: requests.repository,
        ...overrides,
        test: { stored, requests, tasks },
    }
}

describe('REAL image asynchronous orchestration', () => {
    it('accepts one request, completes it in the background and keeps a raw no-alpha result experiment-only', async () => {
        const prepared = input()
        const result = await orchestrateGenerateImage(prepared)
        expect(result).toMatchObject({ success: true, accepted: true, requestPersistence: { status: 'RUNNING', idempotencyStatus: 'CREATED', estimatedCostUsd: 0.12 } })
        expect(prepared.test.tasks).toHaveLength(1)
        await prepared.test.tasks[0]
        expect(prepared.test.requests.get('profile-1', 'real-key-1')).toMatchObject({
            status: 'SUCCEEDED', provider: 'openai-image-api', model: 'configured-image-model', providerRequestId: 'openai-request-1',
            sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/), resultSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            assetReadiness: 'EXPERIMENT_ONLY', validationWarnings: ['RAW_RESULT_ALPHA_MISSING'], estimatedCostUsd: 0.12, actualCostUsd: null,
        })
        expect(prepared.test.stored.uploadCalls).toHaveLength(1)

        const status = await orchestrateGetTransformationRequestStatus({ ...prepared, requestId: 'status-1', body: { operation: 'GET_REQUEST_STATUS', transformationRequestId: '00000000-0000-4000-8000-000000000001' } })
        expect(status).toMatchObject({ success: true, requestPersistence: { status: 'SUCCEEDED' }, generation: { providerRequestId: 'openai-request-1' }, result: { assetReadiness: 'EXPERIMENT_ONLY', warnings: ['RAW_RESULT_ALPHA_MISSING'] } })
        expect(JSON.stringify(status)).not.toContain('resultPath')
    })

    it('does not schedule a second task for the same running key and keeps failed records terminal', async () => {
        let providerCalls = 0
        let release: (() => void) | null = null
        let providerStartedResolve: (() => void) | null = null
        const wait = new Promise<void>((resolve) => { release = resolve })
        const providerStarted = new Promise<void>((resolve) => { providerStartedResolve = resolve })
        const realProvider: CreatureImageProvider = {
            async transformCreature() {
                providerCalls += 1
                providerStartedResolve?.()
                await wait
                const changed = createTestPng()
                changed[48] = 42
                return { image: changed, mimeType: 'image/png', provider: 'openai-image-api', model: 'configured-image-model', isMock: false, latencyMs: 1, estimatedCostUsd: 0.12, warnings: [] }
            },
        }
        const prepared = input({ createRealImageProvider: () => realProvider })
        await expect(orchestrateGenerateImage(prepared)).resolves.toMatchObject({ accepted: true, requestPersistence: { idempotencyStatus: 'CREATED' } })
        await providerStarted
        await expect(orchestrateGenerateImage({ ...prepared, requestId: 'http-real-2' })).resolves.toMatchObject({ accepted: true, requestPersistence: { idempotencyStatus: 'EXISTING', status: 'RUNNING' } })
        expect(prepared.test.tasks).toHaveLength(1)
        expect(providerCalls).toBe(1)
        release?.()
        await prepared.test.tasks[0]
        expect(prepared.test.stored.uploadCalls).toHaveLength(1)

        const failed = input({
            body: request({ idempotencyKey: 'real-provider-failure' }),
            createRealImageProvider: () => ({ async transformCreature() { throw new CreatureImageProviderError('OPENAI_IMAGE_RATE_LIMITED', 'rate') } }),
        })
        await orchestrateGenerateImage(failed)
        await failed.test.tasks[0]
        expect(failed.test.requests.get('profile-1', 'real-provider-failure')).toMatchObject({ status: 'FAILED', errorCode: 'OPENAI_IMAGE_RATE_LIMITED' })
        await expect(orchestrateGenerateImage({ ...failed, requestId: 'repeat-failed' })).resolves.toMatchObject({ code: 'REQUEST_PREVIOUSLY_FAILED' })
        expect(failed.test.tasks).toHaveLength(1)
    })

    it('enforces backend disablement, allowlist, cost configuration and owner-only status access', async () => {
        await expect(orchestrateGenerateImage(input({ policy: { ...policy, realImage: { ...policy.realImage, enabled: false } } }))).resolves.toMatchObject({ code: 'REAL_IMAGE_PROVIDER_DISABLED' })
        await expect(orchestrateGenerateImage(input({ policy: { ...policy, realImage: { ...policy.realImage, allowedProfileIds: new Set() } } }))).resolves.toMatchObject({ code: 'REAL_IMAGE_PROVIDER_NOT_ALLOWED' })
        await expect(orchestrateGenerateImage(input({ policy: { ...policy, realImage: { ...policy.realImage, estimatedCostUsd: null } } }))).resolves.toMatchObject({ code: 'REAL_IMAGE_PROVIDER_NOT_CONFIGURED' })

        const prepared = input()
        await orchestrateGenerateImage(prepared)
        await prepared.test.tasks[0]
        await expect(orchestrateGetTransformationRequestStatus({ ...prepared, profileId: 'profile-2', requestId: 'status-other-profile', body: { operation: 'GET_REQUEST_STATUS', transformationRequestId: '00000000-0000-4000-8000-000000000001' } }))
            .resolves.toMatchObject({ code: 'REQUEST_NOT_FOUND' })
    })
})
