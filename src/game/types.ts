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

export type TraitType = (typeof TRAITS)[number]
export type ActionType = (typeof ACTION_TYPES)[number]
export type GameStatus = (typeof GAME_STATUSES)[number]

export const ROUND_EVENT_CATEGORIES = [
    'CLIMATE',
    'GEOLOGICAL',
    'BIOLOGICAL',
    'ASTRONOMICAL',
    'ECOLOGICAL',
] as const

export const ROUND_EVENT_RARITIES = ['COMMON', 'UNCOMMON', 'RARE'] as const
export const ROUND_EVENT_INTENSITIES = [1, 2, 3] as const

export type RoundEventCategory = (typeof ROUND_EVENT_CATEGORIES)[number]
export type RoundEventRarity = (typeof ROUND_EVENT_RARITIES)[number]
export type RoundEventIntensity = (typeof ROUND_EVENT_INTENSITIES)[number]

export type WorldDefinition = {
    id: string
    name: string
    planetName: string
    backgroundArtKey: string
    paletteKey: string
}

export type RoundEventEffect = {
    trait: TraitType
    modifier: number
    reason: string
}

export type RoundEventDefinition = {
    id: string
    title: string
    shortDescription: string
    longDescription?: string
    category: RoundEventCategory
    rarity: RoundEventRarity
    intensity: RoundEventIntensity
    artKey: string
    tags: string[]
    effects: RoundEventEffect[]
}

export type TraitState = {
    level: number
    cooldown: number
}

export type RoundValueBreakdown = {
    actionType: ActionType
    eventModifierTotal: number
    eventWeight: number
    eventContribution: number
    appliedEventEffects: Array<RoundEventEffect & { contribution: number }>
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
    roundEvent: RoundEventDefinition
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
    roundEvent: RoundEventDefinition
    player1: ResolvedPlayerRound
    player2: ResolvedPlayerRound
    winnerId: string | null
    awardedPoints: number
    player1ScoreDelta: number
    player2ScoreDelta: number
}