import { describe, expect, it, vi } from 'vitest'

import { ImageValidator } from '../../../shared/creature-transformations/image-validator.ts'
import { FAL_SEEDREAM_MODEL } from './fal-flux-image-provider.ts'
import { orchestrateAdoptCreatureTransformation, orchestrateGenerateUnlockedTransformation, orchestrateSelectCreatureVisualProgressTrack } from './edge-orchestration.ts'
import { readCreatureTransformationLabPolicy } from './lab-policy.ts'
import { createInMemoryRequestRepository } from './test-request-repository.ts'
import { createResolvedCreatureSource, createTestResolver, createTestStorage, FluxTestValidator } from './test-creature-fixtures.ts'

const PROFILE_ID = 'profile-1'
const CREATURE_ID = '00000000-0000-4000-8000-000000000001'
const TRACK_ID = '00000000-0000-4000-8000-000000000006'

const PRODUCTION_ENVIRONMENT: Record<string, string> = {
    CREATURE_VISUAL_PROGRESSION_ENABLED: 'true',
    CREATURE_VISUAL_PRODUCTION_GENERATION_ENABLED: 'true',
    CREATURE_VISUAL_ADOPTION_ENABLED: 'true',
    FAL_FLUX_API_KEY: 'server-only-fal-key',
    FAL_FLUX_ESTIMATED_COST_USD: '0.0203',
    FAL_FLUX_MAX_ESTIMATED_COST_USD: '0.03',
    OPENAI_API_KEY: 'server-only-concept-key',
    FLUX_MICRO_CONCEPT_MODEL: 'micro-concept-model',
    CREATURE_TRANSFORMATION_DAILY_BUDGET_USD: '1',
}

function policyWith(extra: Record<string, string> = {}) {
    return readCreatureTransformationLabPolicy((name) => ({ ...PRODUCTION_ENVIRONMENT, ...extra })[name])
}

function readyTrack(evolutionTargetId: string) {
    return {
        id: TRACK_ID, creatureId: CREATURE_ID, visualTraitId: null, evolutionTargetId,
        status: 'READY' as const, progress: 3, target: 3, readyAt: null, generatedRequestId: null, completedVersionId: null,
    }
}

function createProductionInput(options: {
    evolutionTargetId?: string
    policyOverrides?: Record<string, string>
    source?: ReturnType<typeof createResolvedCreatureSource>
    idempotencyKey?: string
    validator?: ImageValidator
    providerModel?: string
    seedreamSubmit?: ReturnType<typeof vi.fn>
} = {}) {
    const persistence = createInMemoryRequestRepository()
    const tasks: Promise<void>[] = []
    const track = readyTrack(options.evolutionTargetId ?? 'LIMBS_AND_FEET')
    const markBackgroundRemovalPending = vi.fn(async () => ({ ...track, status: 'POST_PROCESSING' as const }))
    const completeGeneration = vi.fn(async () => track)
    const generate = vi.fn(async () => ({ conceptName: 'Pale rematrici', mutationIdea: 'Membrane pieghevoli.', visualDetails: ['lamelle'] }))
    const submit = vi.fn(async () => ({ provider: 'fal.ai' as const, model: options.providerModel ?? 'fal-ai/flux-2-klein/9b/edit', providerRequestId: `fal-${options.idempotencyKey ?? 'production'}`, estimatedCostUsd: 0.0203 }))
    const seedreamSubmit = options.seedreamSubmit ?? vi.fn(async () => ({ provider: 'fal.ai' as const, model: FAL_SEEDREAM_MODEL, providerRequestId: `seedream-${options.idempotencyKey ?? 'production'}`, estimatedCostUsd: 0.07 }))
    const input = {
        profileId: PROFILE_ID, canGenerateImages: true, requestId: 'http-request',
        body: { operation: 'GENERATE_UNLOCKED_TRANSFORMATION', creatureId: CREATURE_ID, progressTrackId: TRACK_ID, idempotencyKey: options.idempotencyKey ?? 'production-key' },
        policy: policyWith(options.policyOverrides),
        resolver: createTestResolver(options.source ?? createResolvedCreatureSource()),
        storage: createTestStorage(),
        repository: persistence.repository,
        visualRepository: {
            async getTrack() { return track },
            async resolveTrackTrait({ visualTraitId }: { visualTraitId: string }) { return { ...track, visualTraitId } },
            async startGeneration() { return { ...track, visualTraitId: 'LOCOMOTION_ADAPTATION', status: 'GENERATING' as const } },
            markBackgroundRemovalPending,
            completeGeneration,
        },
        createFluxMicroConceptGenerator: () => ({ generate }),
        createFalFluxImageProvider: () => ({ submitFlux: submit }),
        createSeedreamEvolutionProvider: () => ({ submitSeedreamEvolution: seedreamSubmit }),
        falWebhookUrl: 'https://project.supabase.co/functions/v1/fal-creature-transformation-webhook',
        deferBackgroundTask: (task: Promise<void>) => { tasks.push(task) },
        validator: options.validator ?? new FluxTestValidator(),
    }
    return { input, persistence, tasks, generate, submit, seedreamSubmit, markBackgroundRemovalPending, completeGeneration }
}

