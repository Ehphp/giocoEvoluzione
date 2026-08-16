import { describe, expect, it } from 'vitest'

import { readCreatureTransformationLabPolicy } from './lab-policy.ts'

describe('creature transformation lab policy', () => {
    it('is closed by default: no lab, no access lists, no configured FLUX pipeline', () => {
        const policy = readCreatureTransformationLabPolicy(() => undefined)

        expect(policy.enabled).toBe(false)
        expect(policy.paidGenerationProfileIds.size).toBe(0)
        expect(policy.labProfileIds.size).toBe(0)
        expect(policy.signedUrlTtlSeconds).toBe(300)
        expect(policy.dailyRequestLimit).toBe(10)
        expect(policy.dailyBudgetUsd).toBe(0)
        expect(policy.staleRequestSeconds).toBe(3900)
        expect(policy.dailyRealImageLimit).toBe(3)
        expect(policy.globalDailyRealImageLimit).toBe(10)
        expect(policy.globalConcurrentRealImageLimit).toBe(2)
        expect(policy.realImageCooldownSeconds).toBe(60)
        expect(policy.flux).toMatchObject({ apiKey: null, model: 'fal-ai/flux-2-klein/9b/edit', timeoutMs: 30_000, promptTemplateVersion: 'flux-micro-v7', estimatedCostUsd: null, maxEstimatedCostUsd: null, microConceptApiKey: null, microConceptModel: null })
        expect(policy.visualProgression).toMatchObject({ enabled: false, productionGenerationEnabled: false, adoptionEnabled: false, backgroundCleanupEnabled: false, winsRequired: 3 })
    })

    it('keeps the body-plan mutation capability disabled unless it is explicitly enabled', () => {
        expect(readCreatureTransformationLabPolicy(() => undefined).bodyPlanMutation.enabled).toBe(false)
        expect(readCreatureTransformationLabPolicy((name) => ({ CREATURE_EVOLUTION_BODY_PLAN_MUTATION_ENABLED: 'yes' })[name]).bodyPlanMutation.enabled).toBe(false)
        expect(readCreatureTransformationLabPolicy((name) => ({ CREATURE_EVOLUTION_BODY_PLAN_MUTATION_ENABLED: 'true' })[name]).bodyPlanMutation.enabled).toBe(true)
    })

    it('reads the server-only FLUX configuration and the access lists without trusting client input', () => {
        const policy = readCreatureTransformationLabPolicy((name) => ({
            CREATURE_TRANSFORMATION_LAB_ENABLED: 'true',
            CREATURE_TRANSFORMATION_SIGNED_URL_TTL_SECONDS: '180',
            CREATURE_TRANSFORMATION_DAILY_REQUEST_LIMIT: '12',
            CREATURE_TRANSFORMATION_DAILY_BUDGET_USD: '3.25',
            CREATURE_TRANSFORMATION_STALE_REQUEST_SECONDS: '240',
            CREATURE_TRANSFORMATION_REAL_IMAGE_ALLOWED_PROFILE_IDS: 'profile-1, profile-2, not valid!',
            CREATURE_TRANSFORMATION_LAB_PROFILE_IDS: 'profile-1',
            FAL_FLUX_API_KEY: 'server-only-fal-key',
            FAL_FLUX_MODEL: 'configured-flux-edit-model',
            FAL_FLUX_TIMEOUT_MS: '45000',
            FLUX_PROMPT_TEMPLATE_VERSION: 'flux-minimal-v1',
            FAL_FLUX_ESTIMATED_COST_USD: '0.0203',
            FAL_FLUX_MAX_ESTIMATED_COST_USD: '0.03',
            OPENAI_API_KEY: 'server-only-concept-key',
            FLUX_MICRO_CONCEPT_MODEL: 'configured-micro-concept-model',
            CREATURE_VISUAL_PROGRESSION_ENABLED: 'true',
            CREATURE_VISUAL_PRODUCTION_GENERATION_ENABLED: 'true',
            CREATURE_VISUAL_ADOPTION_ENABLED: 'true',
            CREATURE_VISUAL_PROGRESSION_WINS_REQUIRED: '4',
        })[name])

        expect(policy.enabled).toBe(true)
        expect(policy.signedUrlTtlSeconds).toBe(180)
        expect(policy.dailyRequestLimit).toBe(12)
        expect(policy.dailyBudgetUsd).toBe(3.25)
        expect(policy.staleRequestSeconds).toBe(240)
        expect(policy.paidGenerationProfileIds).toEqual(new Set(['profile-1', 'profile-2']))
        expect(policy.labProfileIds).toEqual(new Set(['profile-1']))
        expect(policy.flux).toMatchObject({
            apiKey: 'server-only-fal-key', model: 'configured-flux-edit-model', timeoutMs: 45000,
            promptTemplateVersion: 'flux-minimal-v1', estimatedCostUsd: 0.0203, maxEstimatedCostUsd: 0.03, microConceptModel: 'configured-micro-concept-model',
        })
        expect(policy.visualProgression).toMatchObject({ enabled: true, productionGenerationEnabled: true, adoptionEnabled: true, winsRequired: 4 })
    })

    it('still honours the previously deployed lab allowlist variable', () => {
        const policy = readCreatureTransformationLabPolicy((name) => ({ CREATURE_TRANSFORMATION_LINEAGE_EXPERIMENT_PROFILE_IDS: 'profile-9' })[name])

        expect(policy.labProfileIds).toEqual(new Set(['profile-9']))
    })

    it('uses the minimal prompt only when explicitly selected by server policy', () => {
        const policy = readCreatureTransformationLabPolicy((name) => ({ FLUX_PROMPT_TEMPLATE_VERSION: 'flux-minimal-v1' })[name])

        expect(policy.flux.promptTemplateVersion).toBe('flux-minimal-v1')
    })

    it('restores flux-micro-v5 when explicitly selected by server policy', () => {
        const policy = readCreatureTransformationLabPolicy((name) => ({ FLUX_PROMPT_TEMPLATE_VERSION: 'flux-micro-v5' })[name])

        expect(policy.flux.promptTemplateVersion).toBe('flux-micro-v5')
    })

    it('retains flux-micro-v6 when explicitly selected by server policy', () => {
        const policy = readCreatureTransformationLabPolicy((name) => ({ FLUX_PROMPT_TEMPLATE_VERSION: 'flux-micro-v6' })[name])

        expect(policy.flux.promptTemplateVersion).toBe('flux-micro-v6')
    })

    it('uses bounded fail-safe defaults for invalid quota, budget and cost configuration', () => {
        const policy = readCreatureTransformationLabPolicy((name) => ({
            CREATURE_TRANSFORMATION_DAILY_REQUEST_LIMIT: '0',
            CREATURE_TRANSFORMATION_DAILY_BUDGET_USD: '-1',
            CREATURE_TRANSFORMATION_STALE_REQUEST_SECONDS: '999999',
            FAL_FLUX_TIMEOUT_MS: '999999',
            FAL_FLUX_ESTIMATED_COST_USD: '0',
        })[name])

        expect(policy.dailyRequestLimit).toBe(10)
        expect(policy.dailyBudgetUsd).toBe(0)
        expect(policy.staleRequestSeconds).toBe(3900)
        expect(policy.flux).toMatchObject({ timeoutMs: 30_000, promptTemplateVersion: 'flux-micro-v7', estimatedCostUsd: null })
    })

    it('exposes no legacy pipeline switch, provider or benchmark configuration', () => {
        const policy = readCreatureTransformationLabPolicy(() => 'true') as unknown as Record<string, unknown>

        expect(policy).not.toHaveProperty('realImage')
        expect(policy).not.toHaveProperty('benchmark')
        expect(policy).not.toHaveProperty('allowedConceptModes')
        expect(policy).not.toHaveProperty('allowedImageProviderModes')
        expect(policy).not.toHaveProperty('expressiveConceptExperimentEnabled')
        expect(policy).not.toHaveProperty('lineageExperimentAllowedProfileIds')
        expect(policy.visualProgression).not.toHaveProperty('productionPipeline')
        expect(policy.visualProgression).not.toHaveProperty('productionGenerationProfileId')
    })
})
