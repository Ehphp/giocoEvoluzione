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

const ownedCreature: StoredPlayerCreature = { id: 'creature-1', profileId: 'profile-1', baseCreatureKey: 'VERDANT_HATCHLING' }
const allowedPolicy: CreatureTransformationLabPolicy = { enabled: true, allowedConceptModes: new Set(['MOCK', 'AI']) }

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
        })

        expect(result).toMatchObject({
            success: true,
            identity: { description: 'Piccola creatura turchese con volto a mezzaluna e coda corta.' },
            generation: { isMock: true, attempts: 1, latencyMs: 35 },
        })
        if (result.success) expect(result.prompt.prompt).toContain('IDENTITY')
    })

    it('accepts an AI generator fake and preserves its non-mock metadata', async () => {
        const generator = new AiCreatureConceptGenerator({ async generateStructuredConcept() { return createValidConcept() } }, { modelName: 'fake-model' })
        const result = await orchestrateGenerateConcept({
            profileId: 'profile-1', requestId: 'request-ai', body: request({ conceptMode: 'AI' }), policy: allowedPolicy,
            resolver: createResolver(), createGenerator: () => generator,
        })

        expect(result).toMatchObject({ success: true, generation: { isMock: false, model: 'fake-model', attempts: 1 } })
    })

    it('enforces authentication, policy, operation and trait validation before generation', async () => {
        const common = { requestId: 'request-errors', resolver: createResolver(), createGenerator: () => new MockCreatureConceptGenerator() }
        await expect(orchestrateGenerateConcept({ ...common, profileId: null, body: request(), policy: allowedPolicy })).resolves.toMatchObject({ code: 'UNAUTHENTICATED' })
        await expect(orchestrateGenerateConcept({ ...common, profileId: 'profile-1', body: request(), policy: { enabled: false, allowedConceptModes: new Set() } })).resolves.toMatchObject({ code: 'LAB_DISABLED' })
        await expect(orchestrateGenerateConcept({ ...common, profileId: 'profile-1', body: request({ conceptMode: 'AI' }), policy: { enabled: true, allowedConceptModes: new Set(['MOCK']) } })).resolves.toMatchObject({ code: 'CONCEPT_MODE_NOT_ALLOWED' })
        await expect(orchestrateGenerateConcept({ ...common, profileId: 'profile-1', body: request({ operation: 'GENERATE_IMAGE' }), policy: allowedPolicy })).resolves.toMatchObject({ code: 'OPERATION_NOT_IMPLEMENTED' })
        await expect(orchestrateGenerateConcept({ ...common, profileId: 'profile-1', body: request({ visualTraitId: 'NOT_A_TRAIT' }), policy: allowedPolicy })).resolves.toMatchObject({ code: 'INVALID_VISUAL_TRAIT' })
        await expect(orchestrateGenerateConcept({ ...common, profileId: 'profile-1', body: request({ profileId: 'client-profile' }), policy: allowedPolicy })).resolves.toMatchObject({ code: 'INVALID_REQUEST' })
    })

    it('maps resolver failures and retries only through the domain orchestrator', async () => {
        const base = { profileId: 'profile-1', requestId: 'request-resolver', body: request(), policy: allowedPolicy, createGenerator: () => new MockCreatureConceptGenerator() }
        await expect(orchestrateGenerateConcept({ ...base, resolver: createResolver(null) })).resolves.toMatchObject({ code: 'CREATURE_NOT_FOUND' })
        await expect(orchestrateGenerateConcept({ ...base, resolver: createResolver({ ...ownedCreature, profileId: 'profile-2' }) })).resolves.toMatchObject({ code: 'CREATURE_NOT_OWNED' })
        await expect(orchestrateGenerateConcept({ ...base, resolver: createResolver({ ...ownedCreature, baseCreatureKey: 'UNKNOWN_CREATURE' }) })).resolves.toMatchObject({ code: 'CREATURE_IDENTITY_NOT_SUPPORTED' })

        const invalid = { ...createValidConcept(), intensity: 1 } as unknown as CreatureTransformationConcept
        const retried = await orchestrateGenerateConcept({ ...base, resolver: createResolver(), createGenerator: () => sequenceGenerator([invalid, createValidConcept()]) })
        expect(retried).toMatchObject({ success: true, generation: { attempts: 2 } })

        const rejected = await orchestrateGenerateConcept({ ...base, resolver: createResolver(), createGenerator: () => sequenceGenerator([invalid]) })
        expect(rejected).toMatchObject({ success: false, code: 'CONCEPT_REJECTED' })
    })

    it('maps technical AI failures to stable application errors', async () => {
        const result = await orchestrateGenerateConcept({
            profileId: 'profile-1', requestId: 'request-provider', body: request({ conceptMode: 'AI' }), policy: allowedPolicy,
            resolver: createResolver(),
            createGenerator: () => { throw new OpenAiStructuredConceptModelError('AI_RATE_LIMITED', 'rate') },
        })

        expect(result).toMatchObject({ success: false, code: 'AI_RATE_LIMITED' })
        expect(getGenerateConceptFailureStatus('AI_RATE_LIMITED')).toBe(429)
        expect(getGenerateConceptFailureStatus('OPERATION_NOT_IMPLEMENTED')).toBe(501)
    })
})
