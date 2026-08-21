export const ADAPTATION_IDS = ['FEROCITY', 'ARMOR', 'AGILITY', 'SENSES', 'CAMOUFLAGE'] as const
export const ACTION_TYPES = ['USE', 'EVOLVE'] as const
export const GAME_STATUSES = ['WAITING', 'CHOOSING', 'REVEALING', 'ROUND_RESULT', 'FINISHED'] as const
export const GAME_MODES = ['PVP', 'VS_BOT'] as const
export const PLAYER_TYPES = ['HUMAN', 'BOT'] as const
export const COMBAT_MUTATION_IDS = ['ELASTIC_LIMBS', 'ADAPTIVE_CORE', 'ARMORED_MEMORY', 'RECOVERY_SURGE'] as const

export type AdaptationId = (typeof ADAPTATION_IDS)[number]
export type ActionType = (typeof ACTION_TYPES)[number]
export type GameStatus = (typeof GAME_STATUSES)[number]
export type GameMode = (typeof GAME_MODES)[number]
export type PlayerType = (typeof PLAYER_TYPES)[number]
export type CombatMutationId = (typeof COMBAT_MUTATION_IDS)[number]
/** Exactly two static MVP mutations, stored in the catalog display order. */
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
export type CombatMutationDefinition = { id: CombatMutationId; label: string; description: string }
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

export type PlayerRoundAction = { playerId: string; trait: AdaptationId; actionType: ActionType }
export type ResolvedPlayerRound = PlayerRoundAction & { roundValue: number; breakdown: RoundValueBreakdown; traits: AdaptationCollection; combatMutationState: CombatMutationState; mutationEffects: CombatMutationEffect[] }
export type ResolveRoundInput = {
    roundNumber: number; roundEvent: EnvironmentalCrisisDefinition; player1Id: string; player2Id: string
    player1Traits: AdaptationCollection; player2Traits: AdaptationCollection
    player1CombatMutationState?: CombatMutationState; player2CombatMutationState?: CombatMutationState
    player1CombatMutationLoadout?: CombatMutationLoadout; player2CombatMutationLoadout?: CombatMutationLoadout
    player1Action: PlayerRoundAction; player2Action: PlayerRoundAction; alreadyResolved?: boolean
}
export type RoundResolution = {
    roundNumber: number; roundEvent: EnvironmentalCrisisDefinition; player1: ResolvedPlayerRound; player2: ResolvedPlayerRound
    winnerId: string | null; awardedPoints: number; player1ScoreDelta: number; player2ScoreDelta: number
}
