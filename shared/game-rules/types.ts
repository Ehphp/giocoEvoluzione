export const ADAPTATION_IDS = ['FEROCITY', 'ARMOR', 'AGILITY', 'SENSES', 'CAMOUFLAGE'] as const
export const ACTION_TYPES = ['USE', 'EVOLVE', 'ACTIVATE_MUTATION'] as const
export const GAME_STATUSES = ['WAITING', 'CHOOSING', 'REVEALING', 'ROUND_RESULT', 'FINISHED'] as const
export const GAME_MODES = ['PVP', 'VS_BOT'] as const
export const PLAYER_TYPES = ['HUMAN', 'BOT'] as const
export { COMBAT_MUTATION_IDS } from './combat-mutations.ts'
import type { CombatMutationId as CatalogCombatMutationId, CombatMutationDefinition as CatalogCombatMutationDefinition } from './combat-mutations.ts'

export type AdaptationId = (typeof ADAPTATION_IDS)[number]
export type ActionType = (typeof ACTION_TYPES)[number]
export type GameStatus = (typeof GAME_STATUSES)[number]
export type GameMode = (typeof GAME_MODES)[number]
export type PlayerType = (typeof PLAYER_TYPES)[number]
export type CombatMutationId = CatalogCombatMutationId
/** Exactly two equipped mutations, stored in their persisted Slot 1 / Slot 2 order. */
export type CombatMutationLoadout = readonly [CombatMutationId, CombatMutationId]
export type AdaptiveCoreStatus = 'DORMANT' | 'ARMED' | 'CONSUMED'
export type WorldDefinition = { id: string; name: string; planetName: string; backgroundArtKey: string; paletteKey: string }

export type AdaptationLevel = 0 | 1 | 2
export type AdaptationState = { level: AdaptationLevel; exhausted: boolean }
export type AdaptationCollection = Record<AdaptationId, AdaptationState>
/** Per-match runtime state. Equipped mutations remain separate and are snapshotted on players. */
export type CombatMutationState = { elasticLimbsUsed: boolean; adaptiveCoreStatus: AdaptiveCoreStatus; armoredMemoryUsed: boolean; recoverySurgeUsed: boolean }
export type CombatMutationEffect =
    | { id: 'ELASTIC_LIMBS'; effect: 'AGILITY_PRESERVED' }
    | { id: 'ADAPTIVE_CORE'; effect: 'CORE_ARMED' }
    | { id: 'ADAPTIVE_CORE'; effect: 'ROUND_VALUE_BONUS'; value: 1 }
    | { id: 'ARMORED_MEMORY'; effect: 'ARMOR_PRESERVED' }
    | { id: 'RECOVERY_SURGE'; effect: 'EVOLVE_ROUND_BONUS'; value: 1 }

export type AdaptationDefinition = { id: AdaptationId; label: string; description: string; assetKey: string; displayOrder: number }
export type CombatMutationDefinition = CatalogCombatMutationDefinition
export type EnvironmentalCrisisEffect = { trait: AdaptationId; modifier: 0 | 1 | 2; reason: string }
export type EnvironmentalCrisisDefinition = {
    id: string; title: string; shortDescription: string
    category: 'CLIMATE' | 'GEOLOGICAL' | 'BIOLOGICAL' | 'ASTRONOMICAL' | 'ECOLOGICAL'
    artKey: string; tags: string[]; modifiers: Record<AdaptationId, 0 | 1 | 2>; effects: EnvironmentalCrisisEffect[]
}

export type RoundValueBreakdown = {
    actionType: ActionType
    baseContribution: number
    levelContribution: number
    eventModifier: number
    matchupBonus: number
    mutationBonus: number
    originalLevel: number
    effectiveLevel: number
    total: number
    appliedEventEffects: Array<EnvironmentalCrisisEffect & { contribution: number }>
}

