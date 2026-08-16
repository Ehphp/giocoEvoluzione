import { describe, expect, it, vi } from 'vitest'

import { createTestPng } from '../../../shared/creature-transformations/image-test-fixtures.ts'
import {
    CREATURE_TRANSFORMATION_EXPERIMENT_BUCKET,
    CREATURE_TRANSFORMATION_SOURCE_BUCKET,
    CreatureTransformationStorageError,
    SupabaseCreatureTransformationStorageAdapter,
    type CreatureTransformationStorageClient,
} from './supabase-creature-transformation-storage.ts'

function createStorageClient(options: { source?: Uint8Array | null; uploadError?: { message: string } | null; signedError?: { message: string } | null } = {}) {
    const download = vi.fn(async () => ({ data: options.source === null ? null : new Blob([options.source ?? createTestPng()], { type: 'image/png' }), error: null }))
    const upload = vi.fn(async () => ({ error: options.uploadError ?? null }))
    const createSignedUrl = vi.fn(async () => ({ data: options.signedError ? null : { signedUrl: 'https://signed.example/result' }, error: options.signedError ?? null }))
    const client: CreatureTransformationStorageClient = {
        from: vi.fn(() => ({ download, upload, createSignedUrl })),
    }
    return { client, download, upload, createSignedUrl }
}

