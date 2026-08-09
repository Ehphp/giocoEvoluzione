import { describe, expect, it, vi } from 'vitest'

import { createValidConcept } from '../../../shared/creature-transformations/concept-test-fixtures.ts'
import { createTestPng } from '../../../shared/creature-transformations/image-test-fixtures.ts'
import type { CreatureImageProvider } from '../../../shared/creature-transformations/image-generation.ts'
import { ImageValidator } from '../../../shared/creature-transformations/image-validator.ts'
import { MockCreatureImageProvider } from '../../../shared/creature-transformations/mock-creature-image-provider.ts'
import { orchestrateGenerateImage } from './edge-orchestration.ts'
import type { CreatureTransformationLabPolicy } from './lab-policy.ts'
import {
    SupabaseCreatureTransformationStorageAdapter,
    type CreatureTransformationStorageClient,
} from './supabase-creature-transformation-storage.ts'
import { SupabaseCreatureIdentityResolver, type PlayerCreatureRepository } from './supabase-creature-identity-resolver.ts'
import { createInMemoryRequestRepository } from './test-request-repository.ts'

const identityFeatures = ['grandi occhi ambrati', 'corpo squamoso e tozzo', 'cresta dorsale di spine fogliari']
const policy: CreatureTransformationLabPolicy = {
    enabled: true,
    allowedConceptModes: new Set(['MOCK']),
    allowedImageProviderModes: new Set(['MOCK']),
    signedUrlTtlSeconds: 300,
    dailyRequestLimit: 10,
    dailyBudgetUsd: 0,
    staleRequestSeconds: 900,
    realImage: { enabled: true, provider: null, allowedProfileIds: new Set(['profile-1']), apiKey: null, model: null, quality: 'medium', timeoutMs: 120000, estimatedCostUsd: null, maxEstimatedCostUsd: null },
}

function canonicalConcept() {
    return { ...createValidConcept(), identityToPreserve: [...identityFeatures] }
}

function request(overrides: Record<string, unknown> = {}) {
    return {
        operation: 'GENERATE_IMAGE',
        creatureId: 'creature-1',
        concept: canonicalConcept(),
        imageProviderMode: 'MOCK',
        idempotencyKey: 'intentional-image-click',
        ...overrides,
    }
}

function createResolver(owner = 'profile-1') {
    const repository: PlayerCreatureRepository = {
        async findByCreatureId() {
            return { id: 'creature-1', profileId: owner, baseCreatureKey: 'VERDANT_HATCHLING' }
        },
    }
    return new SupabaseCreatureIdentityResolver(repository)
}

function createStorage(options: { source?: Uint8Array; uploadError?: boolean; signedError?: boolean; signedUrlAt?: (attempt: number) => string } = {}) {
    const upload = vi.fn(async () => ({ error: options.uploadError ? { message: 'upload failed' } : null }))
    let signedUrlAttempt = 0
    const createSignedUrl = vi.fn(async () => ({
        data: options.signedError ? null : { signedUrl: options.signedUrlAt?.(++signedUrlAttempt) ?? 'https://signed.example/result.png' },
        error: options.signedError ? { message: 'signed failed' } : null,
    }))
    const client: CreatureTransformationStorageClient = {
        from: vi.fn(() => ({
            download: async () => ({ data: new Blob([options.source ?? createTestPng()], { type: 'image/png' }), error: null }),
            upload,
            createSignedUrl,
        })),
    }
    return {
        adapter: new SupabaseCreatureTransformationStorageAdapter(client, { now: () => 0 }),
        upload,
        createSignedUrl,
    }
}

function orchestrationInput(overrides: Partial<Parameters<typeof orchestrateGenerateImage>[0]> = {}) {
    const storage = createStorage()
    return {
        profileId: 'profile-1',
        requestId: 'request-image-1',
        body: request(),
        policy,
        resolver: createResolver(),
        storage: storage.adapter,
        createImageProvider: () => new MockCreatureImageProvider(),
        repository: createInMemoryRequestRepository().repository,
        ...overrides,
    }
}

