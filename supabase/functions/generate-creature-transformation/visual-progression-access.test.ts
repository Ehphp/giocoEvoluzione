import { describe, expect, it } from 'vitest'

import { createValidConcept, TEST_CREATURE_IDENTITY } from '../../../shared/creature-transformations/concept-test-fixtures.ts'
import type { StoredVisualVersion, SupabaseCreatureVisualProgressionRepository } from './creature-visual-progression-repository.ts'
import { orchestrateGenerateUnlockedTransformation, orchestrateGetCreatureVisualProgress, orchestrateGetCurrentCreatureVisual, orchestrateGetGameCreatureVisuals } from './edge-orchestration.ts'
import { readCreatureTransformationLabPolicy } from './lab-policy.ts'
import { createInMemoryRequestRepository } from './test-request-repository.ts'

const OPEN_PROFILE = 'friend-profile'
const PILOT_PROFILE = 'pilot-profile'
const CREATURE_ID = '00000000-0000-4000-8000-000000000001'
const OPPONENT_CREATURE_ID = '00000000-0000-4000-8000-000000000002'

const policy = readCreatureTransformationLabPolicy((name) => ({
    CREATURE_VISUAL_PROGRESSION_ENABLED: 'true',
    CREATURE_VISUAL_PRODUCTION_GENERATION_ENABLED: 'true',
    CREATURE_VISUAL_ADOPTION_ENABLED: 'true',
    CREATURE_VISUAL_PRODUCTION_PROFILE_IDS: PILOT_PROFILE,
})[name])

function version(profileId: string, creatureId: string, visualTraitId: StoredVisualVersion['visualTraitId'] = null): StoredVisualVersion {
    return {
        id: `${profileId}-${creatureId}`, creatureId, profileId, versionNumber: visualTraitId ? 2 : 1,
        previousVersionId: null, visualTraitId, conceptName: visualTraitId ? 'Carapace rinforzato' : null,
        conceptSnapshot: null, promptTemplateVersion: null, promptSha256: null,
        assetPath: 'verdant-hatchling-v1.png', assetSha256: 'a'.repeat(64), mimeType: 'image/png', width: 512, height: 512,
        hasAlpha: true, status: 'ACTIVE', adoptedAt: null,
    }
}

function visualRepository(lastFailure: { requestId: string; code: string; message: string } | null = null): SupabaseCreatureVisualProgressionRepository {
    return {
        async getTrack() {
            return lastFailure ? {
                id: 'track-1', creatureId: CREATURE_ID, visualTraitId: 'IMPACT_ADAPTATION',
                status: 'READY', progress: 3, target: 3, readyAt: '2026-08-05T09:00:00.000Z',
                generatedRequestId: null, completedVersionId: null,
            } : null
        },
        async getLatestExperiment() { return null },
        async getLatestFailure() { return lastFailure },
        async listHistory() { return [] },
        async listVisualHistory({ profileId, creatureId }) { return [version(profileId, creatureId)] },
        async getCurrentVersion({ profileId, creatureId }) {
            return version(profileId, creatureId, profileId === PILOT_PROFILE ? 'IMPACT_ADAPTATION' : null)
        },
        async listGameHumanParticipants() {
            return [
                { profileId: OPEN_PROFILE, creatureId: CREATURE_ID },
                { profileId: PILOT_PROFILE, creatureId: OPPONENT_CREATURE_ID },
            ]
        },
    } as unknown as SupabaseCreatureVisualProgressionRepository
}

const storage = {
    async createVisualVersionSignedUrl({ assetPath }: { assetPath: string; isBaseVersion: boolean }) {
        return { signedUrl: `https://signed.example/${assetPath}`, expiresAt: '2030-01-01T00:00:00.000Z' }
    },
}

function input(body: unknown) {
    return {
        profileId: OPEN_PROFILE,
        requestId: 'request-1',
        body,
        policy,
        visualRepository: visualRepository(),
        storage,
    }
}