export type DirectPlayerRoundAction = { playerId: string; actionType: 'USE' | 'EVOLVE'; trait: AdaptationId }
export type ActivateMutationRoundAction = {
    playerId: string
    actionType: 'ACTIVATE_MUTATION'
    mutationId: 'SYMBIOSIS'
    sourceTrait: AdaptationId
    targetTrait: AdaptationId
}
export type FineDelMondoActivateMutationRoundAction = {
    playerId: string
    actionType: 'ACTIVATE_MUTATION'
    mutationId: 'FINE_DEL_MONDO'
}
export type PlayerRoundAction = DirectPlayerRoundAction | ActivateMutationRoundAction | FineDelMondoActivateMutationRoundAction
export type DirectRoundAction = Omit<DirectPlayerRoundAction, 'playerId'>
export type ActivateMutationAction = Omit<ActivateMutationRoundAction, 'playerId'> | Omit<FineDelMondoActivateMutationRoundAction, 'playerId'>
export type RoundAction = DirectRoundAction | ActivateMutationAction

/** Match-scoped state: ownership also proves that its owner's SYMBIOSIS is consumed. */
export type SymbiosisLink = {
    ownerPlayerId: string
    sourceTrait: AdaptationId
    targetPlayerId: string
    targetTrait: AdaptationId
    activatedRound: number
}
export type SymbiosisActivationEvent = { effect: 'LINK_ACTIVATED'; link: SymbiosisLink }
export type SymbiosisPropagationEvent = {
    effect: 'LEVEL_REFLECTED'
    targetPlayerId: string
    targetTrait: AdaptationId
    sourceLevelUps: Array<{ playerId: string; trait: AdaptationId }>
    pairKeys: string[]
    requestedLevels: number
    appliedLevels: number
    levelBefore: AdaptationLevel
    levelAfter: AdaptationLevel
}
export type SymbiosisRoundEvent = SymbiosisActivationEvent | SymbiosisPropagationEvent
export type FineDelMondoOutcome = 'FINE_DEL_MONDO' | 'ERA_PROSPERA'
/** Match-scoped ownership is the canonical proof that this active mutation was consumed. */
export type FineDelMondoActivation = {
    ownerPlayerId: string
    activatedRound: number
    outcome: FineDelMondoOutcome
}
export type FineDelMondoActivationRequest = Pick<FineDelMondoActivation, 'ownerPlayerId' | 'activatedRound'>
export type ResolvedPlayerRound = PlayerRoundAction & { roundValue: number; breakdown: RoundValueBreakdown; traits: AdaptationCollection; combatMutationState: CombatMutationState; mutationEffects: CombatMutationEffect[] }
export type ResolveRoundInput = {
    roundNumber: number; roundEvent: EnvironmentalCrisisDefinition; player1Id: string; player2Id: string
    player1Traits: AdaptationCollection; player2Traits: AdaptationCollection
    /** Frozen by the match row and accepted only when supported by the engine. */
    ruleVersion: string
    player1CombatMutationState: CombatMutationState; player2CombatMutationState: CombatMutationState
    player1CombatMutationLoadout: CombatMutationLoadout; player2CombatMutationLoadout: CombatMutationLoadout
    /** Required by persisted matches; optional only for compatibility with legacy pure callers. */
    symbiosisLinks?: readonly SymbiosisLink[]
    /** Canonical match duration. Optional only for legacy pure callers. */
    scheduledRounds?: number
    /** Match-scoped consumption history for FINE_DEL_MONDO. */
    fineDelMondoActivations?: readonly FineDelMondoActivation[]
    player1Action: PlayerRoundAction; player2Action: PlayerRoundAction; alreadyResolved?: boolean
}
export type RoundResolution = {
    roundNumber: number; roundEvent: EnvironmentalCrisisDefinition; player1: ResolvedPlayerRound; player2: ResolvedPlayerRound
    winnerId: string | null; awardedPoints: number; player1ScoreDelta: number; player2ScoreDelta: number
    symbiosisLinks: SymbiosisLink[]
    symbiosisEvents: SymbiosisRoundEvent[]
    fineDelMondoActivationRequests: FineDelMondoActivationRequest[]
}
