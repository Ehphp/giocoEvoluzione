import { describe, expect, it } from 'vitest'

import {
    CreatureIdentityResolutionError,
    SupabaseCreatureIdentityResolver,
    type PlayerCreatureRepository,
    type StoredPlayerCreature,
} from './supabase-creature-identity-resolver.ts'
import type { VisualInspection } from '../../../shared/creature-transformations/visual-inspection.ts'

function createRepository(record: StoredPlayerCreature | null): PlayerCreatureRepository {
    return { async findByCreatureId() { return record } }
}

describe('SupabaseCreatureIdentityResolver', () => {
    it('resolves the canonical identity without using client supplied identity fields', async () => {
        const resolver = new SupabaseCreatureIdentityResolver(createRepository({
            id: 'creature-1',
            profileId: 'profile-1',
            baseCreatureKey: 'VERDANT_HATCHLING',
        }))

        const result = await resolver.resolve({ profileId: 'profile-1', creatureId: 'creature-1' })

        expect(result.identity).toMatchObject({
            creatureId: 'creature-1',
            baseCreatureKey: 'VERDANT_HATCHLING',
            description: 'A stylized fantasy creature with a distinctive, recognizable visual identity.',
        })
        expect(result.identity.identityFeatures).toEqual(['distinctive individual identity'])
        expect(result.identity.mutableVisualFeatures).toEqual(['visual characteristics'])
        expect(result.sourceImagePath).toBe('verdant-hatchling/e0b9875bc155ffa2ba00e7d83e86c8e791ccc48d539c11d3fcfd5d7fced65605.png')
        expect(result.sourceSha256).toBe('e0b9875bc155ffa2ba00e7d83e86c8e791ccc48d539c11d3fcfd5d7fced65605')
    })

    it('rejects missing, foreign and unsupported creature records', async () => {
        await expect(new SupabaseCreatureIdentityResolver(createRepository(null)).resolve({ profileId: 'profile-1', creatureId: 'missing' }))
            .rejects.toMatchObject({ code: 'CREATURE_NOT_FOUND' } satisfies Partial<CreatureIdentityResolutionError>)
        await expect(new SupabaseCreatureIdentityResolver(createRepository({ id: 'creature-1', profileId: 'profile-2', baseCreatureKey: 'VERDANT_HATCHLING' })).resolve({ profileId: 'profile-1', creatureId: 'creature-1' }))
            .rejects.toMatchObject({ code: 'CREATURE_NOT_OWNED' } satisfies Partial<CreatureIdentityResolutionError>)
        await expect(new SupabaseCreatureIdentityResolver(createRepository({ id: 'creature-1', profileId: 'profile-1', baseCreatureKey: 'UNKNOWN_CREATURE' })).resolve({ profileId: 'profile-1', creatureId: 'creature-1' }))
            .rejects.toMatchObject({ code: 'CREATURE_IDENTITY_NOT_SUPPORTED' } satisfies Partial<CreatureIdentityResolutionError>)
    })

    it('rejects incomplete canonical registry configuration', async () => {
        const resolver = new SupabaseCreatureIdentityResolver(
            createRepository({ id: 'creature-1', profileId: 'profile-1', baseCreatureKey: 'VERDANT_HATCHLING' }),
            {
                VERDANT_HATCHLING: {
                    baseCreatureKey: 'VERDANT_HATCHLING', sourceImagePath: '', description: 'Creatura', identityFeatures: ['volto'], styleDefinition: 'Stile',
                },
            },
        )

        await expect(resolver.resolve({ profileId: 'profile-1', creatureId: 'creature-1' }))
            .rejects.toMatchObject({ code: 'CREATURE_IDENTITY_CONFIGURATION_INVALID' } satisfies Partial<CreatureIdentityResolutionError>)
    })

    it('reconstructs permanent topology from adopted history older than the prompt context window', async () => {
        const history = [
            { versionNumber: 2, visualTraitId: 'LOCOMOTION_ADAPTATION' as const, evolutionTargetId: 'LIMBS_AND_FEET' as const, conceptName: 'Arti mediani', bodyPlanMutationId: 'ADD_LIMB_PAIR' as const },
            ...Array.from({ length: 9 }, (_, index) => ({ versionNumber: index + 3, visualTraitId: 'LOCOMOTION_ADAPTATION' as const, evolutionTargetId: 'TAIL' as const, conceptName: `Coda ${index + 3}` })),
        ]
        const repository: PlayerCreatureRepository = {
            async findByCreatureId() { return { id: 'creature-1', profileId: 'profile-1', baseCreatureKey: 'VERDANT_HATCHLING', currentVisualVersionId: 'version-10' } },
            async findCurrentVisualVersion() { return { id: 'version-10', creatureId: 'creature-1', assetPath: 'current.png', assetSha256: 'a'.repeat(64), versionNumber: 10, isBaseVersion: false } },
            async listPreviousTransformations() { return history },
        }

        const result = await new SupabaseCreatureIdentityResolver(repository).resolve({ profileId: 'profile-1', creatureId: 'creature-1' })

        expect(result.previousTransformations).toHaveLength(10)
        expect(result.adoptedBodyPlanMutationIds).toEqual(['ADD_LIMB_PAIR'])
        expect(result.bodyPlan?.id).toBe('SIX_LIMBED')
    })

    it('uses the adopted corrected visual asset and its corrected facing as the next evolution source', async () => {
        const correctedInspection: VisualInspection = {
            schemaVersion: 'visual-inspection-v1', inspectedAt: '2026-08-17T00:00:01.000Z',
            anomalyDetector: { status: 'COMPLETE', evidence: [] }, visualAnomalies: [],
            stateMapper: { status: 'COMPLETE', usedVision1Evidence: false, evidenceAssessments: [], structuralConcerns: [] },
            observedVisualState: {
                schemaVersion: 'observed-visual-v1', orientation: { viewpoint: 'PROFILE', facing: 'IMAGE_LEFT' }, observedBodyPlan: 'quadruped',
                headAndEyes: 'one head', limbsAndLimbLikeStructures: 'four legs', tail: 'one tail', hornsAntlers: 'none', dorsalStructures: 'none', appendages: 'none',
                skinCovering: 'scales', primaryColors: ['green'], distinctiveStructures: [], targetRegions: [],
            },
            assetCorrection: { type: 'HORIZONTAL_MIRROR', appliedAt: '2026-08-17T00:00:01.000Z', outputFacing: 'IMAGE_RIGHT', correctedFacing: 'IMAGE_LEFT' },
        }
        const repository: PlayerCreatureRepository = {
            async findByCreatureId() { return { id: 'creature-1', profileId: 'profile-1', baseCreatureKey: 'VERDANT_HATCHLING', currentVisualVersionId: 'version-2' } },
            async findCurrentVisualVersion() {
                return {
                    id: 'version-2', creatureId: 'creature-1', assetPath: 'candidates/profile-1/' + 'c'.repeat(64) + '.png', assetSha256: 'c'.repeat(64),
                    versionNumber: 2, isBaseVersion: false, visualInspection: correctedInspection,
                }
            },
        }

        const result = await new SupabaseCreatureIdentityResolver(repository).resolve({ profileId: 'profile-1', creatureId: 'creature-1' })

        expect(result).toMatchObject({
            sourceImagePath: 'candidates/profile-1/' + 'c'.repeat(64) + '.png', sourceSha256: 'c'.repeat(64),
            visualInspection: { observedVisualState: { orientation: { facing: 'IMAGE_LEFT' } }, assetCorrection: { type: 'HORIZONTAL_MIRROR' } },
        })
    })
})
