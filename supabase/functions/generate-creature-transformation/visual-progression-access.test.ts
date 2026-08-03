import { describe, expect, it } from 'vitest'

import type { StoredVisualVersion, SupabaseCreatureVisualProgressionRepository } from './creature-visual-progression-repository.ts'
import { orchestrateGenerateUnlockedTransformation, orchestrateGetCreatureVisualProgress, orchestrateGetCurrentCreatureVisual, orchestrateGetGameCreatureVisuals } from './edge-orchestration.ts'
import { readCreatureTransformationLabPolicy } from './lab-policy.ts'

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

function visualRepository(): SupabaseCreatureVisualProgressionRepository {
    return {
        async getTrack() { return null },
        async getLatestExperiment() { return null },
        async listHistory() { return [] },
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

    it('shares the opponent current visual only with a participant of that game', async () => {
        await expect(orchestrateGetGameCreatureVisuals(input({ operation: 'GET_GAME_VISUALS', gameId: '00000000-0000-4000-8000-000000000003' }) as never))
            .resolves.toMatchObject({ success: true, opponent: { versionNumber: 2, isBaseVersion: false } })
    })

    it('does not apply the production-profile allowlist to an unlocked generation', async () => {
        await expect(orchestrateGenerateUnlockedTransformation(input({
            operation: 'GENERATE_UNLOCKED_TRANSFORMATION', creatureId: CREATURE_ID,
            progressTrackId: '00000000-0000-4000-8000-000000000004', idempotencyKey: 'friend-attempt',
        }) as never)).resolves.toMatchObject({ success: false, code: 'REAL_IMAGE_PROVIDER_NOT_CONFIGURED' })
    })
})