describe('FLUX production pipeline', () => {
    it('runs progress track → body plan → anatomy contract → micro-concept → fal.ai → post-processing handover', async () => {
        const context = createProductionInput()

        const result = await orchestrateGenerateUnlockedTransformation(context.input as never)
        expect(result).toMatchObject({ success: true, accepted: true })
        expect(context.generate).toHaveBeenCalledOnce()
        const plan = context.generate.mock.calls[0]![0].plan
        expect(plan).toMatchObject({ evolutionTargetId: 'LIMBS_AND_FEET', capability: 'ANATOMICAL_MUTATION', bodyPlanId: 'QUADRUPED', resultBodyPlanId: 'QUADRUPED' })
        expect(plan.anatomyContract.topologyInvariants.join(' ')).toContain('Keep exactly 4 limbs')
        expect(context.submit).toHaveBeenCalledOnce()
        const prompt = String(context.submit.mock.calls[0]![0].prompt)
        expect(prompt).toContain('SELECTED TARGET: LIMBS_AND_FEET')
        expect(prompt).toContain('PRIMARY MUTATION AUTHORITY')
        expect(prompt).toMatch(/MINIMUM VISUAL DELTA[\s\S]*reads at normal gameplay scale/i)
        expect(prompt).toContain('STRICT FRAMING')
        expect(context.markBackgroundRemovalPending).not.toHaveBeenCalled()
        expect(context.persistence.get(PROFILE_ID, 'production-key')).toMatchObject({
            status: 'RUNNING', provider: 'fal.ai', providerRequestId: 'fal-production',
            promptTemplateVersion: 'flux-micro-v7', evolutionTargetId: 'LIMBS_AND_FEET',
        })
        expect(context.persistence.get(PROFILE_ID, 'production-key')?.conceptSnapshot).toMatchObject({
            schemaVersion: 'flux-micro-v2', capability: 'ANATOMICAL_MUTATION', evolutionTargetId: 'LIMBS_AND_FEET',
        })
    })

    it('uses flux-minimal-v1 for normal gameplay only when selected by server policy', async () => {
        const context = createProductionInput({
            idempotencyKey: 'production-minimal',
            policyOverrides: { FLUX_PROMPT_TEMPLATE_VERSION: 'flux-minimal-v1' },
        })

        await orchestrateGenerateUnlockedTransformation(context.input as never)
        expect(context.generate).toHaveBeenCalledOnce()
        expect(context.submit).toHaveBeenCalledOnce()
        const prompt = String(context.submit.mock.calls[0]![0].prompt)
        expect(prompt).toContain('EVOLUTION:')
        expect(prompt).not.toMatch(/HARD INVARIANTS|PRIMARY MUTATION AUTHORITY|MINIMUM VISUAL DELTA|NON-TARGET PRESERVATION/i)
        expect(context.persistence.get(PROFILE_ID, 'production-minimal')).toMatchObject({
            status: 'RUNNING', promptTemplateVersion: 'flux-minimal-v1', promptText: prompt,
        })
    })

    it('routes an opted-in gameplay request through the persisted locked Seedream workflow', async () => {
        const context = createProductionInput({
            idempotencyKey: 'seedream-production',
            policyOverrides: {
                CREATURE_EVOLUTION_IMAGE_PIPELINE: 'seedream',
                FAL_SEEDREAM_API_KEY: 'seedream-only-key',
                SEEDREAM_ESTIMATED_COST_PER_GENERATION: '0.07',
                SEEDREAM_MAX_ESTIMATED_COST_PER_GENERATION: '0.08',
            },
        })

        await expect(orchestrateGenerateUnlockedTransformation(context.input as never)).resolves.toMatchObject({ success: true, accepted: true })
        await expect(orchestrateGenerateUnlockedTransformation(context.input as never)).resolves.toMatchObject({ success: false, code: 'REQUEST_ALREADY_IN_PROGRESS' })

        expect(context.submit).not.toHaveBeenCalled()
        expect(context.seedreamSubmit).toHaveBeenCalledOnce()
        expect(context.seedreamSubmit).toHaveBeenCalledWith(expect.objectContaining({ imageSize: { width: 1920, height: 2880 } }))
        const prompt = String(context.seedreamSubmit.mock.calls[0]![0].prompt)
        expect(prompt).toContain('VIEWPOINT LOCK')
        expect(prompt).toContain('SELECTED TARGET: LIMBS_AND_FEET')
        expect(context.persistence.get(PROFILE_ID, 'seedream-production')).toMatchObject({
            status: 'RUNNING', provider: 'fal.ai', model: FAL_SEEDREAM_MODEL,
            promptTemplateVersion: 'seedream-locked-dynamic-v1',
            falWorkflow: { kind: 'SEEDREAM_PRODUCTION', parameters: { imageSize: { width: 1920, height: 2880 } } },
        })
    })

    it('uses the tail-specific locked policy in the Seedream production workflow', async () => {
        const context = createProductionInput({
            evolutionTargetId: 'TAIL',
            idempotencyKey: 'seedream-tail-split',
            policyOverrides: {
                CREATURE_EVOLUTION_IMAGE_PIPELINE: 'seedream',
                FAL_SEEDREAM_API_KEY: 'seedream-only-key',
                SEEDREAM_ESTIMATED_COST_PER_GENERATION: '0.07',
                SEEDREAM_MAX_ESTIMATED_COST_PER_GENERATION: '0.08',
            },
        })

        await expect(orchestrateGenerateUnlockedTransformation(context.input as never)).resolves.toMatchObject({ success: true, accepted: true })

        const prompt = String(context.seedreamSubmit.mock.calls[0]![0].prompt)
        expect(prompt).toContain('TAIL POSE AND BODY LOCK')
        expect(prompt).toMatch(/never as wings, dorsal fronds, back ornaments, unrelated fins or independently rooted appendages/i)
        expect(prompt).not.toMatch(/posture rebalancing|stance rebalancing|supporting anatomy/i)
        expect(context.persistence.get(PROFILE_ID, 'seedream-tail-split')).toMatchObject({
            promptTemplateVersion: 'seedream-locked-dynamic-v1',
            evolutionTargetId: 'TAIL',
        })
    })

    it('uses the restored flux-micro-v5 prompt when selected by server policy', async () => {
        const context = createProductionInput({
            idempotencyKey: 'production-v5',
            policyOverrides: { FLUX_PROMPT_TEMPLATE_VERSION: 'flux-micro-v5' },
        })

        await orchestrateGenerateUnlockedTransformation(context.input as never)
        const prompt = String(context.submit.mock.calls[0]![0].prompt)
        expect(prompt).toContain('Edit the supplied source image. This is the same creature and the same individual. Preserve pose, viewpoint, composition and illustrated style as closely as possible.')
        expect(prompt).toContain('\n\nANATOMY CONTRACT\n\n')
        expect(prompt).toContain('\n\nPRESERVE\n\n')
        expect(prompt).not.toContain('\n\nPRIMARY MUTATION AUTHORITY\n\n')
        expect(context.persistence.get(PROFILE_ID, 'production-v5')).toMatchObject({
            status: 'RUNNING', promptTemplateVersion: 'flux-micro-v5', promptText: prompt,
        })
    })

    it('cannot produce a body-plan mutation in normal gameplay', async () => {
        const context = createProductionInput()

        await orchestrateGenerateUnlockedTransformation(context.input as never)

        const plan = context.generate.mock.calls[0]![0].plan
        expect(plan.capability).toBe('ANATOMICAL_MUTATION')
        expect(plan.bodyPlanMutationId).toBeUndefined()
        expect(plan.anatomyContract.structuralChange).toBeUndefined()
        expect(context.persistence.get(PROFILE_ID, 'production-key')?.conceptSnapshot).not.toHaveProperty('bodyPlanMutationId')
    })

    it('uses the same pipeline for a structural mutation once the policy enables the capability', async () => {
        const context = createProductionInput({ policyOverrides: { CREATURE_EVOLUTION_BODY_PLAN_MUTATION_ENABLED: 'true', FLUX_PROMPT_TEMPLATE_VERSION: 'flux-micro-v6' }, idempotencyKey: 'structural-key' })

        await orchestrateGenerateUnlockedTransformation(context.input as never)

        const plan = context.generate.mock.calls[0]![0].plan
        expect(plan.capability).toBe('BODY_PLAN_MUTATION')
        expect(plan.bodyPlanMutationId).toBeDefined()
        expect(plan.resultBodyPlanId).not.toBe('QUADRUPED')
        expect(String(context.submit.mock.calls[0]![0].prompt)).toContain('AUTHORIZED BODY-PLAN MUTATION')
        expect(context.persistence.get(PROFILE_ID, 'structural-key')?.conceptSnapshot).toMatchObject({ capability: 'BODY_PLAN_MUTATION' })
    })

    it('contracts a generation after an adopted structural mutation against the new canonical body plan', async () => {
        const context = createProductionInput({
            idempotencyKey: 'after-adoption',
            source: createResolvedCreatureSource({
                previousTransformations: [{
                    versionNumber: 2, visualTraitId: 'LOCOMOTION_ADAPTATION', evolutionTargetId: 'LIMBS_AND_FEET',
                    conceptName: 'Arti mediani', mutationIdea: 'un nuovo paio di arti', bodyPlanMutationId: 'ADD_LIMB_PAIR',
                }],
            }),
        })

        await orchestrateGenerateUnlockedTransformation(context.input as never)

        const plan = context.generate.mock.calls[0]![0].plan
        expect(plan.bodyPlanId).toBe('SIX_LIMBED')
        expect(plan.anatomyContract.topologyInvariants.join(' ')).toContain('Keep exactly 6 limbs, in 3 symmetrical pairs')
        expect(plan.lineage.currentTargetState?.conceptName).toBe('Arti mediani')
    })

    it('refuses to generate a target the canonical body plan does not offer', async () => {
        const context = createProductionInput({ evolutionTargetId: 'WINGS', idempotencyKey: 'wings-key' })

        await expect(orchestrateGenerateUnlockedTransformation(context.input as never))
            .resolves.toMatchObject({ success: false, code: 'EVOLUTION_TARGET_NOT_AVAILABLE' })
        expect(context.generate).not.toHaveBeenCalled()
    })

    it('reports the canonical body plan and its available targets when a track is selected', async () => {
        const source = createResolvedCreatureSource()
        const response = await orchestrateSelectCreatureVisualProgressTrack({
            profileId: PROFILE_ID, requestId: 'select', policy: policyWith(),
            body: { operation: 'SELECT_VISUAL_PROGRESS_TRACK', creatureId: CREATURE_ID, evolutionTargetId: 'DORSAL_STRUCTURES' },
            resolver: createTestResolver(source),
            visualRepository: {
                async selectTrack() { return readyTrack('DORSAL_STRUCTURES') },
                async getCurrentVersion() { return { id: source.currentVisualVersionId, creatureId: CREATURE_ID, versionNumber: 1, visualTraitId: null, conceptName: null } },
                async listVisualHistory() { return [] },
            },
            storage: { async createVisualVersionSignedUrl() { return { signedUrl: 'https://signed.example/base.png', expiresAt: '2030-01-01T00:00:00.000Z' } } },
        } as never)

        expect(response).toMatchObject({
            success: true,
            bodyPlan: { id: 'QUADRUPED', availableEvolutionTargets: source.bodyPlan!.evolutionTargets },
        })
    })

    it('rejects selecting a target outside the canonical body plan', async () => {
        await expect(orchestrateSelectCreatureVisualProgressTrack({
            profileId: PROFILE_ID, requestId: 'select-invalid', policy: policyWith(),
            body: { operation: 'SELECT_VISUAL_PROGRESS_TRACK', creatureId: CREATURE_ID, evolutionTargetId: 'TENTACLES' },
            resolver: createTestResolver(),
            visualRepository: { async selectTrack() { throw new Error('the track must not be opened') } },
            storage: {},
        } as never)).resolves.toMatchObject({ success: false, code: 'EVOLUTION_TARGET_NOT_AVAILABLE' })
    })

    it('reports the new canonical body plan after adopting a structural mutation', async () => {
        const adoptedSource = createResolvedCreatureSource({
            previousTransformations: [{
                versionNumber: 2, visualTraitId: 'LOCOMOTION_ADAPTATION', evolutionTargetId: 'LIMBS_AND_FEET',
                conceptName: 'Arti mediani', bodyPlanMutationId: 'ADD_LIMB_PAIR',
            }],
        })

        const response = await orchestrateAdoptCreatureTransformation({
            profileId: PROFILE_ID, requestId: 'adopt', policy: policyWith(),
            body: {
                operation: 'ADOPT_CREATURE_TRANSFORMATION', creatureId: CREATURE_ID, progressTrackId: TRACK_ID,
                transformationRequestId: '00000000-0000-4000-8000-000000000020',
                expectedCurrentVisualVersionId: '00000000-0000-4000-8000-000000000010',
            },
            resolver: createTestResolver(adoptedSource),
            visualRepository: {
                async adopt() { return { id: '00000000-0000-4000-8000-000000000030', versionNumber: 2, visualTraitId: 'LOCOMOTION_ADAPTATION', conceptName: 'Arti mediani' } },
            },
            storage: {},
        } as never)

        expect(response).toMatchObject({ success: true, bodyPlanId: 'SIX_LIMBED' })
    })

    it('keeps generation and adoption scoped to lineage B while lineage A exists on the same profile', async () => {
        const creatureB = '00000000-0000-4000-8000-000000000002'
        const trackB = '00000000-0000-4000-8000-000000000007'
        const sourceB = createResolvedCreatureSource({ currentVisualVersionId: '00000000-0000-4000-8000-000000000012' })
        const context = createProductionInput({ idempotencyKey: 'lineage-b-only', source: sourceB })
        const generatedTrack = { ...readyTrack('TAIL'), id: trackB, creatureId: creatureB }
        const getTrack = vi.fn(async ({ creatureId }: { creatureId: string }) => {
            expect(creatureId).toBe(creatureB)
            return generatedTrack
        })
        const resolveTrackTrait = vi.fn(async ({ creatureId, visualTraitId }: { creatureId: string, visualTraitId: string }) => {
            expect(creatureId).toBe(creatureB)
            return { ...generatedTrack, visualTraitId }
        })
        const startGeneration = vi.fn(async ({ creatureId }: { creatureId: string }) => {
            expect(creatureId).toBe(creatureB)
            return { ...generatedTrack, visualTraitId: 'LOCOMOTION_ADAPTATION', status: 'GENERATING' as const }
        })
        const markBackgroundRemovalPending = vi.fn(async ({ profileId, requestId }: { profileId: string, requestId: string }) => ({ ...generatedTrack, status: 'POST_PROCESSING' as const, profileId, requestId }))
        const resolve = vi.fn(async ({ creatureId }: { creatureId: string }) => {
            expect(creatureId).toBe(creatureB)
            return sourceB
        })
        context.input = {
            ...context.input,
            body: { operation: 'GENERATE_UNLOCKED_TRANSFORMATION', creatureId: creatureB, progressTrackId: trackB, idempotencyKey: 'lineage-b-only' },
            resolver: { resolve },
            visualRepository: { getTrack, resolveTrackTrait, startGeneration, markBackgroundRemovalPending, completeGeneration: vi.fn(async () => generatedTrack) },
        }

        await expect(orchestrateGenerateUnlockedTransformation(context.input as never)).resolves.toMatchObject({ success: true, accepted: true })
        expect(context.persistence.get(PROFILE_ID, 'lineage-b-only')).toMatchObject({ creatureId: creatureB, sourceVisualVersionId: sourceB.currentVisualVersionId })
        expect(getTrack).toHaveBeenCalledOnce()
        expect(resolveTrackTrait).toHaveBeenCalledOnce()
        expect(startGeneration).toHaveBeenCalledOnce()

        const adopt = vi.fn(async ({ creatureId }: { creatureId: string }) => {
            expect(creatureId).toBe(creatureB)
            return { id: '00000000-0000-4000-8000-000000000031', versionNumber: 2, visualTraitId: 'LOCOMOTION_ADAPTATION', conceptName: 'Coda a frusta' }
        })
        await expect(orchestrateAdoptCreatureTransformation({
            profileId: PROFILE_ID, requestId: 'adopt-b', policy: policyWith(),
            body: { operation: 'ADOPT_CREATURE_TRANSFORMATION', creatureId: creatureB, progressTrackId: trackB, transformationRequestId: context.persistence.get(PROFILE_ID, 'lineage-b-only')!.id, expectedCurrentVisualVersionId: sourceB.currentVisualVersionId },
            resolver: { resolve }, visualRepository: { adopt }, storage: {},
        } as never)).resolves.toMatchObject({ success: true, version: { conceptName: 'Coda a frusta' } })
        expect(adopt).toHaveBeenCalledOnce()
        expect(resolve).toHaveBeenCalledTimes(2)
    })

    it('requires the paid-generation entitlement before any FLUX request is reserved', async () => {
        const context = createProductionInput({ idempotencyKey: 'unauthorized' })

        await expect(orchestrateGenerateUnlockedTransformation({ ...context.input, canGenerateImages: false } as never))
            .resolves.toMatchObject({ success: false, code: 'IMAGE_GENERATION_NOT_ALLOWED' })
        expect(context.persistence.calls.reserve).toBe(0)
    })
})
