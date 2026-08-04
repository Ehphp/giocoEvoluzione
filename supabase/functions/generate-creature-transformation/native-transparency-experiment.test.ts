import { describe, expect, it, vi } from 'vitest'

import { createValidConcept } from '../../../shared/creature-transformations/concept-test-fixtures.ts'
import { createTestPng } from '../../../shared/creature-transformations/image-test-fixtures.ts'
import type { CreatureImageProvider } from '../../../shared/creature-transformations/image-generation.ts'
import { ImageValidator } from '../../../shared/creature-transformations/image-validator.ts'
import { SupabaseCreatureIdentityResolver, type PlayerCreatureRepository } from './supabase-creature-identity-resolver.ts'
import { SupabaseCreatureTransformationStorageAdapter, type CreatureTransformationStorageClient } from './supabase-creature-transformation-storage.ts'
import { generateImageForAuthenticatedProfile } from './image-generation-service.ts'

const concept = { ...createValidConcept(), identityToPreserve: ['grandi occhi ambrati', 'corpo squamoso e tozzo', 'cresta dorsale di spine fogliari'] }

function resolver() {
    const repository: PlayerCreatureRepository = { async findByCreatureId() { return { id: 'creature-1', profileId: 'profile-1', baseCreatureKey: 'VERDANT_HATCHLING' } } }
    return new SupabaseCreatureIdentityResolver(repository)
}

function storage() {
    const upload = vi.fn(async () => ({ error: null }))
    const client: CreatureTransformationStorageClient = {
        from: vi.fn(() => ({
            download: async () => ({ data: new Blob([createTestPng()], { type: 'image/png' }), error: null }),
            upload,
            createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.example/native.png' }, error: null }),
        })),
    }
    return { adapter: new SupabaseCreatureTransformationStorageAdapter(client, { now: () => 0 }), upload }
}

class CoverageValidator extends ImageValidator {
    constructor(private readonly ratio: number) { super() }

    override async validate(input: Parameters<ImageValidator['validate']>[0]) {
        const result = await super.validate(input)
        return result.valid && input.measureAlphaCoverage
            ? { ...result, metadata: { ...result.metadata, transparentPixelRatio: this.ratio } }
            : result
    }
}

function provider(image: Uint8Array): CreatureImageProvider {
    return {
        async transformCreature() {
            return { image, mimeType: 'image/png', provider: 'openai-image-api', model: 'gpt-image-1.5', isMock: false, latencyMs: 1, warnings: [] }
        },
    }
}

async function generate(ratio: number, image = createTestPng({ colorType: 4 })) {
    const target = storage()
    const postProcessor = { process: vi.fn(async () => { throw new Error('must not run') }) }
    const result = await generateImageForAuthenticatedProfile({
        profileId: 'profile-1', requestId: 'native-experiment-1',
        request: { operation: 'GENERATE_IMAGE', creatureId: 'creature-1', concept, imageProviderMode: 'REAL', idempotencyKey: `native-${ratio}`, experimentalNativeTransparency: true },
        resolver: resolver(), storage: target.adapter, provider: provider(image), postProcessor,
        validator: new CoverageValidator(ratio), experimentalNativeTransparency: true,
    })
    return { result, postProcessor, upload: target.upload }
}

describe('native transparency experiment', () => {
    it('bypasses the post-processor, saves the OpenAI bytes as an experiment, and classifies usable alpha', async () => {
        const { result, postProcessor, upload } = await generate(0.2)

        expect(result).toMatchObject({ success: true, result: { assetReadiness: 'EXPERIMENT_ONLY', signedUrl: 'https://signed.example/native.png' }, generation: { model: 'gpt-image-1.5' } })
        expect(result.success && result.validation.warnings).not.toContain('NATIVE_TRANSPARENCY_MISSING')
        expect(postProcessor.process).not.toHaveBeenCalled()
        expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^experiments\/raw\/profile-1\//), expect.any(Uint8Array), expect.anything())
    })

    it('keeps an opaque or alpha-less provider result as EXPERIMENT_ONLY with a clear warning', async () => {
        const opaque = await generate(0)
        expect(opaque.result.success && opaque.result.validation.warnings).toContain('NATIVE_TRANSPARENCY_MISSING')
        expect(opaque.result).toMatchObject({ success: true, result: { assetReadiness: 'EXPERIMENT_ONLY' } })

        const alphaLess = await generate(0, createTestPng({ colorType: 2 }))
        expect(alphaLess.result.success && alphaLess.result.validation.warnings).toContain('NATIVE_TRANSPARENCY_MISSING')
        expect(alphaLess.result).toMatchObject({ success: true, result: { assetReadiness: 'EXPERIMENT_ONLY' } })
    })
})
