import type {
    CreatureIdentityResolver,
    ResolvedCreatureSource,
} from '../../../shared/creature-transformations/contracts.ts'
import { CREATURE_IDENTITY_REGISTRY, type CreatureIdentityDefinition } from './identity-registry.ts'
import { getSafeDatabaseLookupCode } from './database-lookup-diagnostics.ts'
import type { PreviousCreatureTransformationSummary } from '../../../shared/creature-transformations/creature-visual-versions.ts'
import { resolveCanonicalBodyPlan } from '../../../shared/creature-transformations/flux-evolution/body-plan-registry.ts'
import type { BodyPlanMutationId } from '../../../shared/creature-transformations/flux-evolution/body-plan-mutations.ts'
import type { VisualInspection } from '../../../shared/creature-transformations/visual-inspection.ts'
import { resolveCreatureHeightMeters } from '../../../shared/creature-scale.ts'

export type StoredPlayerCreature = Readonly<{
    id: string
    profileId: string
    baseCreatureKey: string
    heightMeters?: number | null
    currentVisualVersionId?: string | null
}>

export type StoredCurrentVisualVersion = Readonly<{
    id: string
    creatureId: string
    assetPath: string
    assetSha256: string
    versionNumber: number
    isBaseVersion: boolean
    visualInspection?: VisualInspection | null
}>

export interface PlayerCreatureRepository {
    findByCreatureId(creatureId: string): Promise<StoredPlayerCreature | null>
    findCurrentVisualVersion?(input: {
        creatureId: string
        versionId: string
    }): Promise<StoredCurrentVisualVersion | null>
    listPreviousTransformations?(creatureId: string): Promise<PreviousCreatureTransformationSummary[]>
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
        definition.baseCreatureKey.trim() &&
        definition.sourceImagePath.trim() &&
        definition.description.trim() &&
        definition.styleDefinition.trim() &&
        definition.identityFeatures.length &&
        definition.identityFeatures.every((feature) => feature.trim()) &&
        definition.mutableVisualFeatures.length &&
        definition.mutableVisualFeatures.every((feature) => feature.trim()),
    )
}

export class SupabaseCreatureIdentityResolver implements CreatureIdentityResolver {
    private readonly repository: PlayerCreatureRepository
    private readonly registry: Readonly<Record<string, CreatureIdentityDefinition>>

    constructor(repository: PlayerCreatureRepository, registry = CREATURE_IDENTITY_REGISTRY) {
        this.repository = repository
        this.registry = registry
    }

    /**
     * Esegue una lettura di supporto trasformandone il guasto in un errore riconoscibile.
     *
     * Il codice del database finisce nel messaggio perche' e' l'unica diagnostica che arriva a chi
     * chiama: un `42883` (funzione inesistente) e un `PGRST202` (schema cache non ricaricato) hanno
     * rimedi opposti e altrimenti sarebbero lo stesso 500 opaco.
     */
    private async lookup<T>(stage: string, read: () => Promise<T>): Promise<T> {
        try {
            return await read()
        } catch (error) {
            throw new CreatureIdentityResolutionError(
                'CREATURE_LOOKUP_FAILED',
                `Lettura non riuscita (${stage}/${getSafeDatabaseLookupCode(error)}).`,
                { cause: error },
            )
        }
    }

    async resolve(input: { profileId: string; creatureId: string }): Promise<ResolvedCreatureSource> {
        let creature: StoredPlayerCreature | null
        try {
            creature = await this.repository.findByCreatureId(input.creatureId)
        } catch (error) {
            throw new CreatureIdentityResolutionError(
                'CREATURE_LOOKUP_FAILED',
                'Impossibile recuperare la creatura richiesta.',
                { cause: error },
            )
        }

        if (!creature) {
            throw new CreatureIdentityResolutionError('CREATURE_NOT_FOUND', 'La creatura richiesta non esiste.')
        }
        if (creature.profileId !== input.profileId) {
            throw new CreatureIdentityResolutionError(
                'CREATURE_NOT_OWNED',
                'La creatura non appartiene al profilo autenticato.',
            )
        }

        const definition = this.registry[creature.baseCreatureKey]
        if (!definition) {
            throw new CreatureIdentityResolutionError(
                'CREATURE_IDENTITY_NOT_SUPPORTED',
                'La creatura non ha un identita canonica supportata.',
            )
        }
        if (!isCompleteIdentityDefinition(definition) || definition.baseCreatureKey !== creature.baseCreatureKey) {
            throw new CreatureIdentityResolutionError(
                'CREATURE_IDENTITY_CONFIGURATION_INVALID',
                'La configurazione canonica della creatura non e completa.',
            )
        }

        // Come findByCreatureId sopra: senza questa classificazione un guasto di lettura risale
        // fino a mapThrownError, che non lo riconosce e lo appiattisce in un INTERNAL_ERROR senza
        // codice ne' log — indistinguibile da qualunque altro errore del server.
        const currentVisualVersion = await this.lookup('CURRENT_VISUAL_VERSION', () =>
            creature.currentVisualVersionId && this.repository.findCurrentVisualVersion
                ? this.repository.findCurrentVisualVersion({
                      creatureId: creature.id,
                      versionId: creature.currentVisualVersionId,
                  })
                : Promise.resolve(null),
        )
        if (creature.currentVisualVersionId && !currentVisualVersion) {
            throw new CreatureIdentityResolutionError(
                'CREATURE_LOOKUP_FAILED',
                'La versione visuale corrente della creatura non e disponibile.',
            )
        }
        const previousTransformations = await this.lookup('VISUAL_LINEAGE', () =>
            creature.currentVisualVersionId && this.repository.listPreviousTransformations
                ? this.repository.listPreviousTransformations(creature.id)
                : Promise.resolve([]),
        )
        // Adopted structural mutations, in adoption order, are what makes the canonical body
        // plan of this individual differ from its starter topology.
        const adoptedBodyPlanMutationIds = previousTransformations.flatMap((entry): BodyPlanMutationId[] =>
            entry.bodyPlanMutationId ? [entry.bodyPlanMutationId] : [],
        )

        return {
            bodyPlan: resolveCanonicalBodyPlan({
                baseCreatureKey: definition.baseCreatureKey,
                adoptedBodyPlanMutationIds,
            }),
            adoptedBodyPlanMutationIds,
            identity: {
                creatureId: creature.id,
                baseCreatureKey: definition.baseCreatureKey,
                description: definition.description,
                identityFeatures: [...definition.identityFeatures],
                mutableVisualFeatures: [...definition.mutableVisualFeatures],
                styleDefinition: definition.styleDefinition,
            },
            sourceImagePath: currentVisualVersion?.assetPath ?? definition.sourceImagePath,
            sourceSha256:
                currentVisualVersion?.assetSha256 ?? 'e0b9875bc155ffa2ba00e7d83e86c8e791ccc48d539c11d3fcfd5d7fced65605',
            sourceIsBaseVersion: currentVisualVersion?.isBaseVersion ?? true,
            currentVisualVersionId:
                currentVisualVersion?.id ?? creature.currentVisualVersionId ?? `base:${creature.id}`,
            currentVersionNumber: currentVisualVersion?.versionNumber ?? 1,
            heightMeters: resolveCreatureHeightMeters(creature.heightMeters, creature.baseCreatureKey),
            visualInspection: currentVisualVersion?.visualInspection ?? null,
            // The full adopted history is needed to reconstruct permanent body-plan mutations.
            // Prompt lineage itself is bounded separately by the evolution planner.
            previousTransformations,
        }
    }
}
