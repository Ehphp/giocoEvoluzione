import { describe, expect, it, vi } from 'vitest'

import { TEST_CREATURE_IDENTITY } from '../../../shared/creature-transformations/concept-test-fixtures.ts'
import { createTestPng } from '../../../shared/creature-transformations/image-test-fixtures.ts'
import { ImageValidator } from '../../../shared/creature-transformations/image-validator.ts'
import { readCreatureTransformationLabPolicy } from './lab-policy.ts'
import { orchestrateGenerateFluxEvolutionChainStep } from './edge-orchestration.ts'
import { createInMemoryRequestRepository } from './test-request-repository.ts'

const PROFILE_ID = 'profile-1'
const CREATURE_ID = '00000000-0000-4000-8000-000000000001'
const policy = readCreatureTransformationLabPolicy((name) => ({
    CREATURE_TRANSFORMATION_LAB_ENABLED: 'true', CREATURE_TRANSFORMATION_LINEAGE_EXPERIMENT_PROFILE_IDS: PROFILE_ID,
    FAL_FLUX_API_KEY: 'flux-key', FAL_FLUX_ESTIMATED_COST_USD: '0.02', FAL_FLUX_MAX_ESTIMATED_COST_USD: '0.03',
    OPENAI_API_KEY: 'concept-key', FLUX_MICRO_CONCEPT_MODEL: 'concept-model', CREATURE_TRANSFORMATION_DAILY_BUDGET_USD: '1',
})[name])

class FluxValidator extends ImageValidator {
    calls = 0
    override async validate() {
        this.calls += 1
        return { valid: true as const, metadata: { mimeType: 'image/png' as const, width: this.calls % 2 ? 1024 : 768, height: this.calls % 2 ? 1536 : 1152, colorType: 6, hasAlpha: true, sha256: `${this.calls}`.padStart(64, 'a'), bytes: 12 }, warnings: [] }
    }
}

function createInput(repository: ReturnType<typeof createInMemoryRequestRepository>, tasks: Promise<void>[], storage: Record<string, unknown>, idempotencyKey: string, previousStepRequestIds: string[] = []) {
    return {
        profileId: PROFILE_ID, canGenerateImages: true, requestId: `http-${idempotencyKey}`,
        body: { operation: 'GENERATE_FLUX_EVOLUTION_CHAIN_STEP', creatureId: CREATURE_ID, evolutionTargetId: 'FORELIMBS', previousStepRequestIds, ...(previousStepRequestIds.length ? { experimentalSourceRequestId: previousStepRequestIds.at(-1) } : {}), idempotencyKey },
        policy, resolver: { async resolve() { return { identity: { ...TEST_CREATURE_IDENTITY, baseCreatureKey: 'VERDANT_HATCHLING' }, sourceImagePath: 'source.png', sourceSha256: 'a'.repeat(64), sourceIsBaseVersion: true, currentVisualVersionId: '00000000-0000-4000-8000-000000000010', currentVersionNumber: 1, previousTransformations: [] } } },
        repository: repository.repository, storage, visualRepository: { async getVersion() { throw new Error('the chain must not touch productive visual versions') } }, reviewRepository: {} as never,
        createFluxMicroConceptGenerator: () => ({ async generate() { return { conceptName: 'Pale rematrici', mutationIdea: 'Membrane pieghevoli.', visualDetails: ['lamelle'] } } } as never),
        createFalFluxImageProvider: () => ({ async transform() { return { image: createTestPng({ width: 768, height: 1152 }), provider: 'fal.ai', model: 'flux-test', latencyMs: 1, estimatedCostUsd: 0.02 } } } as never),
        deferBackgroundTask: (task: Promise<void>) => tasks.push(task), validator: new FluxValidator(),
    } as never
}

describe('FLUX evolution chain step', () => {
    it('uses the final processed output of G1 as the only source of G2 without touching productive progression', async () => {
        const persistence = createInMemoryRequestRepository()
        const tasks: Promise<void>[] = []
        const readExperimentalSource = vi.fn(async () => ({ bytes: createTestPng(), mimeType: 'image/png' as const }))
        const storage = { async readCanonicalSource() { return { bytes: createTestPng(), mimeType: 'image/png' as const } }, readExperimentalSource, async saveRawResult() { return { signedUrl: 'https://signed.example/raw.png', expiresAt: '2030-01-01T00:00:00.000Z' } }, async createRawResultObjectPath() { return `experiments/raw/${PROFILE_ID}/${'a'.repeat(64)}.png` } }
        const first = await orchestrateGenerateFluxEvolutionChainStep(createInput(persistence, tasks, storage, 'chain-1'))
        expect(first).toMatchObject({ success: true, accepted: true })
        await tasks[0]
        const firstId = first.requestPersistence.transformationRequestId
        await persistence.repository.finalizeBackgroundRemovalCandidate({ requestId: firstId, profileId: PROFILE_ID, candidatePath: `candidates/${PROFILE_ID}/${'b'.repeat(64)}.png`, candidateSha256: 'c'.repeat(64), candidateMimeType: 'image/png', candidateWidth: 1024, candidateHeight: 1536, validationWarnings: [] })

        const second = await orchestrateGenerateFluxEvolutionChainStep(createInput(persistence, tasks, storage, 'chain-2', [firstId]))
        await tasks[1]
        expect(second).toMatchObject({ success: true, accepted: true })
        expect(readExperimentalSource).toHaveBeenCalledWith(`candidates/${PROFILE_ID}/${'b'.repeat(64)}.png`)
        expect(persistence.get(PROFILE_ID, 'chain-2')).toMatchObject({ visualProgressTrackId: null, sourceVisualVersionId: null, assetReadiness: 'EXPERIMENT_ONLY' })
    })

    it('records an intermediate provider failure and never queues a later step', async () => {
        const persistence = createInMemoryRequestRepository()
        const tasks: Promise<void>[] = []
        const storage = { async readCanonicalSource() { return { bytes: createTestPng(), mimeType: 'image/png' as const } } }
        const input = createInput(persistence, tasks, storage, 'chain-failure')
        input.createFalFluxImageProvider = () => ({ async transform() { throw new Error('provider down') } } as never)
        await orchestrateGenerateFluxEvolutionChainStep(input)
        await tasks[0]
        expect(persistence.get(PROFILE_ID, 'chain-failure')).toMatchObject({ status: 'FAILED' })
        expect(tasks).toHaveLength(1)
    })
})
