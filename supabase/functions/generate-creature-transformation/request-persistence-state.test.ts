import { describe, expect, it } from 'vitest'

import { createInMemoryRequestRepository } from './test-request-repository.ts'

const reserveInput = {
    creatureId: 'creature-1', operation: 'GENERATE_IMAGE' as const, imageProviderMode: 'MOCK' as const,
    dailyRequestLimit: 10, dailyBudgetUsd: 0, estimatedCostUsd: 0,
}

describe('request persistence state contract', () => {
    it('returns CREATED once per profile/key and permits the same key for another profile', async () => {
        const requests = createInMemoryRequestRepository({ now: () => '2026-08-02T12:00:00.000Z' })
        const first = await requests.repository.reserve({ ...reserveInput, profileId: 'profile-1', idempotencyKey: 'same-key' })
        const repeated = await requests.repository.reserve({ ...reserveInput, profileId: 'profile-1', idempotencyKey: 'same-key' })
        const anotherProfile = await requests.repository.reserve({ ...reserveInput, profileId: 'profile-2', idempotencyKey: 'same-key' })

        expect(first).toMatchObject({ outcome: 'CREATED', record: { status: 'RESERVED', attemptCount: 0, startedAt: null, completedAt: null, createdAt: '2026-08-02T12:00:00.000Z' } })
        expect(repeated).toMatchObject({ outcome: 'EXISTING', record: { idempotencyKey: 'same-key', profileId: 'profile-1' } })
        expect(anotherProfile).toMatchObject({ outcome: 'CREATED', record: { profileId: 'profile-2' } })
        expect(requests.calls.reserve).toBe(3)
    })

    it('allows only RESERVED -> RUNNING -> SUCCEEDED and maintains audit timestamps', async () => {
        const requests = createInMemoryRequestRepository({ now: () => '2026-08-02T12:00:00.000Z' })
        const reserved = await requests.repository.reserve({ ...reserveInput, profileId: 'profile-1', idempotencyKey: 'transition-key' })
        if (reserved.outcome !== 'CREATED') throw new Error('test reservation failed')
        const running = await requests.repository.markRunning({ requestId: reserved.record.id, profileId: 'profile-1' })
        const completed = await requests.repository.markSucceeded({
            requestId: reserved.record.id, profileId: 'profile-1',
            data: { provider: 'mock', model: 'copy-v1', sourceSha256: 'a'.repeat(64), resultSha256: 'a'.repeat(64), resultPath: `profile-1/${'a'.repeat(64)}.png`, resultMimeType: 'image/png', resultWidth: 1024, resultHeight: 1536, actualCostUsd: 0 },
        })

        expect(running).toMatchObject({ status: 'RUNNING', attemptCount: 1, startedAt: '2026-08-02T12:00:00.000Z', completedAt: null })
        expect(completed).toMatchObject({ status: 'SUCCEEDED', completedAt: '2026-08-02T12:00:00.000Z', actualCostUsd: 0 })
        await expect(requests.repository.markRunning({ requestId: reserved.record.id, profileId: 'profile-1' })).rejects.toThrow('state conflict')
        await expect(requests.repository.markFailed({ requestId: reserved.record.id, profileId: 'profile-1', errorCode: 'FAIL', errorMessage: 'fail' })).rejects.toThrow('state conflict')
    })

    it('retains reserved target direction metadata after a failed request', async () => {
        const persistence = createInMemoryRequestRepository()
        const reservation = await persistence.repository.reserve({
            profileId: 'profile-1', creatureId: 'creature-1', idempotencyKey: 'target-failed', operation: 'GENERATE_UNLOCKED_TRANSFORMATION',
            visualTraitId: 'ENERGY_REGULATION', evolutionTargetId: 'TORSO_AND_BACK', evolutionFunction: 'THERMOREGULATION',
            intensity: 2, conceptMode: 'AI', imageProviderMode: 'REAL', estimatedCostUsd: 0.12,
            dailyRequestLimit: 10, dailyBudgetUsd: 1,
        })
        if (reservation.outcome !== 'CREATED') throw new Error('test reservation failed')

        const running = await persistence.repository.markRunning({ requestId: reservation.record.id, profileId: 'profile-1' })
        await persistence.repository.markFailed({ requestId: running.id, profileId: 'profile-1', errorCode: 'CONCEPT_REJECTED', errorMessage: 'rejected' })

        expect(persistence.get('profile-1', 'target-failed')).toMatchObject({
            status: 'FAILED', errorCode: 'CONCEPT_REJECTED', evolutionTargetId: 'TORSO_AND_BACK', evolutionFunction: 'THERMOREGULATION',
        })
    })
})
