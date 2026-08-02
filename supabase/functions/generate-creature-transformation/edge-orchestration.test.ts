import { describe, expect, it } from 'vitest'

import { AiCreatureConceptGenerator } from '../../../shared/creature-transformations/ai-concept-generator.ts'
import { type CreatureConceptGenerator } from '../../../shared/creature-transformations/concept-generator.ts'
import { createValidConcept } from '../../../shared/creature-transformations/concept-test-fixtures.ts'
import type { CreatureTransformationConcept } from '../../../shared/creature-transformations/concepts.ts'
import { MockCreatureConceptGenerator } from '../../../shared/creature-transformations/mock-concept-generator.ts'
import { OpenAiStructuredConceptModelError } from './openai-structured-concept-model.ts'
import { orchestrateGenerateConcept, getGenerateConceptFailureStatus } from './edge-orchestration.ts'
import type { CreatureTransformationLabPolicy } from './lab-policy.ts'
import { SupabaseCreatureIdentityResolver, type PlayerCreatureRepository, type StoredPlayerCreature } from './supabase-creature-identity-resolver.ts'
import { createInMemoryRequestRepository } from './test-request-repository.ts'

const ownedCreature: StoredPlayerCreature = { id: 'creature-1', profileId: 'profile-1', baseCreatureKey: 'VERDANT_HATCHLING' }
const allowedPolicy: CreatureTransformationLabPolicy = { enabled: true, allowedConceptModes: new Set(['MOCK', 'AI']), allowedImageProviderModes: new Set(['MOCK']), signedUrlTtlSeconds: 300, dailyRequestLimit: 10, dailyBudgetUsd: 0, staleRequestSeconds: 900 }
const VERDANT_HATCHLING_IDENTITY_FEATURES = ['grandi occhi ambrati', 'corpo verde squamoso e tozzo', 'cresta dorsale di spine fogliari']

function createResolver(record: StoredPlayerCreature | null = ownedCreature) {
    const repository: PlayerCreatureRepository = { async findByCreatureId() { return record } }
    return new SupabaseCreatureIdentityResolver(repository)
}

function request(overrides: Record<string, unknown> = {}) {
    return {
        operation: 'GENERATE_CONCEPT',
        creatureId: 'creature-1',
        visualTraitId: 'IMPACT_ADAPTATION',
        intensity: 2,
        conceptMode: 'MOCK',
        idempotencyKey: 'intentional-click-1',
        ...overrides,
    }
}

function createCanonicalConcept(): CreatureTransformationConcept {
    return { ...createValidConcept(), identityToPreserve: [...VERDANT_HATCHLING_IDENTITY_FEATURES] }
}

function sequenceGenerator(outputs: CreatureTransformationConcept[]): CreatureConceptGenerator {
    let index = 0
    return {
        metadata: { generator: 'sequence', isMock: false },
        async generateConcept() {
            const output = outputs[Math.min(index, outputs.length - 1)]
            index += 1
            return output
        },
    }
}

