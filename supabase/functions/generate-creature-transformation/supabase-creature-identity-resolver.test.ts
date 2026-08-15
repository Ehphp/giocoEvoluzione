import { describe, expect, it } from 'vitest'

import {
    CreatureIdentityResolutionError,
    SupabaseCreatureIdentityResolver,
    type PlayerCreatureRepository,
    type StoredPlayerCreature,
} from './supabase-creature-identity-resolver.ts'

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
        expect(result.sourceImagePath).toBe('verdant-hatchling-v1.png')
        expect(result.sourceSha256).toBe('5ccad0bef02c1a3326238819861a5c25d93d8e5b1a96604cf2852c8e59bd995c')
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
})
