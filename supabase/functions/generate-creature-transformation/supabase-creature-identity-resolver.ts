import type { CreatureIdentityResolver, ResolvedCreatureSource } from '../../../shared/creature-transformations/contracts.ts'
import { CREATURE_IDENTITY_REGISTRY, type CreatureIdentityDefinition } from './identity-registry.ts'

export type StoredPlayerCreature = Readonly<{
    id: string
    profileId: string
    baseCreatureKey: string
}>

export interface PlayerCreatureRepository {
    findByCreatureId(creatureId: string): Promise<StoredPlayerCreature | null>
}

export type CreatureIdentityResolutionErrorCode =
    | 'CREATURE_NOT_FOUND'
    | 'CREATURE_NOT_OWNED'
    | 'CREATURE_IDENTITY_NOT_SUPPORTED'
    | 'CREATURE_IDENTITY_CONFIGURATION_INVALID'
    | 'CREATURE_LOOKUP_FAILED'

export class CreatureIdentityResolutionError extends Error {
    readonly code: CreatureIdentityResolutionErrorCode

    constructor(code: CreatureIdentityResolutionErrorCode, message: string, options?: { cause?: unknown }) {
        super(message, options)
        this.name = 'CreatureIdentityResolutionError'
        this.code = code
    }
}

function isCompleteIdentityDefinition(definition: CreatureIdentityDefinition): boolean {
    return Boolean(
        definition.baseCreatureKey.trim()
        && definition.sourceImagePath.trim()
        && definition.description.trim()
        && definition.styleDefinition.trim()
        && definition.identityFeatures.length
        && definition.identityFeatures.every((feature) => feature.trim()),
    )
}

export class SupabaseCreatureIdentityResolver implements CreatureIdentityResolver {
    private readonly repository: PlayerCreatureRepository
    private readonly registry: Readonly<Record<string, CreatureIdentityDefinition>>

    constructor(repository: PlayerCreatureRepository, registry = CREATURE_IDENTITY_REGISTRY) {
        this.repository = repository
        this.registry = registry
    }

    async resolve(input: { profileId: string; creatureId: string }): Promise<ResolvedCreatureSource> {
        let creature: StoredPlayerCreature | null
        try {
            creature = await this.repository.findByCreatureId(input.creatureId)
        } catch (error) {
            throw new CreatureIdentityResolutionError('CREATURE_LOOKUP_FAILED', 'Impossibile recuperare la creatura richiesta.', { cause: error })
        }

        if (!creature) {
            throw new CreatureIdentityResolutionError('CREATURE_NOT_FOUND', 'La creatura richiesta non esiste.')
        }
        if (creature.profileId !== input.profileId) {
            throw new CreatureIdentityResolutionError('CREATURE_NOT_OWNED', 'La creatura non appartiene al profilo autenticato.')
        }

        const definition = this.registry[creature.baseCreatureKey]
        if (!definition) {
            throw new CreatureIdentityResolutionError('CREATURE_IDENTITY_NOT_SUPPORTED', 'La creatura non ha un identita canonica supportata.')
        }
        if (!isCompleteIdentityDefinition(definition) || definition.baseCreatureKey !== creature.baseCreatureKey) {
            throw new CreatureIdentityResolutionError('CREATURE_IDENTITY_CONFIGURATION_INVALID', 'La configurazione canonica della creatura non e completa.')
        }

        return {
            identity: {
                creatureId: creature.id,
                baseCreatureKey: definition.baseCreatureKey,
                description: definition.description,
                identityFeatures: [...definition.identityFeatures],
                styleDefinition: definition.styleDefinition,
            },
            sourceImagePath: definition.sourceImagePath,
        }
    }
}