describe('generate concept edge orchestration', () => {
    it('generates a mock concept for the authenticated creature from server-side canonical identity', async () => {
        const ticks = [100, 135]
        const result = await orchestrateGenerateConcept({
            profileId: 'profile-1',
            requestId: 'request-1',
            body: request(),
            policy: allowedPolicy,
            resolver: createResolver(),
            createGenerator: () => new MockCreatureConceptGenerator(),
            now: () => ticks.shift() ?? 135,
            repository: createInMemoryRequestRepository().repository,
        })

        expect(result).toMatchObject({
            success: true,
            identity: { description: 'Piccolo drago verde con grandi occhi ambrati, corpo tozzo e cresta di spine fogliari.' },
            generation: { isMock: true, attempts: 1, latencyMs: 35 }, requestPersistence: { status: 'SUCCEEDED', idempotencyStatus: 'CREATED' },
        })
        if (result.success) expect(result.prompt.prompt).toContain('IDENTITY')
    })

    it('accepts an AI generator fake and preserves its non-mock metadata', async () => {
        const generator = new AiCreatureConceptGenerator({ async generateStructuredConcept() { return createCanonicalConcept() } }, { modelName: 'fake-model' })
        const result = await orchestrateGenerateConcept({
            profileId: 'profile-1', requestId: 'request-ai', body: request({ conceptMode: 'AI' }), policy: allowedPolicy,
            resolver: createResolver(), createGenerator: () => generator,
            repository: createInMemoryRequestRepository().repository,
        })

        expect(result).toMatchObject({ success: true, generation: { isMock: false, model: 'fake-model', attempts: 1 } })
    })

    it('enforces authentication, policy, operation and trait validation before generation', async () => {
        const common = { requestId: 'request-errors', resolver: createResolver(), createGenerator: () => new MockCreatureConceptGenerator(), repository: createInMemoryRequestRepository().repository }
        await expect(orchestrateGenerateConcept({ ...common, profileId: null, body: request(), policy: allowedPolicy })).resolves.toMatchObject({ code: 'UNAUTHENTICATED' })
        await expect(orchestrateGenerateConcept({ ...common, profileId: 'profile-1', body: request(), policy: { enabled: false, allowedConceptModes: new Set(), allowedImageProviderModes: new Set(), signedUrlTtlSeconds: 300, dailyRequestLimit: 10, dailyBudgetUsd: 0, staleRequestSeconds: 900 } })).resolves.toMatchObject({ code: 'LAB_DISABLED' })
        await expect(orchestrateGenerateConcept({ ...common, profileId: 'profile-1', body: request({ conceptMode: 'AI' }), policy: { enabled: true, allowedConceptModes: new Set(['MOCK']), allowedImageProviderModes: new Set(['MOCK']), signedUrlTtlSeconds: 300, dailyRequestLimit: 10, dailyBudgetUsd: 0, staleRequestSeconds: 900 } })).resolves.toMatchObject({ code: 'CONCEPT_MODE_NOT_ALLOWED' })
        await expect(orchestrateGenerateConcept({ ...common, profileId: 'profile-1', body: request({ operation: 'GENERATE_IMAGE' }), policy: allowedPolicy })).resolves.toMatchObject({ code: 'OPERATION_NOT_IMPLEMENTED' })
        await expect(orchestrateGenerateConcept({ ...common, profileId: 'profile-1', body: request({ visualTraitId: 'NOT_A_TRAIT' }), policy: allowedPolicy })).resolves.toMatchObject({ code: 'INVALID_VISUAL_TRAIT' })
        await expect(orchestrateGenerateConcept({ ...common, profileId: 'profile-1', body: request({ profileId: 'client-profile' }), policy: allowedPolicy })).resolves.toMatchObject({ code: 'INVALID_REQUEST' })
    })

    it('maps resolver failures and retries only through the domain orchestrator', async () => {
        const base = { profileId: 'profile-1', requestId: 'request-resolver', body: request(), policy: allowedPolicy, createGenerator: () => new MockCreatureConceptGenerator() }
        await expect(orchestrateGenerateConcept({ ...base, resolver: createResolver(null), repository: createInMemoryRequestRepository().repository })).resolves.toMatchObject({ code: 'CREATURE_NOT_FOUND' })
        await expect(orchestrateGenerateConcept({ ...base, resolver: createResolver({ ...ownedCreature, profileId: 'profile-2' }), repository: createInMemoryRequestRepository().repository })).resolves.toMatchObject({ code: 'CREATURE_NOT_OWNED' })
        await expect(orchestrateGenerateConcept({ ...base, resolver: createResolver({ ...ownedCreature, baseCreatureKey: 'UNKNOWN_CREATURE' }), repository: createInMemoryRequestRepository().repository })).resolves.toMatchObject({ code: 'CREATURE_IDENTITY_NOT_SUPPORTED' })

        const invalid = { ...createCanonicalConcept(), intensity: 1 } as unknown as CreatureTransformationConcept
        const retried = await orchestrateGenerateConcept({ ...base, resolver: createResolver(), createGenerator: () => sequenceGenerator([invalid, createCanonicalConcept()]), repository: createInMemoryRequestRepository().repository })
        expect(retried).toMatchObject({ success: true, generation: { attempts: 2 } })

        const rejected = await orchestrateGenerateConcept({ ...base, resolver: createResolver(), createGenerator: () => sequenceGenerator([invalid]), repository: createInMemoryRequestRepository().repository })
        expect(rejected).toMatchObject({ success: false, code: 'CONCEPT_REJECTED' })
    })

    it('maps technical AI failures to stable application errors', async () => {
        const result = await orchestrateGenerateConcept({
            profileId: 'profile-1', requestId: 'request-provider', body: request({ conceptMode: 'AI' }), policy: allowedPolicy,
            resolver: createResolver(),
            createGenerator: () => { throw new OpenAiStructuredConceptModelError('AI_RATE_LIMITED', 'rate') },
            repository: createInMemoryRequestRepository().repository,
        })

        expect(result).toMatchObject({ success: false, code: 'AI_RATE_LIMITED' })
        expect(getGenerateConceptFailureStatus('AI_RATE_LIMITED')).toBe(429)
        expect(getGenerateConceptFailureStatus('AI_BAD_REQUEST')).toBe(422)
        expect(getGenerateConceptFailureStatus('AI_AUTHENTICATION_FAILED')).toBe(502)
        expect(getGenerateConceptFailureStatus('AI_PERMISSION_DENIED')).toBe(502)
        expect(getGenerateConceptFailureStatus('AI_NETWORK_ERROR')).toBe(502)
        expect(getGenerateConceptFailureStatus('OPERATION_NOT_IMPLEMENTED')).toBe(501)
    })

    it('persists rejected and provider-failed concepts as FAILED', async () => {
        const rejectedRepository = createInMemoryRequestRepository()
        const invalid = { ...createCanonicalConcept(), intensity: 1 } as unknown as CreatureTransformationConcept
        const rejected = await orchestrateGenerateConcept({
            profileId: 'profile-1', requestId: 'request-rejected', body: request({ idempotencyKey: 'rejected-key' }), policy: allowedPolicy,
            resolver: createResolver(), createGenerator: () => sequenceGenerator([invalid]), repository: rejectedRepository.repository,
        })
        expect(rejected).toMatchObject({ success: false, code: 'CONCEPT_REJECTED', requestPersistence: { status: 'FAILED' } })
        expect(rejectedRepository.get('profile-1', 'rejected-key')).toMatchObject({ status: 'FAILED', errorCode: 'CONCEPT_REJECTED' })

        const failedRepository = createInMemoryRequestRepository()
        const failed = await orchestrateGenerateConcept({
            profileId: 'profile-1', requestId: 'request-provider-failed', body: request({ idempotencyKey: 'provider-failed-key', conceptMode: 'AI' }), policy: allowedPolicy,
            resolver: createResolver(), createGenerator: () => { throw new OpenAiStructuredConceptModelError('AI_RATE_LIMITED', 'rate') }, repository: failedRepository.repository,
        })
        expect(failed).toMatchObject({ success: false, code: 'AI_RATE_LIMITED', requestPersistence: { status: 'FAILED' } })
        expect(failedRepository.get('profile-1', 'provider-failed-key')).toMatchObject({ status: 'FAILED', errorCode: 'AI_RATE_LIMITED' })
    })

    it('does not generate a second concept for the same completed idempotency key', async () => {
        const persistence = createInMemoryRequestRepository()
        let generated = 0
        const generator: CreatureConceptGenerator = {
            metadata: { generator: 'counting-mock', isMock: true },
            async generateConcept() {
                generated += 1
                return createCanonicalConcept()
            },
        }
        const input = {
            profileId: 'profile-1', body: request({ idempotencyKey: 'same-concept-key' }), policy: allowedPolicy,
            resolver: createResolver(), createGenerator: () => generator, repository: persistence.repository,
        }
        const first = await orchestrateGenerateConcept({ ...input, requestId: 'request-concept-first' })
        const repeated = await orchestrateGenerateConcept({ ...input, requestId: 'request-concept-retry' })

        expect(first).toMatchObject({ success: true, requestPersistence: { status: 'SUCCEEDED', idempotencyStatus: 'CREATED' } })
        expect(repeated).toMatchObject({ success: false, code: 'IDEMPOTENT_REQUEST_ALREADY_COMPLETED', requestPersistence: { status: 'SUCCEEDED', idempotencyStatus: 'EXISTING' } })
        expect(generated).toBe(1)
        expect(persistence.calls.markRunning).toBe(1)
    })

    it('returns the prior state for running, stale and failed requests and reports quota outcomes', async () => {
        const runningRepository = createInMemoryRequestRepository()
        const runningReservation = await runningRepository.repository.reserve({
            profileId: 'profile-1', creatureId: 'creature-1', idempotencyKey: 'running-key', operation: 'GENERATE_CONCEPT',
            conceptMode: 'MOCK', dailyRequestLimit: 10, dailyBudgetUsd: 0,
        })
        if (runningReservation.outcome !== 'CREATED') throw new Error('test reservation failed')
        await runningRepository.repository.markRunning({ requestId: runningReservation.record.id, profileId: 'profile-1' })
        await expect(orchestrateGenerateConcept({
            profileId: 'profile-1', requestId: 'request-running', body: request({ idempotencyKey: 'running-key' }), policy: allowedPolicy,
            resolver: createResolver(), createGenerator: () => new MockCreatureConceptGenerator(), repository: runningRepository.repository,
        })).resolves.toMatchObject({ code: 'REQUEST_ALREADY_IN_PROGRESS', requestPersistence: { status: 'RUNNING', idempotencyStatus: 'EXISTING' } })

        const staleRepository = createInMemoryRequestRepository()
        const staleReservation = await staleRepository.repository.reserve({
            profileId: 'profile-1', creatureId: 'creature-1', idempotencyKey: 'stale-key', operation: 'GENERATE_CONCEPT',
            conceptMode: 'MOCK', dailyRequestLimit: 10, dailyBudgetUsd: 0,
        })
        if (staleReservation.outcome !== 'CREATED') throw new Error('test reservation failed')
        const staleRunning = await staleRepository.repository.markRunning({ requestId: staleReservation.record.id, profileId: 'profile-1' })
        staleRepository.put({ ...staleRunning, startedAt: '2000-01-01T00:00:00.000Z' })
        await expect(orchestrateGenerateConcept({
            profileId: 'profile-1', requestId: 'request-stale', body: request({ idempotencyKey: 'stale-key' }), policy: { ...allowedPolicy, staleRequestSeconds: 60 },
            resolver: createResolver(), createGenerator: () => new MockCreatureConceptGenerator(), repository: staleRepository.repository,
        })).resolves.toMatchObject({ code: 'REQUEST_STALE', requestPersistence: { status: 'RUNNING', idempotencyStatus: 'EXISTING' } })

        const failedRepository = createInMemoryRequestRepository()
        const failedReservation = await failedRepository.repository.reserve({
            profileId: 'profile-1', creatureId: 'creature-1', idempotencyKey: 'failed-key', operation: 'GENERATE_CONCEPT',
            conceptMode: 'MOCK', dailyRequestLimit: 10, dailyBudgetUsd: 0,
        })
        if (failedReservation.outcome !== 'CREATED') throw new Error('test reservation failed')
        await failedRepository.repository.markFailed({ requestId: failedReservation.record.id, profileId: 'profile-1', errorCode: 'CONCEPT_REJECTED', errorMessage: 'failed' })
        await expect(orchestrateGenerateConcept({
            profileId: 'profile-1', requestId: 'request-failed', body: request({ idempotencyKey: 'failed-key' }), policy: allowedPolicy,
            resolver: createResolver(), createGenerator: () => new MockCreatureConceptGenerator(), repository: failedRepository.repository,
        })).resolves.toMatchObject({ code: 'REQUEST_PREVIOUSLY_FAILED', requestPersistence: { status: 'FAILED', idempotencyStatus: 'EXISTING' } })

        for (const outcome of ['DAILY_LIMIT_REACHED', 'DAILY_BUDGET_REACHED'] as const) {
            const quotaRepository = createInMemoryRequestRepository({ reserveOverride: () => ({ outcome }) })
            await expect(orchestrateGenerateConcept({
                profileId: 'profile-1', requestId: `request-${outcome}`, body: request({ idempotencyKey: outcome }), policy: allowedPolicy,
                resolver: createResolver(), createGenerator: () => new MockCreatureConceptGenerator(), repository: quotaRepository.repository,
            })).resolves.toMatchObject({ code: outcome })
        }
    })
})
