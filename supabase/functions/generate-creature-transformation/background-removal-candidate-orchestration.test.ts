import { describe, expect, it } from 'vitest'

import { orchestrateSubmitBackgroundRemovalCandidate } from './edge-orchestration.ts'
import { createInMemoryRequestRepository } from './test-request-repository.ts'

const profileId = 'profile-1'
const requestId = '00000000-0000-4000-8000-000000000001'

async function pendingRequest(rawDimensions: readonly [number, number] = [1024, 1536]) {
    const requests = createInMemoryRequestRepository()
    const reserved = await requests.repository.reserve({
        profileId, creatureId: 'creature-1', idempotencyKey: 'raw-key', operation: 'GENERATE_UNLOCKED_TRANSFORMATION',
        dailyRequestLimit: 10, dailyBudgetUsd: 1, visualProgressTrackId: 'track-1', sourceVisualVersionId: 'source-1',
    })
    if (reserved.outcome !== 'CREATED') throw new Error('Fixture reservation failed')
    await requests.repository.markRunning({ profileId, requestId: reserved.record.id })
    await requests.repository.markSucceeded({
        profileId, requestId: reserved.record.id,
        data: { resultPath: 'experiments/raw/profile-1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png', resultSha256: 'a'.repeat(64), resultMimeType: 'image/png', resultWidth: rawDimensions[0], resultHeight: rawDimensions[1], assetReadiness: 'EXPERIMENT_ONLY' },
    })
    return { requests, transformationRequestId: reserved.record.id }
}

function input(transformationRequestId: string, repository: Awaited<ReturnType<typeof pendingRequest>>['requests']['repository'], validator: { validate: () => Promise<unknown> }) {
    const uploads: Uint8Array[] = []
    return {
        profileId, requestId, body: { operation: 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE', transformationRequestId, candidatePngBase64: btoa('candidate') }, repository,
        storage: {
            async createCandidateObjectPath() { return 'candidates/profile-1/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png' },
            async saveBackgroundRemovalCandidate({ image }: { image: Uint8Array }) { uploads.push(image); return { signedUrl: '', expiresAt: '' } },
        },
        validator,
        uploads,
    }
}

describe('browser background removal candidate gate', () => {
    it('promotes one valid transparent candidate and never invokes OpenAI', async () => {
        const pending = await pendingRequest()
        const prepared = input(pending.transformationRequestId, pending.requests.repository, {
            async validate() { return { valid: true as const, metadata: { mimeType: 'image/png' as const, width: 1024, height: 1536, colorType: 6, hasAlpha: true, transparentPixelRatio: 0.5, visiblePixelRatio: 0.5, sha256: 'b'.repeat(64), bytes: 32 }, warnings: [] } },
        })
        await expect(orchestrateSubmitBackgroundRemovalCandidate(prepared as never)).resolves.toMatchObject({ success: true, candidate: { assetReadiness: 'FINAL_ASSET' } })
        expect(prepared.uploads).toHaveLength(1)
        expect(pending.requests.get(profileId, 'raw-key')).toMatchObject({ assetReadiness: 'FINAL_ASSET', resultSha256: 'b'.repeat(64) })
    })

    it('returns the existing final asset when a duplicate candidate arrives after the first submission', async () => {
        const pending = await pendingRequest()
        const prepared = input(pending.transformationRequestId, pending.requests.repository, {
            async validate() { return { valid: true as const, metadata: { mimeType: 'image/png' as const, width: 1024, height: 1536, colorType: 6, hasAlpha: true, transparentPixelRatio: 0.5, visiblePixelRatio: 0.5, sha256: 'b'.repeat(64), bytes: 32 }, warnings: [] } },
        })
        await expect(orchestrateSubmitBackgroundRemovalCandidate(prepared as never)).resolves.toMatchObject({ success: true })
        await expect(orchestrateSubmitBackgroundRemovalCandidate(prepared as never)).resolves.toMatchObject({ success: true, requestPersistence: { idempotencyStatus: 'EXISTING' } })
        expect(prepared.uploads).toHaveLength(1)
    })

    it('accepts a FLUX raw PNG at 768 by 1152 before promoting the normalized master', async () => {
        const pending = await pendingRequest([768, 1152])
        const prepared = input(pending.transformationRequestId, pending.requests.repository, {
            async validate() { return { valid: true as const, metadata: { mimeType: 'image/png' as const, width: 1024, height: 1536, colorType: 6, hasAlpha: true, transparentPixelRatio: 0.5, visiblePixelRatio: 0.5, sha256: 'b'.repeat(64), bytes: 32 }, warnings: [] } },
        })
        await expect(orchestrateSubmitBackgroundRemovalCandidate(prepared as never)).resolves.toMatchObject({ success: true, candidate: { assetReadiness: 'FINAL_ASSET', width: 1024, height: 1536 } })
        expect(pending.requests.get(profileId, 'raw-key')).toMatchObject({ resultWidth: 1024, resultHeight: 1536, assetReadiness: 'FINAL_ASSET' })
    })

    it('rejects an opaque candidate before upload and leaves the raw request retryable', async () => {
        const pending = await pendingRequest()
        const prepared = input(pending.transformationRequestId, pending.requests.repository, {
            async validate() { return { valid: false as const, problems: [{ code: 'PNG_ALPHA_REQUIRED', message: 'alpha required' }] } },
        })
        await expect(orchestrateSubmitBackgroundRemovalCandidate(prepared as never)).resolves.toMatchObject({ success: false, code: 'BACKGROUND_REMOVAL_CANDIDATE_INVALID' })
        expect(prepared.uploads).toHaveLength(0)
        expect(pending.requests.get(profileId, 'raw-key')).toMatchObject({ status: 'SUCCEEDED', assetReadiness: 'EXPERIMENT_ONLY' })
    })
})
