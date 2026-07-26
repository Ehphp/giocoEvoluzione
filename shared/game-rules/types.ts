export const GENE_IDS = ['RESILIENCE', 'MOBILITY', 'SENSES', 'METABOLISM', 'AQUATIC'] as const
export const ACTION_TYPES = ['USE', 'EVOLVE'] as const
export const GAME_STATUSES = ['WAITING', 'CHOOSING', 'REVEALING', 'ROUND_RESULT', 'FINISHED'] as const
export const GAME_MODES = ['PVP', 'VS_BOT'] as const
export const PLAYER_TYPES = ['HUMAN', 'BOT'] as const

export type GeneId = (typeof GENE_IDS)[number]
export type ActionType = (typeof ACTION_TYPES)[number]
export type GameStatus = (typeof GAME_STATUSES)[number]
export type GameMode = (typeof GAME_MODES)[number]
export type PlayerType = (typeof PLAYER_TYPES)[number]
export type WorldDefinition = { id: string; name: string; planetName: string; backgroundArtKey: string; paletteKey: string }

export type GeneState = { level: number; cooldown: number }
export type GeneCollection = Record<GeneId, GeneState>

export type GeneDefinition = {
    id: GeneId
    label: string
    description: string
    assetKey: string
    displayOrder: number
}

export type EventEffect = { trait: GeneId; modifier: number; reason: string }
export type RoundEventDefinition = {
    id: string
    title: string
    shortDescription: string
    category: 'CLIMATE' | 'GEOLOGICAL' | 'BIOLOGICAL' | 'ASTRONOMICAL' | 'ECOLOGICAL'
    artKey: string
    tags: string[]
    modifiers: Record<GeneId, number>
    effects: EventEffect[]
}

export type RoundValueBreakdown = {
    actionType: ActionType
    baseContribution: number
    eventModifier: number
    levelContribution: number
    originalLevel: number
    effectiveLevel: number
    total: number
    appliedEventEffects: Array<EventEffect & { contribution: number }>
}

export type PlayerRoundAction = { playerId: string; trait: GeneId; actionType: ActionType }
export type ResolvedPlayerRound = PlayerRoundAction & {
    roundValue: number
    breakdown: RoundValueBreakdown
    traits: GeneCollection
}
export type ResolveRoundInput = {
    roundNumber: number
    roundEvent: RoundEventDefinition
    player1Id: string
    player2Id: string
    player1Traits: GeneCollection
    player2Traits: GeneCollection
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
