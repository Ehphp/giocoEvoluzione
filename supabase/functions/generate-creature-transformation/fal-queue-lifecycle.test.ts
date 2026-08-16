import { describe, expect, it } from 'vitest'

import { createInMemoryRequestRepository } from './test-request-repository.ts'

const PROFILE_ID = 'profile-1'

async function runningFalRequest() {
    const persistence = createInMemoryRequestRepository()
    const reserved = await persistence.repository.reserve({
        profileId: PROFILE_ID,
        creatureId: '00000000-0000-4000-8000-000000000001',
        idempotencyKey: 'fal-queue-lifecycle',
        operation: 'GENERATE_UNLOCKED_TRANSFORMATION',
        imageProviderMode: 'REAL',
        dailyRequestLimit: 10,
        dailyBudgetUsd: 1,
    })
    if (reserved.outcome !== 'CREATED') throw new Error('test reservation was not created')
    const running = await persistence.repository.markRunning({ requestId: reserved.record.id, profileId: PROFILE_ID })
    return { persistence, running }
}

describe('Fal Queue request lifecycle', () => {
    it('keeps the request running after submission and atomically replaces an id for crop retry', async () => {
        const { persistence, running } = await runningFalRequest()
        const workflow = { version: 1, kind: 'FLUX', source: { kind: 'CANONICAL', path: 'verdant-hatchling-v1.png', isBaseVersion: true } }
        const first = await persistence.repository.updateRunningFalSubmission({
            requestId: running.id,
            profileId: PROFILE_ID,
            data: { provider: 'fal.ai', model: 'fal-ai/flux-2-klein/9b/edit', providerRequestId: 'fal-first', falWorkflow: workflow },
        })
        const retried = await persistence.repository.updateRunningFalSubmission({
            requestId: first.id,
            profileId: PROFILE_ID,
            data: {
                provider: 'fal.ai', model: 'fal-ai/flux-2-klein/9b/edit', providerRequestId: 'fal-retry',
                expectedProviderRequestId: 'fal-first', incrementAttempt: true,
            },
        })

        expect(first.status).toBe('RUNNING')
        expect(retried).toMatchObject({ status: 'RUNNING', providerRequestId: 'fal-retry', attemptCount: 2 })
        await expect(persistence.repository.getByProviderRequestId({ providerRequestId: 'fal-first' })).resolves.toBeNull()
        await expect(persistence.repository.claimFalFinalization({ providerRequestId: 'fal-first' })).resolves.toEqual({ outcome: 'UNKNOWN' })
    })

    it('collapses duplicate finalizer invocations and rejects a terminal request', async () => {
        const { persistence, running } = await runningFalRequest()
        const submitted = await persistence.repository.updateRunningFalSubmission({
            requestId: running.id,
            profileId: PROFILE_ID,
            data: { provider: 'fal.ai', model: 'fal-ai/flux-2-klein/9b/edit', providerRequestId: 'fal-final', falWorkflow: { version: 1, kind: 'FLUX', source: { kind: 'CANONICAL', path: 'verdant-hatchling-v1.png', isBaseVersion: true } } },
        })
        await expect(persistence.repository.claimFalFinalization({ providerRequestId: 'fal-final' })).resolves.toMatchObject({ outcome: 'CLAIMED' })
        await expect(persistence.repository.claimFalFinalization({ providerRequestId: 'fal-final' })).resolves.toMatchObject({ outcome: 'IN_PROGRESS' })
        await persistence.repository.markFailed({ requestId: submitted.id, profileId: PROFILE_ID, errorCode: 'FAL_FLUX_PROVIDER_ERROR', errorMessage: 'provider error' })
        await expect(persistence.repository.claimFalFinalization({ providerRequestId: 'fal-final' })).resolves.toMatchObject({ outcome: 'TERMINAL' })
    })
})
