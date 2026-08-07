import { describe, expect, it, vi } from 'vitest'

import {
    SupabaseCreatureTransformationRequestRepository,
    type CreatureTransformationRequestRepositoryClient,
} from './creature-transformation-request-repository.ts'

function databaseRecord(overrides: Record<string, unknown> = {}) {
    return {
        id: 'request-1', profile_id: 'profile-1', creature_id: 'creature-1', idempotency_key: 'key-1', operation: 'GENERATE_IMAGE', status: 'RESERVED',
        concept_mode: null, image_provider_mode: 'MOCK', provider: null, model: null, provider_request_id: null,
        evolution_target_id: null, evolution_function: null,
        visual_trait_id: 'IMPACT_ADAPTATION', intensity: 2, prompt_template_version: null, concept_schema_version: null,
        source_sha256: null, result_sha256: null, result_path: null, result_mime_type: null, result_width: null, result_height: null, generation_latency_ms: null,
        estimated_cost_usd: '0', actual_cost_usd: null, attempt_count: 0, error_code: null, error_message: null,
        created_at: '2026-08-02T12:00:00.000Z', started_at: null, completed_at: null, updated_at: '2026-08-02T12:00:00.000Z',
        ...overrides,
    }
}

function createClient(rpcResponse: unknown) {
    const rpc = vi.fn(async () => ({ data: rpcResponse, error: null }))
    const maybeSingle = vi.fn(async () => ({ data: databaseRecord(), error: null }))
    const client: CreatureTransformationRequestRepositoryClient = {
        rpc,
        from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }),
    }
    return { client, rpc, maybeSingle }
}

describe('SupabaseCreatureTransformationRequestRepository', () => {
    it('maps atomic reservation outcomes and passes only audit-safe metadata to the RPC', async () => {
        const mock = createClient({ outcome: 'CREATED', record: databaseRecord() })
        const repository = new SupabaseCreatureTransformationRequestRepository(mock.client)
        const result = await repository.reserve({
            profileId: 'profile-1', creatureId: 'creature-1', idempotencyKey: 'key-1', operation: 'GENERATE_IMAGE',
            visualTraitId: 'IMPACT_ADAPTATION', intensity: 2, imageProviderMode: 'MOCK', estimatedCostUsd: 0,
            evolutionTargetId: 'TORSO_AND_BACK', evolutionFunction: 'DEFENSE',
            dailyRequestLimit: 10, dailyBudgetUsd: 0,
        })

        expect(result).toMatchObject({ outcome: 'CREATED', record: { id: 'request-1', status: 'RESERVED', estimatedCostUsd: 0, evolutionTargetId: null, evolutionFunction: null } })
        expect(mock.rpc).toHaveBeenCalledWith('reserve_creature_transformation_request', expect.objectContaining({
            p_profile_id: 'profile-1', p_idempotency_key: 'key-1', p_evolution_target_id: 'TORSO_AND_BACK', p_evolution_function: 'DEFENSE',
            p_daily_request_limit: 10, p_daily_budget_usd: 0,
        }))
        expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain('prompt')
        expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain('signedUrl')
    })

    it('returns existing, daily-limit, budget and ownership outcomes without database details', async () => {
        for (const outcome of ['EXISTING', 'DAILY_LIMIT_REACHED', 'DAILY_BUDGET_REACHED', 'CREATURE_NOT_OWNED'] as const) {
            const payload = outcome === 'EXISTING' ? { outcome, record: databaseRecord({ status: 'SUCCEEDED' }) } : { outcome }
            const repository = new SupabaseCreatureTransformationRequestRepository(createClient(payload).client)
            const result = await repository.reserve({ profileId: 'profile-1', creatureId: 'creature-1', idempotencyKey: `key-${outcome}`, operation: 'GENERATE_CONCEPT', dailyRequestLimit: 1, dailyBudgetUsd: 0 })
            expect(result.outcome).toBe(outcome)
        }
    })

    it('uses the transition RPC and surfaces an invalid state transition as a stable repository error', async () => {
        const success = createClient({ outcome: 'UPDATED', record: databaseRecord({ status: 'SUCCEEDED', result_path: 'profile-1/a'.padEnd(78, 'a'), result_sha256: 'a'.repeat(64) }) })
        const repository = new SupabaseCreatureTransformationRequestRepository(success.client)
        await expect(repository.markSucceeded({ requestId: 'request-1', profileId: 'profile-1', data: { resultPath: 'profile-1/' + 'a'.repeat(64) + '.png', resultSha256: 'a'.repeat(64), resultMimeType: 'image/png', resultWidth: 1024, resultHeight: 1536 } }))
            .resolves.toMatchObject({ status: 'SUCCEEDED' })
        expect(success.rpc).toHaveBeenCalledWith('transition_creature_transformation_request', expect.objectContaining({ p_target_status: 'SUCCEEDED' }))

        const conflict = new SupabaseCreatureTransformationRequestRepository(createClient({ outcome: 'CONFLICT', record: databaseRecord({ status: 'SUCCEEDED' }) }).client)
        await expect(conflict.markRunning({ requestId: 'request-1', profileId: 'profile-1' })).rejects.toMatchObject({ code: 'REQUEST_STATE_CONFLICT' })
    })

    it('reads an existing record only by the authenticated server-side profile and idempotency key', async () => {
        const mock = createClient({ outcome: 'CREATED', record: databaseRecord() })
        const repository = new SupabaseCreatureTransformationRequestRepository(mock.client)
        await expect(repository.getByIdempotencyKey({ profileId: 'profile-1', idempotencyKey: 'key-1' })).resolves.toMatchObject({ id: 'request-1' })
        expect(mock.maybeSingle).toHaveBeenCalledTimes(1)
    })
})
