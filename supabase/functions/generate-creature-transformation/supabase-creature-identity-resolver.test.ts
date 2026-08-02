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
            description: 'Piccolo drago verde con grandi occhi ambrati, corpo tozzo e cresta di spine fogliari.',
        })
        expect(result.identity.identityFeatures).toEqual(['grandi occhi ambrati', 'corpo verde squamoso e tozzo', 'cresta dorsale di spine fogliari'])
        expect(result.sourceImagePath).toBe('verdant-hatchling-v1.png')
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
})
