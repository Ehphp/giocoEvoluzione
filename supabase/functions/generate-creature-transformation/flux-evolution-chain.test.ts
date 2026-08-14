import { describe, expect, it, vi } from 'vitest'

import { createTestPng } from '../../../shared/creature-transformations/image-test-fixtures.ts'
import { createResolvedCreatureSource } from './test-creature-fixtures.ts'
import { readCreatureTransformationLabPolicy } from './lab-policy.ts'
import { orchestrateGenerateFluxEvolutionChainStep } from './edge-orchestration.ts'
import { createInMemoryRequestRepository } from './test-request-repository.ts'
import { createTestResolver, createTestStorage, FluxTestValidator } from './test-creature-fixtures.ts'

const PROFILE_ID = 'profile-1'
const CREATURE_ID = '00000000-0000-4000-8000-000000000001'

const LAB_ENVIRONMENT: Record<string, string> = {
    CREATURE_TRANSFORMATION_LAB_ENABLED: 'true',
    CREATURE_TRANSFORMATION_LAB_PROFILE_IDS: PROFILE_ID,
    FAL_FLUX_API_KEY: 'flux-key',
    FAL_FLUX_ESTIMATED_COST_USD: '0.02',
    FAL_FLUX_MAX_ESTIMATED_COST_USD: '0.03',
    OPENAI_API_KEY: 'concept-key',
    FLUX_MICRO_CONCEPT_MODEL: 'concept-model',
    CREATURE_TRANSFORMATION_DAILY_BUDGET_USD: '1',
}

function policyWith(extra: Record<string, string> = {}) {
    return readCreatureTransformationLabPolicy((name) => ({ ...LAB_ENVIRONMENT, ...extra })[name])
}

function createInput(options: {
    repository: ReturnType<typeof createInMemoryRequestRepository>
    tasks: Promise<void>[]
    idempotencyKey: string
    evolutionTargetId?: string
    bodyPlanMutationId?: string
    previousStepRequestIds?: string[]
    sourceVisualVersionId?: string
    source?: ReturnType<typeof createResolvedCreatureSource>
    storage?: Record<string, unknown>
    policyOverrides?: Record<string, string>
    generate?: ReturnType<typeof vi.fn>
    transform?: ReturnType<typeof vi.fn>
}) {
    const previousStepRequestIds = options.previousStepRequestIds ?? []
    const generate = options.generate ?? vi.fn(async () => ({ conceptName: 'Pale rematrici', mutationIdea: 'Membrane pieghevoli.', visualDetails: ['lamelle'] }))
    const transform = options.transform ?? vi.fn(async () => ({ image: createTestPng({ width: 768, height: 1152 }), provider: 'fal.ai', model: 'flux-test', latencyMs: 1, estimatedCostUsd: 0.02 }))
    return {
        input: {
            profileId: PROFILE_ID, canGenerateImages: true, requestId: `http-${options.idempotencyKey}`,
            body: {
                operation: 'GENERATE_FLUX_EVOLUTION_CHAIN_STEP', creatureId: CREATURE_ID,
                evolutionTargetId: options.evolutionTargetId ?? 'LIMBS_AND_FEET',
                ...(options.bodyPlanMutationId ? { bodyPlanMutationId: options.bodyPlanMutationId } : {}),
                previousStepRequestIds,
                ...(options.sourceVisualVersionId ? { sourceVisualVersionId: options.sourceVisualVersionId } : {}),
                ...(previousStepRequestIds.length ? { experimentalSourceRequestId: previousStepRequestIds.at(-1) } : {}),
                idempotencyKey: options.idempotencyKey,
            },
            policy: policyWith(options.policyOverrides),
            resolver: createTestResolver(options.source),
            repository: options.repository.repository,
            storage: options.storage ?? createTestStorage(),
            visualRepository: options.sourceVisualVersionId
                ? { async getVersion() { return { id: options.sourceVisualVersionId, creatureId: CREATURE_ID, versionNumber: 1, previousVersionId: null, visualTraitId: null, conceptName: null, conceptSnapshot: null, promptTemplateVersion: null, promptSha256: null, assetPath: 'selected-v1.png', assetSha256: 'b'.repeat(64), mimeType: 'image/png', width: 1024, height: 1536, hasAlpha: true, status: 'SUPERSEDED', adoptedAt: null, profileId: PROFILE_ID } } }
                : { async getVersion() { throw new Error('the chain must not touch productive visual versions') } },
            createFluxMicroConceptGenerator: () => ({ generate }),
            createFalFluxImageProvider: () => ({ transform }),
            deferBackgroundTask: (task: Promise<void>) => { options.tasks.push(task) },
            validator: new FluxTestValidator(),
        },
        generate,
        transform,
    }
}

