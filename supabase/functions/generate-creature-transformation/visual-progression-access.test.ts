import { describe, expect, it } from 'vitest'

import { mapVisualVersion, type StoredVisualVersion, type SupabaseCreatureVisualProgressionRepository } from './creature-visual-progression-repository.ts'
import { orchestrateGenerateUnlockedTransformation, orchestrateGetCreatureVisualProgress, orchestrateGetCurrentCreatureVisual, orchestrateGetGameCreatureVisuals } from './edge-orchestration.ts'
import { readCreatureEvolutionPolicy } from './evolution-policy.ts'
import { createTestResolver } from './test-creature-fixtures.ts'

const OPEN_PROFILE = 'friend-profile'
const PILOT_PROFILE = 'pilot-profile'
const CREATURE_ID = '00000000-0000-4000-8000-000000000001'
const OPPONENT_CREATURE_ID = '00000000-0000-4000-8000-000000000002'

const policy = readCreatureEvolutionPolicy((name) => ({
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

function inspectionWithDescription(shortDescription: string): NonNullable<StoredVisualVersion['visualInspection']> {
    return {
        schemaVersion: 'visual-inspection-v1', inspectedAt: '2026-08-17T00:00:00.000Z',
        anomalyDetector: { status: 'COMPLETE', evidence: [] }, visualAnomalies: [],
        stateMapper: { status: 'COMPLETE', usedVision1Evidence: false, evidenceAssessments: [], structuralConcerns: [] },
        observedVisualState: {
            schemaVersion: 'observed-visual-v1', shortDescription,
            orientation: { viewpoint: 'PROFILE', facing: 'IMAGE_RIGHT' }, observedBodyPlan: 'quadruped', headAndEyes: 'one head',
            limbsAndLimbLikeStructures: 'four legs', tail: 'one tail', hornsAntlers: 'none', dorsalStructures: 'none', appendages: 'none',
            skinCovering: 'green scales', primaryColors: ['green'], distinctiveStructures: [], targetRegions: [],
        },
    }
}

function visualRepository(lastFailure: { requestId: string; code: string; message: string } | null = null): SupabaseCreatureVisualProgressionRepository {
    return {
        async getTrack() {
            return lastFailure ? {
                id: 'track-1', creatureId: CREATURE_ID, visualTraitId: null, evolutionTargetId: 'DORSAL_STRUCTURES',
                status: 'READY', progress: 3, target: 3, readyAt: '2026-08-05T09:00:00.000Z',
                generatedRequestId: null, completedVersionId: null,
            } : null
        },
        async getLatestExperiment() { return null },
        async getLatestFailure() { return lastFailure },
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
        resolver: createTestResolver(),
        visualRepository: visualRepository(),
        storage,
    }
}

describe('visual progression access', () => {
    it('allows every authenticated profile to read its visual progress and current visual', async () => {
        await expect(orchestrateGetCreatureVisualProgress(input({ operation: 'GET_VISUAL_PROGRESS', creatureId: CREATURE_ID }) as never))
            .resolves.toMatchObject({ success: true, currentVersion: { versionNumber: 1 }, bodyPlan: { id: 'QUADRUPED' } })
        await expect(orchestrateGetCurrentCreatureVisual(input({ operation: 'GET_CURRENT_VISUAL', creatureId: CREATURE_ID }) as never))
            .resolves.toMatchObject({ success: true, visual: { signedUrl: 'https://signed.example/verdant-hatchling-v1.png' } })
    })

    it('returns the current version short description from its persisted visual inspection', async () => {
        const shortDescription = 'Una creatura quadrupede dalle scaglie verdi, con una coda lunga e luminose placche dorsali.'
        const repository = {
            ...visualRepository(),
            async getCurrentVersion({ profileId, creatureId }: { profileId: string, creatureId: string }) {
                return { ...version(profileId, creatureId), visualInspection: inspectionWithDescription(shortDescription) }
            },
        } as unknown as SupabaseCreatureVisualProgressionRepository

        await expect(orchestrateGetCreatureVisualProgress({ ...input({ operation: 'GET_VISUAL_PROGRESS', creatureId: CREATURE_ID }), visualRepository: repository } as never))
            .resolves.toMatchObject({ success: true, currentVersion: { shortDescription } })
    })

    it('reads the short description from an active visual-version database record', () => {
        const shortDescription = 'Una creatura quadrupede dalle scaglie verdi, con una coda lunga e luminose placche dorsali.'
        const mapped = mapVisualVersion({
            id: 'version-2', creature_id: CREATURE_ID, profile_id: OPEN_PROFILE, version_number: 2, previous_version_id: 'version-1',
            visual_trait_id: 'IMPACT_ADAPTATION', evolution_target_id: 'DORSAL_STRUCTURES', evolution_function: 'DEFENSE', concept_name: 'Placche luminose', concept_snapshot: null,
            prompt_template_version: null, prompt_sha256: null, asset_path: 'cleanup/' + 'a'.repeat(64) + '.png', asset_sha256: 'a'.repeat(64),
            mime_type: 'image/png', width: 1024, height: 1536, has_alpha: true, status: 'ACTIVE', adopted_at: '2026-08-17T00:00:00.000Z',
            visual_inspection: inspectionWithDescription(shortDescription),
        })

        expect(mapped.visualInspection?.observedVisualState?.shortDescription).toBe(shortDescription)
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
        const failure = { requestId: 'failed-request', code: 'FAL_FLUX_PROVIDER_ERROR', message: 'Il provider immagini non ha completato la richiesta.' }
        await expect(orchestrateGetCreatureVisualProgress({ ...input({ operation: 'GET_VISUAL_PROGRESS', creatureId: CREATURE_ID }), visualRepository: visualRepository(failure) } as never))
            .resolves.toMatchObject({ success: true, lastFailure: failure })
    })

    it('hides an older failure while a newer generation is being post-processed', async () => {
        const failure = { requestId: 'failed-request', code: 'FLUX_SUBJECT_CROPPED', message: 'Il soggetto era troppo vicino al bordo.' }
        const repository = {
            ...visualRepository(failure),
            async getTrack() {
                return {
                    id: 'track-1', creatureId: CREATURE_ID, visualTraitId: 'ANATOMICAL_EVOLUTION', evolutionTargetId: 'TAIL',
                    status: 'POST_PROCESSING', progress: 1, target: 1, readyAt: '2026-08-15T13:15:43.125834+00:00',
                    generatedRequestId: 'new-request', completedVersionId: null,
                }
            },
        } as unknown as SupabaseCreatureVisualProgressionRepository

        await expect(orchestrateGetCreatureVisualProgress({ ...input({ operation: 'GET_VISUAL_PROGRESS', creatureId: CREATURE_ID }), visualRepository: repository } as never))
            .resolves.toMatchObject({ success: true, track: { generatedRequestId: 'new-request' }, lastFailure: null })
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

    it('refuses an unlocked generation while the FLUX pipeline is not configured', async () => {
        await expect(orchestrateGenerateUnlockedTransformation({
            ...input({
                operation: 'GENERATE_UNLOCKED_TRANSFORMATION', creatureId: CREATURE_ID,
                progressTrackId: '00000000-0000-4000-8000-000000000004', idempotencyKey: 'unconfigured',
            }),
            profileId: PILOT_PROFILE,
            canGenerateImages: true,
        } as never)).resolves.toMatchObject({ success: false, code: 'FAL_FLUX_NOT_CONFIGURED' })
    })
})