describe('GENERATE_IMAGE edge orchestration', () => {
    it('revalidates the submitted concept, recomposes prompt server-side, validates twice and returns only public result data', async () => {
        let capturedPrompt = ''
        const provider: CreatureImageProvider = {
            async transformCreature(input) {
                capturedPrompt = input.prompt
                return {
                    image: input.source.bytes.slice(), mimeType: 'image/png', provider: 'test-mock', model: 'test-copy',
                    isMock: true, latencyMs: 4, estimatedCostUsd: 0, warnings: ['MOCK_PROVIDER_NO_VISUAL_TRANSFORMATION'],
                }
            },
        }
        class CountingValidator extends ImageValidator {
            count = 0
            override async validate(input: Parameters<ImageValidator['validate']>[0]) {
                this.count += 1
                return super.validate(input)
            }
        }
        const validator = new CountingValidator()
        const result = await orchestrateGenerateImage(orchestrationInput({ createImageProvider: () => provider, validator }))

        expect(result).toMatchObject({
            success: true,
            generation: { provider: 'test-mock', model: 'test-copy', isMock: true, estimatedCostUsd: 0 },
            result: { signedUrl: 'https://signed.example/result.png', mimeType: 'image/png', width: 1024, height: 1536 },
            validation: { warnings: expect.arrayContaining(['MOCK_PROVIDER_NO_VISUAL_TRANSFORMATION', 'RESULT_IMAGE_UNCHANGED_MOCK']) },
        })
        expect(capturedPrompt).toContain('IDENTITY')
        expect(capturedPrompt).toContain('Guscio ammortizzato')
        expect(validator.count).toBe(2)
        expect(JSON.stringify(result)).not.toContain('verdant-hatchling-v1.png')
        expect(JSON.stringify(result)).not.toContain('profile-1')
    })

    it('accepts a server-owned opaque A/B result as the source for the next experimental round', async () => {
        class SourceAwareValidator extends ImageValidator {
            calls: Parameters<ImageValidator['validate']>[0][] = []
            override async validate(input: Parameters<ImageValidator['validate']>[0]) {
                this.calls.push(input)
                return super.validate(input)
            }
        }
        const validator = new SourceAwareValidator()
        const result = await orchestrateGenerateImage(orchestrationInput({
            experimentalSourcePath: `experiments/raw/profile-1/${'a'.repeat(64)}.png`,
            validator,
        }))

        expect(result).toMatchObject({ success: true })
        expect(validator.calls[0]).toMatchObject({ requireAlpha: false })
    })

    it('accepts a schema-v2 anatomical concept when generating its image', async () => {
        const targetConcept = {
            ...canonicalConcept(),
            schemaVersion: 2 as const,
            visualTrait: 'SENSORY_EXPANSION' as const,
            evolutionTargetId: 'HEAD_AND_SENSES' as const,
            evolutionFunction: 'PERCEPTION' as const,
            primaryMutation: {
                mutationArchetype: 'SENSORY_FRILLS' as const,
                bodyAreas: ['HEAD_SURFACE'] as const,
                supportingBodyAreas: [] as string[],
                morphology: 'Sottili frange sensoriali lungo la superficie del capo.',
                material: 'Cheratina flessibile e iridescente.',
            },
            colorEvolution: {
                mode: 'EXPAND' as const,
                dominantColor: 'verde smeraldo',
                secondaryColors: ['turchese'],
                accentColors: ['oro tenue'],
                surfaceEffects: ['riflessi iridescenti'],
                affectedBodyAreas: ['NECK'] as const,
                intensity: 2 as const,
                biologicalRationale: 'Le frange sul collo migliorano la lettura delle vibrazioni ambientali.',
            },
        }

        await expect(orchestrateGenerateImage(orchestrationInput({ body: request({ concept: targetConcept }) }))).resolves.toMatchObject({ success: true })
    })

    it('enforces authentication, ownership, policy, concept validation and refuses every REAL request', async () => {
        await expect(orchestrateGenerateImage(orchestrationInput({ profileId: null }))).resolves.toMatchObject({ code: 'UNAUTHENTICATED' })
        await expect(orchestrateGenerateImage(orchestrationInput({ resolver: createResolver('profile-2') }))).resolves.toMatchObject({ code: 'CREATURE_NOT_OWNED' })
        await expect(orchestrateGenerateImage(orchestrationInput({ policy: { ...policy, enabled: false } }))).resolves.toMatchObject({ code: 'LAB_DISABLED' })
        await expect(orchestrateGenerateImage(orchestrationInput({ policy: { ...policy, allowedImageProviderModes: new Set() } }))).resolves.toMatchObject({ code: 'IMAGE_PROVIDER_MODE_NOT_ALLOWED' })
        await expect(orchestrateGenerateImage(orchestrationInput({ body: request({ imageProviderMode: 'REAL' }) }))).resolves.toMatchObject({ code: 'REAL_IMAGE_PROVIDER_NOT_CONFIGURED' })
        await expect(orchestrateGenerateImage(orchestrationInput({ body: request({ concept: { ...canonicalConcept(), schemaVersion: 2 } }) }))).resolves.toMatchObject({ code: 'CONCEPT_REJECTED' })
        await expect(orchestrateGenerateImage(orchestrationInput({ body: request({ sourceImagePath: 'client-controlled.png', prompt: 'client-controlled' }) }))).resolves.toMatchObject({ code: 'INVALID_REQUEST' })
    })

    it('maps provider, output, upload and signed-url failures without persisting source copies', async () => {
        await expect(orchestrateGenerateImage(orchestrationInput({ createImageProvider: () => new MockCreatureImageProvider({ behavior: 'FAILURE' }) }))).resolves.toMatchObject({ code: 'MOCK_PROVIDER_FAILED' })
        await expect(orchestrateGenerateImage(orchestrationInput({ createImageProvider: () => new MockCreatureImageProvider({ behavior: 'TIMEOUT' }) }))).resolves.toMatchObject({ code: 'IMAGE_PROVIDER_TIMEOUT' })
        await expect(orchestrateGenerateImage(orchestrationInput({ createImageProvider: () => new MockCreatureImageProvider({ behavior: 'EMPTY_OUTPUT' }) }))).resolves.toMatchObject({ code: 'RESULT_IMAGE_EMPTY' })
        await expect(orchestrateGenerateImage(orchestrationInput({ createImageProvider: () => new MockCreatureImageProvider({ behavior: 'INVALID_PNG_OUTPUT' }) }))).resolves.toMatchObject({ code: 'RESULT_IMAGE_INVALID' })

        const invalidSource = createStorage({ source: new Uint8Array([0, 1, 2]) })
        await expect(orchestrateGenerateImage(orchestrationInput({ storage: invalidSource.adapter }))).resolves.toMatchObject({ code: 'SOURCE_IMAGE_INVALID' })

        const uploadFailure = createStorage({ uploadError: true })
        await expect(orchestrateGenerateImage(orchestrationInput({ storage: uploadFailure.adapter }))).resolves.toMatchObject({ code: 'STORAGE_UPLOAD_FAILED' })
        const signedFailure = createStorage({ signedError: true })
        await expect(orchestrateGenerateImage(orchestrationInput({ storage: signedFailure.adapter }))).resolves.toMatchObject({ code: 'SIGNED_URL_FAILED' })
    })

    it('persists image failures as FAILED without bytes or signed URLs', async () => {
        const providerRepository = createInMemoryRequestRepository()
        const providerFailure = await orchestrateGenerateImage(orchestrationInput({
            body: request({ idempotencyKey: 'image-provider-failure' }), repository: providerRepository.repository,
            createImageProvider: () => new MockCreatureImageProvider({ behavior: 'FAILURE' }),
        }))
        expect(providerFailure).toMatchObject({ success: false, code: 'MOCK_PROVIDER_FAILED', requestPersistence: { status: 'FAILED' } })
        expect(providerRepository.get('profile-1', 'image-provider-failure')).toMatchObject({ status: 'FAILED', errorCode: 'MOCK_PROVIDER_FAILED', sourceSha256: null, resultPath: null })

        const storageRepository = createInMemoryRequestRepository()
        const storage = createStorage({ uploadError: true })
        const storageFailure = await orchestrateGenerateImage(orchestrationInput({
            body: request({ idempotencyKey: 'image-storage-failure' }), repository: storageRepository.repository, storage: storage.adapter,
        }))
        expect(storageFailure).toMatchObject({ success: false, code: 'STORAGE_UPLOAD_FAILED', requestPersistence: { status: 'FAILED' } })
        expect(storageRepository.get('profile-1', 'image-storage-failure')).toMatchObject({ status: 'FAILED', errorCode: 'STORAGE_UPLOAD_FAILED', resultPath: null })
    })

    it('recovers a completed mock result with a fresh signed URL and no duplicate provider or upload', async () => {
        const persistence = createInMemoryRequestRepository()
        const storage = createStorage({ signedUrlAt: (attempt) => `https://signed.example/recovered-${attempt}.png` })
        let providerCalls = 0
        const provider: CreatureImageProvider = {
            async transformCreature(input) {
                providerCalls += 1
                return {
                    image: input.source.bytes.slice(), mimeType: 'image/png', provider: 'counting-mock', model: 'copy-v1', isMock: true,
                    latencyMs: 4, estimatedCostUsd: 0, warnings: ['MOCK_PROVIDER_NO_VISUAL_TRANSFORMATION'],
                }
            },
        }
        const input = orchestrationInput({
            body: request({ idempotencyKey: 'recover-image-key' }), repository: persistence.repository, storage: storage.adapter,
            createImageProvider: () => provider,
        })
        const first = await orchestrateGenerateImage({ ...input, requestId: 'image-first' })
        const repeated = await orchestrateGenerateImage({ ...input, requestId: 'image-retry' })

        expect(first).toMatchObject({ success: true, result: { signedUrl: 'https://signed.example/recovered-1.png' }, requestPersistence: { status: 'SUCCEEDED', idempotencyStatus: 'CREATED', actualCostUsd: 0 } })
        expect(repeated).toMatchObject({ success: true, result: { signedUrl: 'https://signed.example/recovered-2.png' }, requestPersistence: { status: 'SUCCEEDED', idempotencyStatus: 'EXISTING', actualCostUsd: 0 } })
        expect(providerCalls).toBe(1)
        expect(storage.upload).toHaveBeenCalledTimes(1)
        expect(storage.createSignedUrl).toHaveBeenCalledTimes(2)
        expect(persistence.get('profile-1', 'recover-image-key')).toMatchObject({
            status: 'SUCCEEDED', provider: 'counting-mock', sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            resultSha256: expect.stringMatching(/^[a-f0-9]{64}$/), resultPath: expect.stringMatching(/^profile-1\/[a-f0-9]{64}\.png$/), actualCostUsd: 0,
        })
        expect(JSON.stringify(repeated)).not.toContain('profile-1/')
    })

    it('serializes simultaneous requests with the same key so the provider runs once', async () => {
        const persistence = createInMemoryRequestRepository()
        const storage = createStorage()
        let providerCalls = 0
        let releaseProvider: (() => void) | null = null
        let signalProviderStarted: (() => void) | null = null
        const providerStarted = new Promise<void>((resolve) => { signalProviderStarted = resolve })
        const providerReleased = new Promise<void>((resolve) => { releaseProvider = resolve })
        const provider: CreatureImageProvider = {
            async transformCreature(input) {
                providerCalls += 1
                signalProviderStarted?.()
                await providerReleased
                return {
                    image: input.source.bytes.slice(), mimeType: 'image/png', provider: 'slow-mock', model: 'copy-v1', isMock: true,
                    latencyMs: 4, estimatedCostUsd: 0, warnings: ['MOCK_PROVIDER_NO_VISUAL_TRANSFORMATION'],
                }
            },
        }
        const input = orchestrationInput({
            body: request({ idempotencyKey: 'simultaneous-image-key' }), repository: persistence.repository, storage: storage.adapter,
            createImageProvider: () => provider,
        })
        const first = orchestrateGenerateImage({ ...input, requestId: 'image-concurrent-first' })
        await providerStarted
        const second = await orchestrateGenerateImage({ ...input, requestId: 'image-concurrent-second' })
        releaseProvider?.()
        const firstResult = await first

        expect(firstResult).toMatchObject({ success: true, requestPersistence: { status: 'SUCCEEDED', idempotencyStatus: 'CREATED' } })
        expect(second).toMatchObject({ success: false, code: 'REQUEST_ALREADY_IN_PROGRESS', requestPersistence: { status: 'RUNNING', idempotencyStatus: 'EXISTING' } })
        expect(providerCalls).toBe(1)
        expect(storage.upload).toHaveBeenCalledTimes(1)
    })
})