async function finalize(persistence: ReturnType<typeof createInMemoryRequestRepository>, requestId: string, path: string) {
    await persistence.repository.finalizeBackgroundRemovalCandidate({
        requestId, profileId: PROFILE_ID, candidatePath: path, candidateSha256: 'c'.repeat(64),
        candidateMimeType: 'image/png', candidateWidth: 1024, candidateHeight: 1536, validationWarnings: [],
    })
}

describe('FLUX evolution chain step', () => {
    it('uses the final processed output of G1 as the only source of G2, and G1 as its target lineage', async () => {
        const persistence = createInMemoryRequestRepository()
        const tasks: Promise<void>[] = []
        const readExperimentalSource = vi.fn(async () => ({ bytes: createTestPng(), mimeType: 'image/png' as const }))
        const storage = createTestStorage({ readExperimentalSource })

        const first = createInput({ repository: persistence, tasks, idempotencyKey: 'chain-1', storage })
        const firstResponse = await orchestrateGenerateFluxEvolutionChainStep(first.input as never)
        expect(firstResponse).toMatchObject({ success: true, accepted: true })
        await tasks[0]
        const firstId = (firstResponse as { requestPersistence: { transformationRequestId: string } }).requestPersistence.transformationRequestId
        const finalPath = `candidates/${PROFILE_ID}/${'b'.repeat(64)}.png`
        await finalize(persistence, firstId, finalPath)

        const second = createInput({ repository: persistence, tasks, idempotencyKey: 'chain-2', previousStepRequestIds: [firstId], storage })
        const secondResponse = await orchestrateGenerateFluxEvolutionChainStep(second.input as never)
        await tasks[1]

        expect(secondResponse).toMatchObject({ success: true, accepted: true })
        expect(readExperimentalSource).toHaveBeenCalledWith(finalPath)
        expect(persistence.get(PROFILE_ID, 'chain-2')).toMatchObject({ visualProgressTrackId: null, sourceVisualVersionId: null, assetReadiness: 'EXPERIMENT_ONLY' })
        const prompt = String(second.transform.mock.calls[0]![0].prompt)
        expect(prompt).not.toContain('This creature has no wings and no tentacles.')
        expect(prompt).not.toContain('Trunk volume and body proportions, head, face, limbs and tail keep their current shape; only the dorsal structures and the back surface carrying them change.')
        // The second step reads the first as adopted lineage of the same target.
        const plan = second.generate.mock.calls[0]![0].plan
        expect(plan.lineage.currentTargetState.map((entry: { conceptName: string }) => entry.conceptName)).toEqual(['Pale rematrici'])
    })

    it('builds G1 from the selected visual version history instead of later adopted evolutions', async () => {
        const persistence = createInMemoryRequestRepository()
        const tasks: Promise<void>[] = []
        const source = createResolvedCreatureSource({
            currentVersionNumber: 4,
            previousTransformations: [
                { versionNumber: 2, visualTraitId: 'SENSORY_EXPANSION', evolutionTargetId: 'HEAD_AND_CROWN', conceptName: 'Corona percettiva' },
                { versionNumber: 3, visualTraitId: 'LOCOMOTION_ADAPTATION', evolutionTargetId: 'TAIL', conceptName: 'Coda pinna' },
                { versionNumber: 4, visualTraitId: 'IMPACT_ADAPTATION', evolutionTargetId: 'DORSAL_STRUCTURES', conceptName: 'Placche dorsali', bodyPlanMutationId: 'ADD_LIMB_PAIR' },
            ],
        })
        const context = createInput({ repository: persistence, tasks, idempotencyKey: 'selected-v1', sourceVisualVersionId: '00000000-0000-4000-8000-000000000004', source })

        await orchestrateGenerateFluxEvolutionChainStep(context.input as never)
        await tasks[0]

        const plan = context.generate.mock.calls[0]![0].plan
        expect(plan.lineage.currentTargetState).toEqual([])
        expect(plan.lineage.otherEstablishedEvolutions).toEqual([])
        expect(plan.bodyPlanId).toBe('QUADRUPED')
        expect(context.transform.mock.calls[0]![0].prompt).toContain('This target carries no adopted evolution yet')
        expect(context.transform.mock.calls[0]![0].prompt).not.toContain('Corona percettiva')
        expect(context.transform.mock.calls[0]![0].prompt).not.toContain('Coda pinna')
        expect(context.transform.mock.calls[0]![0].prompt).not.toContain('Placche dorsali')
        expect(context.transform.mock.calls[0]![0].prompt).toContain('Keep the four-legged quadrupedal body plan')
    })

    it('runs a body-plan mutation through the same pipeline when the capability is enabled', async () => {
        const persistence = createInMemoryRequestRepository()
        const tasks: Promise<void>[] = []
        const context = createInput({
            repository: persistence, tasks, idempotencyKey: 'chain-structural',
            bodyPlanMutationId: 'ADD_LIMB_PAIR', policyOverrides: { CREATURE_EVOLUTION_BODY_PLAN_MUTATION_ENABLED: 'true' },
        })

        await orchestrateGenerateFluxEvolutionChainStep(context.input as never)
        await tasks[0]

        const plan = context.generate.mock.calls[0]![0].plan
        expect(plan).toMatchObject({ capability: 'BODY_PLAN_MUTATION', bodyPlanMutationId: 'ADD_LIMB_PAIR', resultBodyPlanId: 'SIX_LIMBED' })
        expect(String(context.transform.mock.calls[0]![0].prompt)).toContain('Keep exactly 6 limbs')
        expect(persistence.get(PROFILE_ID, 'chain-structural')?.conceptSnapshot).toMatchObject({ capability: 'BODY_PLAN_MUTATION', bodyPlanMutationId: 'ADD_LIMB_PAIR', resultBodyPlanId: 'SIX_LIMBED' })
    })

    it('refuses a body-plan mutation while the capability is disabled', async () => {
        const persistence = createInMemoryRequestRepository()
        const tasks: Promise<void>[] = []
        const context = createInput({ repository: persistence, tasks, idempotencyKey: 'chain-denied', bodyPlanMutationId: 'ADD_LIMB_PAIR' })

        await expect(orchestrateGenerateFluxEvolutionChainStep(context.input as never))
            .resolves.toMatchObject({ success: false, code: 'BODY_PLAN_MUTATION_NOT_AUTHORIZED' })
        expect(persistence.calls.reserve).toBe(0)
        expect(tasks).toHaveLength(0)
    })

    it('keeps the Lab behind its own server-side allowlist', async () => {
        const persistence = createInMemoryRequestRepository()
        const tasks: Promise<void>[] = []
        const context = createInput({ repository: persistence, tasks, idempotencyKey: 'chain-forbidden', policyOverrides: { CREATURE_TRANSFORMATION_LAB_PROFILE_IDS: 'another-profile' } })

        await expect(orchestrateGenerateFluxEvolutionChainStep(context.input as never))
            .resolves.toMatchObject({ success: false, code: 'LAB_NOT_ALLOWED' })
        expect(persistence.calls.reserve).toBe(0)
    })

    it('records an intermediate provider failure and never queues a later step', async () => {
        const persistence = createInMemoryRequestRepository()
        const tasks: Promise<void>[] = []
        const context = createInput({
            repository: persistence, tasks, idempotencyKey: 'chain-failure',
            transform: vi.fn(async () => { throw new Error('provider down') }),
        })

        await orchestrateGenerateFluxEvolutionChainStep(context.input as never)
        await tasks[0]

        expect(persistence.get(PROFILE_ID, 'chain-failure')).toMatchObject({ status: 'FAILED' })
        expect(tasks).toHaveLength(1)
    })
})