describe('visual progression access', () => {
    it('allows every authenticated profile to read its visual progress and current visual', async () => {
        await expect(orchestrateGetCreatureVisualProgress(input({ operation: 'GET_VISUAL_PROGRESS', creatureId: CREATURE_ID }) as never))
            .resolves.toMatchObject({ success: true, currentVersion: { versionNumber: 1 } })
        await expect(orchestrateGetCurrentCreatureVisual(input({ operation: 'GET_CURRENT_VISUAL', creatureId: CREATURE_ID }) as never))
            .resolves.toMatchObject({ success: true, visual: { signedUrl: 'https://signed.example/verdant-hatchling-v1.png' } })
    })

    it('prefers a persisted WebP display asset and falls back to the legacy PNG master', async () => {
        const displayVersion = {
            ...version(OPEN_PROFILE, CREATURE_ID, 'IMPACT_ADAPTATION'),
            displayAssetPath: `display/${'a'.repeat(64)}.webp`, displayAssetSha256: 'b'.repeat(64),
            displayMimeType: 'image/webp' as const, displayWidth: 512, displayHeight: 768,
        }
        const displayRepository = {
            ...visualRepository(),
            async getCurrentVersion() { return displayVersion },
        } as unknown as SupabaseCreatureVisualProgressionRepository

        await expect(orchestrateGetCurrentCreatureVisual({ ...input({ operation: 'GET_CURRENT_VISUAL', creatureId: CREATURE_ID }), visualRepository: displayRepository } as never))
            .resolves.toMatchObject({ success: true, visual: { signedUrl: `https://signed.example/display/${'a'.repeat(64)}.webp`, mimeType: 'image/webp', width: 512, height: 768 } })
        await expect(orchestrateGetCurrentCreatureVisual(input({ operation: 'GET_CURRENT_VISUAL', creatureId: CREATURE_ID }) as never))
            .resolves.toMatchObject({ success: true, visual: { signedUrl: 'https://signed.example/verdant-hatchling-v1.png', mimeType: 'image/png' } })
    })

    it('returns the latest failed generation for an otherwise ready track', async () => {
        const failure = { requestId: 'failed-request', code: 'REAL_IMAGE_PROVIDER_FAILED', message: 'Il provider immagini non ha completato la richiesta.' }
        await expect(orchestrateGetCreatureVisualProgress({ ...input({ operation: 'GET_VISUAL_PROGRESS', creatureId: CREATURE_ID }), visualRepository: visualRepository(failure) } as never))
            .resolves.toMatchObject({ success: true, lastFailure: failure })
    })

    it('shares the opponent current visual only with a participant of that game', async () => {
        await expect(orchestrateGetGameCreatureVisuals(input({ operation: 'GET_GAME_VISUALS', gameId: '00000000-0000-4000-8000-000000000003' }) as never))
            .resolves.toMatchObject({ success: true, opponent: { versionNumber: 2, isBaseVersion: false } })
    })

    it('requires a dedicated image-generation entitlement for an unlocked generation', async () => {
        await expect(orchestrateGenerateUnlockedTransformation(input({
            operation: 'GENERATE_UNLOCKED_TRANSFORMATION', creatureId: CREATURE_ID,
            progressTrackId: '00000000-0000-4000-8000-000000000004', idempotencyKey: 'friend-attempt',
        }) as never)).resolves.toMatchObject({ success: false, code: 'IMAGE_GENERATION_NOT_ALLOWED' })
    })

    it('retains the resolved target direction when an unlocked concept is rejected', async () => {
        const productionPolicy = readCreatureTransformationLabPolicy((name) => ({
            CREATURE_VISUAL_PROGRESSION_ENABLED: 'true', CREATURE_VISUAL_PRODUCTION_GENERATION_ENABLED: 'true',
            CREATURE_TRANSFORMATION_REAL_IMAGE_ENABLED: 'true', CREATURE_TRANSFORMATION_REAL_IMAGE_PROVIDER: 'OPENAI',
            CREATURE_TRANSFORMATION_REAL_IMAGE_ALLOWED_PROFILE_IDS: 'profile-1', OPENAI_IMAGE_API_KEY: 'test-key',
            OPENAI_IMAGE_MODEL: 'test-model', OPENAI_IMAGE_ESTIMATED_COST_USD: '0.12', CREATURE_TRANSFORMATION_MAX_REAL_IMAGE_ESTIMATED_COST_USD: '1',
        })[name])
        const trackId = '00000000-0000-4000-8000-000000000004'
        let resolvedVisualTraitId: string | null = null
        const targetTrack = {
            id: trackId, creatureId: CREATURE_ID, visualTraitId: null, evolutionTargetId: 'TORSO_AND_BACK' as const,
            status: 'READY' as const, progress: 3, target: 3, readyAt: '2026-08-05T09:00:00.000Z', generatedRequestId: null, completedVersionId: null,
        }
        const targetVisualRepository = {
            async getTrack() { return targetTrack },
            async resolveTrackTrait({ visualTraitId }: { visualTraitId: string }) {
                resolvedVisualTraitId = visualTraitId
                return { ...targetTrack, visualTraitId: visualTraitId as typeof targetTrack.visualTraitId }
            },
            async startGeneration() { return { ...targetTrack, visualTraitId: resolvedVisualTraitId, status: 'GENERATING' as const } },
            async completeGeneration() { return { ...targetTrack, visualTraitId: resolvedVisualTraitId } },
        } as unknown as SupabaseCreatureVisualProgressionRepository
        const persistence = createInMemoryRequestRepository()
        const tasks: Promise<void>[] = []
        const result = await orchestrateGenerateUnlockedTransformation({
            profileId: 'profile-1', canGenerateImages: true, requestId: 'target-rejected',
            body: { operation: 'GENERATE_UNLOCKED_TRANSFORMATION', creatureId: CREATURE_ID, progressTrackId: trackId, idempotencyKey: 'target-rejected-key' },
            policy: productionPolicy,
            resolver: {
                async resolve() {
                    return {
                        identity: TEST_CREATURE_IDENTITY, sourceImagePath: 'source.png', sourceSha256: 'a'.repeat(64), sourceIsBaseVersion: true,
                        currentVisualVersionId: '00000000-0000-4000-8000-000000000005', currentVersionNumber: 1, previousTransformations: [],
                    }
                },
            },
            createGenerator: () => ({ metadata: { generator: 'invalid-target-concept', isMock: false }, async generateConcept() { return createValidConcept() } }),
            createRealImageProvider: () => { throw new Error('the image provider must not run') },
            deferBackgroundTask: (task) => { tasks.push(task) },
            repository: persistence.repository, visualRepository: targetVisualRepository, storage: {} as never,
            reviewRepository: {} as never,
        } as never)

        expect(result).toMatchObject({ success: true, accepted: true, requestPersistence: { status: 'RUNNING' } })
        expect(tasks).toHaveLength(1)
        await tasks[0]
        expect(persistence.get('profile-1', 'target-rejected-key')).toMatchObject({
            status: 'FAILED', errorCode: 'CONCEPT_REJECTED', evolutionTargetId: 'TORSO_AND_BACK', evolutionFunction: expect.any(String),
        })
    })
})
