import { describe, expect, it, vi } from 'vitest'

import { createValidConcept } from '../../../shared/creature-transformations/concept-test-fixtures.ts'
import { createTestPng } from '../../../shared/creature-transformations/image-test-fixtures.ts'
import type { CreatureImageProvider } from '../../../shared/creature-transformations/image-generation.ts'
import { NoopImagePostProcessor } from '../../../shared/creature-transformations/image-post-processor.ts'
import { ImageValidator } from '../../../shared/creature-transformations/image-validator.ts'
import { MockCreatureImageProvider } from '../../../shared/creature-transformations/mock-creature-image-provider.ts'
import { orchestrateGenerateImage } from './edge-orchestration.ts'
import type { CreatureTransformationLabPolicy } from './lab-policy.ts'
import {
    SupabaseCreatureTransformationStorageAdapter,
    type CreatureTransformationStorageClient,
} from './supabase-creature-transformation-storage.ts'
import { SupabaseCreatureIdentityResolver, type PlayerCreatureRepository } from './supabase-creature-identity-resolver.ts'

const identityFeatures = ['grandi occhi ambrati', 'corpo verde squamoso e tozzo', 'cresta dorsale di spine fogliari']
const policy: CreatureTransformationLabPolicy = {
    enabled: true,
    allowedConceptModes: new Set(['MOCK']),
    allowedImageProviderModes: new Set(['MOCK']),
    signedUrlTtlSeconds: 300,
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

function createStorage(options: { source?: Uint8Array; uploadError?: boolean; signedError?: boolean } = {}) {
    const upload = vi.fn(async () => ({ error: options.uploadError ? { message: 'upload failed' } : null }))
    const createSignedUrl = vi.fn(async () => ({
        data: options.signedError ? null : { signedUrl: 'https://signed.example/result.png' },
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
        postProcessor: new NoopImagePostProcessor(),
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
        expect(validator.count).toBe(3)
        expect(JSON.stringify(result)).not.toContain('verdant-hatchling-v1.png')
        expect(JSON.stringify(result)).not.toContain('profile-1')
    })

    it('enforces authentication, ownership, policy, concept validation and refuses every REAL request', async () => {
        await expect(orchestrateGenerateImage(orchestrationInput({ profileId: null }))).resolves.toMatchObject({ code: 'UNAUTHENTICATED' })
        await expect(orchestrateGenerateImage(orchestrationInput({ resolver: createResolver('profile-2') }))).resolves.toMatchObject({ code: 'CREATURE_NOT_OWNED' })
        await expect(orchestrateGenerateImage(orchestrationInput({ policy: { ...policy, enabled: false } }))).resolves.toMatchObject({ code: 'LAB_DISABLED' })
        await expect(orchestrateGenerateImage(orchestrationInput({ policy: { ...policy, allowedImageProviderModes: new Set() } }))).resolves.toMatchObject({ code: 'IMAGE_PROVIDER_MODE_NOT_ALLOWED' })
        await expect(orchestrateGenerateImage(orchestrationInput({ body: request({ imageProviderMode: 'REAL' }) }))).resolves.toMatchObject({ code: 'REAL_IMAGE_PROVIDER_NOT_IMPLEMENTED' })
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
        await expect(orchestrateGenerateImage(orchestrationInput({ postProcessor: { async process() { throw new Error('post failed') } } }))).resolves.toMatchObject({ code: 'POST_PROCESSING_FAILED' })

        const uploadFailure = createStorage({ uploadError: true })
        await expect(orchestrateGenerateImage(orchestrationInput({ storage: uploadFailure.adapter }))).resolves.toMatchObject({ code: 'STORAGE_UPLOAD_FAILED' })
        const signedFailure = createStorage({ signedError: true })
        await expect(orchestrateGenerateImage(orchestrationInput({ storage: signedFailure.adapter }))).resolves.toMatchObject({ code: 'SIGNED_URL_FAILED' })
    })
})
