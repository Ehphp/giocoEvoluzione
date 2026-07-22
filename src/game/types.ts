export const ENVIRONMENTS = ['FOREST', 'MOUNTAIN', 'SWAMP'] as const

export const TRAITS = [
    'STRENGTH',
    'RESISTANCE',
    'AGILITY',
    'PERCEPTION',
    'METABOLISM',
    'ADAPTATION',
    'GRIP_CLAWS',
    'CAMOUFLAGE',
    'WEBBED_LIMBS',
    'FAT_RESERVES',
] as const

export const ACTION_TYPES = ['USE', 'EVOLVE'] as const

export const GAME_STATUSES = [
    'WAITING',
    'CHOOSING',
    'REVEALING',
    'ROUND_RESULT',
    'FINISHED',
] as const

export type Environment = (typeof ENVIRONMENTS)[number]
export type TraitType = (typeof TRAITS)[number]
export type ActionType = (typeof ACTION_TYPES)[number]
export type GameStatus = (typeof GAME_STATUSES)[number]

export type TraitState = {
    level: number
    cooldown: number
}

export type RoundValueBreakdown = {
    actionType: ActionType
    environmentModifier: number
    environmentWeight: number
    environmentContribution: number
    originalLevel: number
    effectiveLevel: number
    levelContribution: number
    total: number
}

export type TraitCollection = Record<TraitType, TraitState>

export type PlayerRoundAction = {
    playerId: string
    trait: TraitType
    actionType: ActionType
}

export type ResolvedPlayerRound = {
    playerId: string
    trait: TraitType
    actionType: ActionType
    roundValue: number
    breakdown: RoundValueBreakdown
    traits: TraitCollection
}

export type ResolveRoundInput = {
    roundNumber: number
    environment: Environment
    player1Id: string
    player2Id: string
    player1Traits: TraitCollection
    player2Traits: TraitCollection
    player1Action: PlayerRoundAction
    player2Action: PlayerRoundAction
    alreadyResolved?: boolean
}

export type RoundResolution = {
    roundNumber: number
    environment: Environment
    player1: ResolvedPlayerRound
    player2: ResolvedPlayerRound
    winnerId: string | null
    awardedPoints: number
    player1ScoreDelta: number
    player2ScoreDelta: number
}