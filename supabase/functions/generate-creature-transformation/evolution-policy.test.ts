import { describe, expect, it } from 'vitest'

import { readCreatureEvolutionPolicy } from './evolution-policy.ts'

describe('creature evolution policy', () => {
    it('is closed by default: no access lists, no configured provider or concept credentials', () => {
        const policy = readCreatureEvolutionPolicy(() => undefined)

        expect(policy.paidGenerationProfileIds.size).toBe(0)
        expect(policy.signedUrlTtlSeconds).toBe(300)
        expect(policy.dailyRequestLimit).toBe(10)
        expect(policy.dailyBudgetUsd).toBe(0)
        expect(policy.staleRequestSeconds).toBe(3900)
        expect(policy.dailyRealImageLimit).toBe(3)
        expect(policy.globalDailyRealImageLimit).toBe(10)
        expect(policy.globalConcurrentRealImageLimit).toBe(2)
        expect(policy.realImageCooldownSeconds).toBe(60)
        expect(policy.microConcept).toEqual({ apiKey: null, model: null })
        expect(policy.seedream).toMatchObject({
            apiKey: null,
            model: 'fal-ai/bytedance/seedream/v4.5/edit',
            timeoutMs: 30_000,
            estimatedCostUsd: null,
            maxEstimatedCostUsd: null,
            structuralMutationsEnabled: false,
            parameters: { imageSize: { width: 1920, height: 2880 } },
        })
        expect(policy.visualProgression).toMatchObject({
            enabled: false,
            productionGenerationEnabled: false,
            adoptionEnabled: false,
            winsRequired: 3,
        })
    })

    it('keeps the body-plan mutation capability disabled unless it is explicitly enabled', () => {
        expect(readCreatureEvolutionPolicy(() => undefined).bodyPlanMutation.enabled).toBe(false)
        expect(
            readCreatureEvolutionPolicy((name) => ({ CREATURE_EVOLUTION_BODY_PLAN_MUTATION_ENABLED: 'yes' })[name])
                .bodyPlanMutation.enabled,
        ).toBe(false)
        expect(
            readCreatureEvolutionPolicy((name) => ({ CREATURE_EVOLUTION_BODY_PLAN_MUTATION_ENABLED: 'true' })[name])
                .bodyPlanMutation.enabled,
        ).toBe(true)
    })

    it('reads the server-only provider configuration and the access lists without trusting client input', () => {
        const policy = readCreatureEvolutionPolicy(
            (name) =>
                ({
                    CREATURE_TRANSFORMATION_SIGNED_URL_TTL_SECONDS: '180',
                    CREATURE_TRANSFORMATION_DAILY_REQUEST_LIMIT: '12',
                    CREATURE_TRANSFORMATION_DAILY_BUDGET_USD: '3.25',
                    CREATURE_TRANSFORMATION_STALE_REQUEST_SECONDS: '240',
                    CREATURE_TRANSFORMATION_REAL_IMAGE_ALLOWED_PROFILE_IDS: 'profile-1, profile-2, not valid!',
                    FAL_SEEDREAM_API_KEY: 'server-only-fal-key',
                    FAL_SEEDREAM_TIMEOUT_MS: '45000',
                    SEEDREAM_ESTIMATED_COST_PER_GENERATION: '0.07',
                    SEEDREAM_MAX_ESTIMATED_COST_PER_GENERATION: '0.08',
                    OPENAI_API_KEY: 'server-only-concept-key',
                    FLUX_MICRO_CONCEPT_MODEL: 'configured-micro-concept-model',
                    CREATURE_VISUAL_PROGRESSION_ENABLED: 'true',
                    CREATURE_VISUAL_PRODUCTION_GENERATION_ENABLED: 'true',
                    CREATURE_VISUAL_ADOPTION_ENABLED: 'true',
                    CREATURE_VISUAL_PROGRESSION_WINS_REQUIRED: '4',
                })[name],
        )

        expect(policy.signedUrlTtlSeconds).toBe(180)
        expect(policy.dailyRequestLimit).toBe(12)
        expect(policy.dailyBudgetUsd).toBe(3.25)
        expect(policy.staleRequestSeconds).toBe(240)
        expect(policy.paidGenerationProfileIds).toEqual(new Set(['profile-1', 'profile-2']))
        expect(policy.seedream).toMatchObject({
            apiKey: 'server-only-fal-key',
            timeoutMs: 45000,
            estimatedCostUsd: 0.07,
            maxEstimatedCostUsd: 0.08,
        })
        expect(policy.microConcept).toEqual({
            apiKey: 'server-only-concept-key',
            model: 'configured-micro-concept-model',
        })
        expect(policy.visualProgression).toMatchObject({
            enabled: true,
            productionGenerationEnabled: true,
            adoptionEnabled: true,
            winsRequired: 4,
        })
    })

    it('falls back to the shared Fal key, and keeps the Seedream billing envelope required rather than defaulted', () => {
        const shared = readCreatureEvolutionPolicy((name) => ({ FAL_KEY: 'shared-fal-key' })[name])
        expect(shared.seedream.apiKey).toBe('shared-fal-key')
        // Cost variables have no safe default: an unset envelope must read as "not configured".
        expect(shared.seedream.estimatedCostUsd).toBeNull()
        expect(shared.seedream.maxEstimatedCostUsd).toBeNull()
    })

    it('enables Seedream structural mutations only through its own explicit flag', () => {
        expect(readCreatureEvolutionPolicy(() => undefined).seedream.structuralMutationsEnabled).toBe(false)
        expect(
            readCreatureEvolutionPolicy((name) => ({ SEEDREAM_STRUCTURAL_MUTATIONS_ENABLED: 'true' })[name]).seedream
                .structuralMutationsEnabled,
        ).toBe(true)
    })

    it('uses bounded fail-safe defaults for invalid quota, budget and cost configuration', () => {
        const policy = readCreatureEvolutionPolicy(
            (name) =>
                ({
                    CREATURE_TRANSFORMATION_DAILY_REQUEST_LIMIT: '0',
                    CREATURE_TRANSFORMATION_DAILY_BUDGET_USD: '-1',
                    CREATURE_TRANSFORMATION_STALE_REQUEST_SECONDS: '999999',
                    FAL_SEEDREAM_TIMEOUT_MS: '999999',
                    SEEDREAM_ESTIMATED_COST_PER_GENERATION: '0',
                })[name],
        )

        expect(policy.dailyRequestLimit).toBe(10)
        expect(policy.dailyBudgetUsd).toBe(0)
        expect(policy.staleRequestSeconds).toBe(3900)
        expect(policy.seedream).toMatchObject({ timeoutMs: 30_000, estimatedCostUsd: null })
    })

    it('exposes no legacy pipeline switch, FLUX provider or benchmark configuration', () => {
        const policy = readCreatureEvolutionPolicy(() => 'true') as unknown as Record<string, unknown>

        expect(policy).not.toHaveProperty('flux')
        expect(policy).not.toHaveProperty('imagePipeline')
        expect(policy).not.toHaveProperty('labProfileIds')
        expect(policy).not.toHaveProperty('realImage')
        expect(policy).not.toHaveProperty('benchmark')
        expect(policy).not.toHaveProperty('allowedConceptModes')
        expect(policy).not.toHaveProperty('allowedImageProviderModes')
        expect(policy).not.toHaveProperty('expressiveConceptExperimentEnabled')
        expect(policy).not.toHaveProperty('lineageExperimentAllowedProfileIds')
        expect(policy.visualProgression).not.toHaveProperty('productionPipeline')
        expect(policy.visualProgression).not.toHaveProperty('backgroundCleanupEnabled')
    })
})
