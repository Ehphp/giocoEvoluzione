import { describe, expect, it } from 'vitest'

import { readCreatureTransformationLabPolicy } from './lab-policy.ts'

describe('creature transformation lab policy', () => {
    it('is disabled by default and reads only explicitly allowed concept modes', () => {
        const policy = readCreatureTransformationLabPolicy(() => undefined)

        expect(policy.enabled).toBe(false)
        expect(policy.allowedConceptModes.size).toBe(0)
        expect(policy.allowedImageProviderModes.size).toBe(0)
        expect(policy.signedUrlTtlSeconds).toBe(300)
        expect(policy.dailyRequestLimit).toBe(10)
        expect(policy.dailyBudgetUsd).toBe(0)
        expect(policy.staleRequestSeconds).toBe(900)
        expect(policy.realImage).toMatchObject({ enabled: false, provider: null, apiKey: null, model: null, quality: 'medium', timeoutMs: 120000, estimatedCostUsd: null })
    })

    it('parses the development policy without trusting client input', () => {
        const policy = readCreatureTransformationLabPolicy((name) => ({
            CREATURE_TRANSFORMATION_LAB_ENABLED: 'true',
            CREATURE_TRANSFORMATION_ALLOWED_CONCEPT_MODES: 'MOCK, AI, invalid',
            CREATURE_TRANSFORMATION_ALLOWED_IMAGE_PROVIDER_MODES: 'MOCK, REAL, invalid',
            CREATURE_TRANSFORMATION_SIGNED_URL_TTL_SECONDS: '180',
            CREATURE_TRANSFORMATION_DAILY_REQUEST_LIMIT: '12',
            CREATURE_TRANSFORMATION_DAILY_BUDGET_USD: '3.25',
            CREATURE_TRANSFORMATION_STALE_REQUEST_SECONDS: '240',
            CREATURE_TRANSFORMATION_REAL_IMAGE_ENABLED: 'true',
            CREATURE_TRANSFORMATION_REAL_IMAGE_PROVIDER: 'OPENAI',
            CREATURE_TRANSFORMATION_REAL_IMAGE_ALLOWED_PROFILE_IDS: 'profile-1, profile-2',
            OPENAI_IMAGE_API_KEY: 'server-only-test-key',
            OPENAI_IMAGE_MODEL: 'configured-image-model',
            OPENAI_IMAGE_QUALITY: 'high',
            OPENAI_IMAGE_TIMEOUT_MS: '90000',
            OPENAI_IMAGE_ESTIMATED_COST_USD: '0.12',
        })[name])

        expect(policy.enabled).toBe(true)
        expect(policy.allowedConceptModes).toEqual(new Set(['MOCK', 'AI']))
        expect(policy.allowedImageProviderModes).toEqual(new Set(['MOCK']))
        expect(policy.signedUrlTtlSeconds).toBe(180)
        expect(policy.dailyRequestLimit).toBe(12)
        expect(policy.dailyBudgetUsd).toBe(3.25)
        expect(policy.staleRequestSeconds).toBe(240)
        expect(policy.realImage).toMatchObject({ enabled: true, provider: 'OPENAI', allowedProfileIds: new Set(['profile-1', 'profile-2']), model: 'configured-image-model', quality: 'high', timeoutMs: 90000, estimatedCostUsd: 0.12 })
    })

    it('uses bounded fail-safe defaults for invalid quote, budget and stale configuration', () => {
        const policy = readCreatureTransformationLabPolicy((name) => ({
            CREATURE_TRANSFORMATION_DAILY_REQUEST_LIMIT: '0',
            CREATURE_TRANSFORMATION_DAILY_BUDGET_USD: '-1',
            CREATURE_TRANSFORMATION_STALE_REQUEST_SECONDS: '999999',
            OPENAI_IMAGE_TIMEOUT_MS: '999999',
            OPENAI_IMAGE_ESTIMATED_COST_USD: '0',
        })[name])

        expect(policy.dailyRequestLimit).toBe(10)
        expect(policy.dailyBudgetUsd).toBe(0)
        expect(policy.staleRequestSeconds).toBe(900)
        expect(policy.realImage).toMatchObject({ timeoutMs: 120000, estimatedCostUsd: null })
    })
})
