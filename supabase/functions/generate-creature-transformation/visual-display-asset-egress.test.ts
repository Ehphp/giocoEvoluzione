import { describe, expect, it } from 'vitest'

import {
    orchestrateGetCreatureVisualProgress,
    orchestrateGetCurrentCreatureVisual,
    type CreatureTransformationEdgeOrchestrationInput,
} from './edge-orchestration.ts'
import type { StoredVisualVersion, SupabaseCreatureVisualProgressionRepository } from './creature-visual-progression-repository.ts'
import { createTestResolver } from './test-creature-fixtures.ts'
import { readCreatureEvolutionPolicy } from './evolution-policy.ts'

/**
 * Storage was 97% of this project's Supabase egress. The master is a 1024×1536 PNG with alpha; the
 * display asset beside it is a ~768px WebP. Every URL the client receives must resolve to the
 * display asset when the version has one — the history strip most of all, because it is the only
 * response that carries many of them at once.
 */

const PROFILE = 'profile-1'
const CREATURE = 'creature-1'
const MASTER = 'creature-1/aaaa.png'
const DISPLAY = 'display/bbbb.webp'

const policy = readCreatureEvolutionPolicy((name) =>
    ({
        CREATURE_VISUAL_PROGRESSION_ENABLED: 'true',
        CREATURE_VISUAL_PRODUCTION_GENERATION_ENABLED: 'true',
        CREATURE_VISUAL_ADOPTION_ENABLED: 'true',
    })[name],
)

function version(versionNumber: number, withDisplayAsset: boolean): StoredVisualVersion {
    return {
        id: `version-${versionNumber}`,
        creatureId: CREATURE,
        profileId: PROFILE,
        versionNumber,
        previousVersionId: null,
        visualTraitId: versionNumber === 1 ? null : 'IMPACT_ADAPTATION',
        conceptName: versionNumber === 1 ? null : `Forma ${versionNumber}`,
        conceptSnapshot: null,
        promptTemplateVersion: null,
        promptSha256: null,
        assetPath: MASTER,
        assetSha256: 'a'.repeat(64),
        mimeType: 'image/png',
        width: 1024,
        height: 1536,
        hasAlpha: true,
        status: 'ACTIVE',
        adoptedAt: null,
        ...(withDisplayAsset
            ? {
                  displayAssetPath: DISPLAY,
                  displayAssetSha256: 'b'.repeat(64),
                  displayMimeType: 'image/webp',
                  displayWidth: 512,
                  displayHeight: 768,
              }
            : {}),
    } as StoredVisualVersion
}

function buildInput(versions: StoredVisualVersion[], body: unknown) {
    const signedPaths: string[] = []
    const visualRepository = {
        async getTrack() {
            return null
        },
        async getLatestExperiment() {
            return null
        },
        async getLatestFailure() {
            return null
        },
        async listVisualHistory() {
            return versions
        },
        async getCurrentVersion() {
            return versions.at(-1)!
        },
    } as unknown as SupabaseCreatureVisualProgressionRepository

    const storage = {
        async createVisualVersionSignedUrl({ assetPath }: { assetPath: string }) {
            signedPaths.push(assetPath)
            return { signedUrl: `https://signed.example/${assetPath}`, expiresAt: '2030-01-01T00:00:00.000Z' }
        },
    }

    return {
        signedPaths,
        input: {
            profileId: PROFILE,
            requestId: 'request-1',
            body,
            policy,
            resolver: createTestResolver(),
            visualRepository,
            storage,
        } as unknown as CreatureTransformationEdgeOrchestrationInput,
    }
}

describe('client-facing visual URLs', () => {
    it('signs the display asset for every entry of the history, not the master', async () => {
        const versions = [1, 2, 3, 4].map((number) => version(number, true))
        const { signedPaths, input } = buildInput(versions, { operation: 'GET_VISUAL_PROGRESS', creatureId: CREATURE })

        const response = await orchestrateGetCreatureVisualProgress(input)

        expect(response.success).toBe(true)
        expect(signedPaths).not.toContain(MASTER)
        expect(signedPaths.filter((path) => path === DISPLAY)).toHaveLength(versions.length)
    })

    it('signs the display asset for the current visual', async () => {
        const { signedPaths, input } = buildInput([version(2, true)], {
            operation: 'GET_CURRENT_VISUAL',
            creatureId: CREATURE,
        })

        await orchestrateGetCurrentCreatureVisual(input)

        expect(signedPaths).toEqual([DISPLAY])
    })

    it('falls back to the master only for a version that has no display asset yet', async () => {
        const { signedPaths, input } = buildInput([version(2, false)], {
            operation: 'GET_CURRENT_VISUAL',
            creatureId: CREATURE,
        })

        await orchestrateGetCurrentCreatureVisual(input)

        expect(signedPaths).toEqual([MASTER])
    })

    it('mixes both within one history according to what each version has', async () => {
        const versions = [version(1, false), version(2, true), version(3, false), version(4, true)]
        const { signedPaths, input } = buildInput(versions, { operation: 'GET_VISUAL_PROGRESS', creatureId: CREATURE })

        await orchestrateGetCreatureVisualProgress(input)

        // The progress response signs the history and nothing else: its `currentVersion` is
        // metadata, and the URL for it comes from GET_CURRENT_VISUAL.
        expect(signedPaths.filter((path) => path === MASTER)).toHaveLength(2)
        expect(signedPaths.filter((path) => path === DISPLAY)).toHaveLength(2)
    })
})
