import { describe, expect, it } from 'vitest'

import { orchestrateGetGeneratedImageCatalog } from './edge-orchestration.ts'
import type { CreatureTransformationLabPolicy } from './lab-policy.ts'
import { SupabaseCreatureTransformationStorageAdapter, type CreatureTransformationStorageClient } from './supabase-creature-transformation-storage.ts'
import { createInMemoryRequestRepository } from './test-request-repository.ts'

const policy = { enabled: true } as CreatureTransformationLabPolicy

function storage() {
    const client: CreatureTransformationStorageClient = {
        from: () => ({
            download: async () => ({ data: null, error: null }),
            upload: async () => ({ error: null }),
            createSignedUrl: async (path) => ({ data: { signedUrl: `https://signed.example/${path}` }, error: null }),
        }),
    }
    return new SupabaseCreatureTransformationStorageAdapter(client, { now: () => 0 })
}

async function completeImage(repository: ReturnType<typeof createInMemoryRequestRepository>['repository'], profileId: string, idempotencyKey: string) {
    const reserved = await repository.reserve({
        profileId, creatureId: `${profileId}-creature`, idempotencyKey, operation: 'GENERATE_IMAGE', imageProviderMode: 'REAL',
        dailyRequestLimit: 10, dailyBudgetUsd: 10,
    })
    if (reserved.outcome !== 'CREATED') throw new Error('Expected a new test request.')
    await repository.markRunning({ profileId, requestId: reserved.record.id })
    return repository.markSucceeded({
        profileId,
        requestId: reserved.record.id,
        data: {
            provider: 'OPENAI', model: 'gpt-image-1.5', promptText: `Prompt ${idempotencyKey}`, promptSha256: 'b'.repeat(64),
            resultPath: `${profileId}/${'a'.repeat(64)}.png`, resultSha256: 'a'.repeat(64), resultMimeType: 'image/png', resultWidth: 1024, resultHeight: 1536,
        },
    })
}

describe('generated image catalog orchestration', () => {
    it('returns only the authenticated profile images with a signed URL and persisted prompt', async () => {
        const requests = createInMemoryRequestRepository()
        const owner = await completeImage(requests.repository, 'profile-owner', 'owner-image')
        await completeImage(requests.repository, 'profile-other', 'other-image')

        const result = await orchestrateGetGeneratedImageCatalog({
            profileId: 'profile-owner', requestId: 'catalog-request', body: { operation: 'GET_GENERATED_IMAGE_CATALOG' }, policy,
            repository: requests.repository, storage: storage(),
        } as Parameters<typeof orchestrateGetGeneratedImageCatalog>[0])

        expect(result).toMatchObject({ success: true, page: 0, hasMore: false })
        if (!result.success) throw new Error('Expected catalog success.')
        expect(result.entries).toHaveLength(1)
        expect(result.entries[0]).toMatchObject({
            transformationRequestId: owner.id,
            prompt: { text: 'Prompt owner-image', sha256: 'b'.repeat(64) },
            result: { signedUrl: `https://signed.example/profile-owner/${'a'.repeat(64)}.png` },
        })
        expect(JSON.stringify(result.entries[0])).not.toContain('resultPath')
    })
})
