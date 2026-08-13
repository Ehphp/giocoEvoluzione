import { describe, expect, it, vi } from 'vitest'

import { createTestPng } from '../../../shared/creature-transformations/image-test-fixtures.ts'
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
} = {}) {
    const persistence = createInMemoryRequestRepository()
    const tasks: Promise<void>[] = []
    const track = readyTrack(options.evolutionTargetId ?? 'LIMBS_AND_FEET')
    const markBackgroundRemovalPending = vi.fn(async () => ({ ...track, status: 'POST_PROCESSING' as const }))
    const completeGeneration = vi.fn(async () => track)
    const generate = vi.fn(async () => ({ conceptName: 'Pale rematrici', mutationIdea: 'Membrane pieghevoli.', visualDetails: ['lamelle'] }))
    const transform = vi.fn(async () => ({ image: createTestPng({ width: 768, height: 1152 }), provider: 'fal.ai', model: 'fal-ai/flux-2-klein/9b/edit', latencyMs: 12, estimatedCostUsd: 0.0203 }))
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
        createFalFluxImageProvider: () => ({ transform }),
        deferBackgroundTask: (task: Promise<void>) => { tasks.push(task) },
        validator: new FluxTestValidator(),
    }
    return { input, persistence, tasks, generate, transform, markBackgroundRemovalPending, completeGeneration }
}

describe('FLUX production pipeline', () => {
    it('runs progress track → body plan → anatomy contract → micro-concept → fal.ai → post-processing handover', async () => {
        const context = createProductionInput()

        const result = await orchestrateGenerateUnlockedTransformation(context.input as never)
        expect(result).toMatchObject({ success: true, accepted: true })
        await context.tasks[0]

        expect(context.generate).toHaveBeenCalledOnce()
        const plan = context.generate.mock.calls[0]![0].plan
        expect(plan).toMatchObject({ evolutionTargetId: 'LIMBS_AND_FEET', capability: 'ANATOMICAL_MUTATION', bodyPlanId: 'QUADRUPED', resultBodyPlanId: 'QUADRUPED' })
        expect(plan.anatomyContract.topologyInvariants.join(' ')).toContain('Keep exactly 4 limbs')
        expect(context.transform).toHaveBeenCalledOnce()
        expect(String(context.transform.mock.calls[0]![0].prompt)).toContain('SELECTED TARGET: LIMBS_AND_FEET')
        expect(context.markBackgroundRemovalPending).toHaveBeenCalledOnce()
        expect(context.persistence.get(PROFILE_ID, 'production-key')).toMatchObject({
            status: 'SUCCEEDED', provider: 'fal.ai', assetReadiness: 'EXPERIMENT_ONLY',
            promptTemplateVersion: 'flux-micro-v2', evolutionTargetId: 'LIMBS_AND_FEET', resultWidth: 768, resultHeight: 1152,
        })
        expect(context.persistence.get(PROFILE_ID, 'production-key')?.conceptSnapshot).toMatchObject({
            schemaVersion: 'flux-micro-v2', capability: 'ANATOMICAL_MUTATION', evolutionTargetId: 'LIMBS_AND_FEET',
        })
    })

    it('cannot produce a body-plan mutation in normal gameplay', async () => {
        const context = createProductionInput()

        await orchestrateGenerateUnlockedTransformation(context.input as never)
        await context.tasks[0]

        const plan = context.generate.mock.calls[0]![0].plan
        expect(plan.capability).toBe('ANATOMICAL_MUTATION')
        expect(plan.bodyPlanMutationId).toBeUndefined()
        expect(plan.anatomyContract.structuralChange).toBeUndefined()
        expect(context.persistence.get(PROFILE_ID, 'production-key')?.conceptSnapshot).not.toHaveProperty('bodyPlanMutationId')
    })

    it('uses the same pipeline for a structural mutation once the policy enables the capability', async () => {
        const context = createProductionInput({ policyOverrides: { CREATURE_EVOLUTION_BODY_PLAN_MUTATION_ENABLED: 'true' }, idempotencyKey: 'structural-key' })

        await orchestrateGenerateUnlockedTransformation(context.input as never)
        await context.tasks[0]

        const plan = context.generate.mock.calls[0]![0].plan
        expect(plan.capability).toBe('BODY_PLAN_MUTATION')
        expect(plan.bodyPlanMutationId).toBeDefined()
        expect(plan.resultBodyPlanId).not.toBe('QUADRUPED')
        expect(String(context.transform.mock.calls[0]![0].prompt)).toContain('AUTHORIZED BODY-PLAN MUTATION')
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
        await context.tasks[0]

        const plan = context.generate.mock.calls[0]![0].plan
        expect(plan.bodyPlanId).toBe('SIX_LIMBED')
        expect(plan.anatomyContract.topologyInvariants.join(' ')).toContain('Keep exactly 6 limbs, in 3 symmetrical pairs')
        expect(plan.lineage.currentTargetState.map((entry: { conceptName: string }) => entry.conceptName)).toEqual(['Arti mediani'])
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

    it('requires the paid-generation entitlement before any FLUX request is reserved', async () => {
        const context = createProductionInput({ idempotencyKey: 'unauthorized' })

        await expect(orchestrateGenerateUnlockedTransformation({ ...context.input, canGenerateImages: false } as never))
            .resolves.toMatchObject({ success: false, code: 'IMAGE_GENERATION_NOT_ALLOWED' })
        expect(context.persistence.calls.reserve).toBe(0)
    })
})