describe('SupabaseCreatureTransformationStorageAdapter', () => {
    it('reads the private source and stores only a deterministic user result with a signed URL', async () => {
        const mock = createStorageClient()
        const adapter = new SupabaseCreatureTransformationStorageAdapter(mock.client, { signedUrlTtlSeconds: 120, now: () => 0 })
        const source = await adapter.readCanonicalSource('verdant-hatchling-v1.png')
        const stored = await adapter.saveResult({ profileId: 'profile-1', idempotencyKey: 'click-1', image: createTestPng() })
        const objectPath = await adapter.createResultObjectPath('profile-1', 'click-1')

        expect(mock.client.from).toHaveBeenCalledWith(CREATURE_TRANSFORMATION_SOURCE_BUCKET)
        expect(mock.download).toHaveBeenCalledWith('verdant-hatchling-v1.png')
        expect(source).toMatchObject({ mimeType: 'image/png', bytes: createTestPng() })
        expect(mock.client.from).toHaveBeenCalledWith(CREATURE_TRANSFORMATION_EXPERIMENT_BUCKET)
        expect(mock.upload).toHaveBeenCalledWith(objectPath, expect.any(Uint8Array), { contentType: 'image/png', upsert: true })
        expect(mock.upload).not.toHaveBeenCalledWith('verdant-hatchling-v1.png', expect.anything(), expect.anything())
        expect(mock.createSignedUrl).toHaveBeenCalledWith(objectPath, 120)
        expect(stored).toEqual({ signedUrl: 'https://signed.example/result', expiresAt: '1970-01-01T00:02:00.000Z' })
    })

    it('maps missing source, upload and signed-url failures without exposing storage internals', async () => {
        await expect(new SupabaseCreatureTransformationStorageAdapter(createStorageClient({ source: null }).client).readCanonicalSource('missing.png'))
            .rejects.toMatchObject({ code: 'SOURCE_IMAGE_NOT_FOUND' } satisfies Partial<CreatureTransformationStorageError>)
        await expect(new SupabaseCreatureTransformationStorageAdapter(createStorageClient({ uploadError: { message: 'nope' } }).client).saveResult({ profileId: 'profile-1', idempotencyKey: 'key', image: createTestPng() }))
            .rejects.toMatchObject({ code: 'STORAGE_UPLOAD_FAILED' } satisfies Partial<CreatureTransformationStorageError>)
        await expect(new SupabaseCreatureTransformationStorageAdapter(createStorageClient({ signedError: { message: 'nope' } }).client).saveResult({ profileId: 'profile-1', idempotencyKey: 'key', image: createTestPng() }))
            .rejects.toMatchObject({ code: 'SIGNED_URL_FAILED' } satisfies Partial<CreatureTransformationStorageError>)
    })

    it('signs a native Seedream JPEG raw result', async () => {
        const mock = createStorageClient()
        const adapter = new SupabaseCreatureTransformationStorageAdapter(mock.client, { signedUrlTtlSeconds: 120, now: () => 0 })
        const path = await adapter.createRawResultObjectPath('profile-1', 'seedream-jpeg', 'image/jpeg')

        await expect(adapter.saveRawResult({
            profileId: 'profile-1',
            idempotencyKey: 'seedream-jpeg',
            image: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
            mimeType: 'image/jpeg',
        })).resolves.toEqual({ signedUrl: 'https://signed.example/result', expiresAt: '1970-01-01T00:02:00.000Z' })

        expect(path).toMatch(/^experiments\/raw\/profile-1\/[a-f0-9]{64}\.jpg$/)
        expect(mock.upload).toHaveBeenCalledWith(path, expect.any(Uint8Array), { contentType: 'image/jpeg', upsert: true })
        expect(mock.createSignedUrl).toHaveBeenCalledWith(path, 120)
    })

    it('reads a server-selected productive visual from the source or experiment bucket', async () => {
        const mock = createStorageClient()
        const adapter = new SupabaseCreatureTransformationStorageAdapter(mock.client)
        const productivePath = `profile-1/${'a'.repeat(64)}.png`

        await adapter.readVisualVersionSource('verdant-hatchling-v1.png', true)
        await adapter.readVisualVersionSource(productivePath, false)

        expect(mock.client.from).toHaveBeenNthCalledWith(1, CREATURE_TRANSFORMATION_SOURCE_BUCKET)
        expect(mock.client.from).toHaveBeenNthCalledWith(2, CREATURE_TRANSFORMATION_EXPERIMENT_BUCKET)
        expect(mock.download).toHaveBeenNthCalledWith(1, 'verdant-hatchling-v1.png')
        expect(mock.download).toHaveBeenNthCalledWith(2, productivePath)
    })

    it('keeps lineage sources compatible with legacy server-owned experiment paths', async () => {
        const mock = createStorageClient()
        const adapter = new SupabaseCreatureTransformationStorageAdapter(mock.client)
        const legacyPath = `profile-1/${'d'.repeat(64)}.png`

        await expect(adapter.readExperimentalSource(legacyPath)).resolves.toMatchObject({ mimeType: 'image/png' })
        await expect(adapter.readExperimentalSource('untrusted-source.png')).rejects.toMatchObject({ code: 'SOURCE_IMAGE_NOT_FOUND' } satisfies Partial<CreatureTransformationStorageError>)
        expect(mock.client.from).toHaveBeenCalledWith(CREATURE_TRANSFORMATION_EXPERIMENT_BUCKET)
        expect(mock.download).toHaveBeenCalledWith(legacyPath)
    })

    it('signs a constrained legacy raw proposal only for the owner review flow', async () => {
        const mock = createStorageClient()
        const adapter = new SupabaseCreatureTransformationStorageAdapter(mock.client, { signedUrlTtlSeconds: 120, now: () => 0 })
        const legacyPath = `experiments/raw/profile-1/${'a'.repeat(64)}.png`

        await expect(adapter.createVisualVersionSignedUrl({ assetPath: legacyPath, isBaseVersion: false }))
            .resolves.toEqual({ signedUrl: 'https://signed.example/result', expiresAt: '1970-01-01T00:02:00.000Z' })
        await expect(adapter.createVisualVersionSignedUrl({ assetPath: `candidates/profile-1/${'b'.repeat(64)}.png`, isBaseVersion: false }))
            .resolves.toEqual({ signedUrl: 'https://signed.example/result', expiresAt: '1970-01-01T00:02:00.000Z' })
        await expect(adapter.createVisualVersionSignedUrl({ assetPath: 'experiments/raw/profile-1/not-a-hash.png', isBaseVersion: false }))
            .rejects.toMatchObject({ code: 'SIGNED_URL_FAILED' } satisfies Partial<CreatureTransformationStorageError>)
    })

    it('reuses a valid signed URL for the same immutable visual asset', async () => {
        const mock = createStorageClient()
        const adapter = new SupabaseCreatureTransformationStorageAdapter(mock.client, { signedUrlTtlSeconds: 120, now: () => 0 })
        const path = `cleanup/${'c'.repeat(64)}.png`

        await adapter.createVisualVersionSignedUrl({ assetPath: path, isBaseVersion: false })
        await adapter.createVisualVersionSignedUrl({ assetPath: path, isBaseVersion: false })

        expect(mock.createSignedUrl).toHaveBeenCalledTimes(1)
    })
})
