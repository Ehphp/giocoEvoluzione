import type { TraitType } from '../../game/types'

export type CreatureVisual = {
    src: string
    alt: string
    /** Multiplier applied to the shared battle-stage creature size. */
    scale?: number
    /** Percentage shift relative to the rendered creature asset. */
    offsetX?: number
    /** Percentage shift relative to the rendered creature asset. */
    offsetY?: number
}

type GeneAssetKey =
    | 'resilience'
    | 'mobility'
    | 'senses'
    | 'metabolism'
    | 'aquatic'

export const GAME_SELECTION_ASSETS = {
    battleBackgroundDefault: '/assets/battle/backgrounds/enchanted-forest.png',
    playerCreature: '/assets/battle/creatures/verdant-hatchling.png',
    opponentCreature: '/assets/battle/creatures/amethyst-hatchling.png',
    backgroundFallback: '/assets/game-ui/placeholders/background.svg',
    playerAvatar: '/assets/game-ui/placeholders/player-avatar.svg',
    opponentAvatar: '/assets/game-ui/placeholders/opponent-avatar.svg',
    environment: '/assets/game-ui/placeholders/environment.svg',
    gene: '/assets/game-ui/placeholders/gene.svg',
    genes: {
        resilience: '/assets/game-ui/genes/gene-resilience.svg',
        mobility: '/assets/game-ui/genes/gene-mobility.svg',
        senses: '/assets/game-ui/genes/gene-senses.svg',
        metabolism: '/assets/game-ui/genes/gene-metabolism.svg',
        aquatic: '/assets/game-ui/genes/gene-aquatic.svg',
    } as const,
} as const

export const DEFAULT_BATTLE_PLAYER_CREATURE: CreatureVisual = {
    src: GAME_SELECTION_ASSETS.playerCreature,
    alt: 'Creatura del giocatore verde',
    scale: .82,
    offsetX: -14,
    // The supplied PNG has transparent space under the feet.
    offsetY: 25,
}

export const DEFAULT_BATTLE_OPPONENT_CREATURE: CreatureVisual = {
    src: GAME_SELECTION_ASSETS.opponentCreature,
    alt: 'Creatura avversaria viola',
    scale: .72,
    offsetX: 10,
    // The supplied PNG has transparent space under the feet.
    offsetY: 25,
}

const EVENT_BATTLE_BACKGROUNDS: Record<string, string> = {
    // Event-specific backgrounds can be added here as the environment catalogue grows.
}

export function getBattleBackgroundForEvent(eventId: string | null | undefined): string {
    return (eventId ? EVENT_BATTLE_BACKGROUNDS[eventId] : undefined) ?? GAME_SELECTION_ASSETS.battleBackgroundDefault
}

export function getGeneAssetOrFallback(geneKey: GeneAssetKey): string {
    return GAME_SELECTION_ASSETS.genes[geneKey] ?? GAME_SELECTION_ASSETS.gene
}

const TRAIT_ASSET_KEYS: Record<TraitType, GeneAssetKey> = {
    FEROCITY: 'resilience',
    ARMOR: 'resilience',
    AGILITY: 'mobility',
    SENSES: 'senses',
    CAMOUFLAGE: 'aquatic',
}

export function getGeneAssetByTrait(traitType: TraitType): string {
    return getGeneAssetOrFallback(TRAIT_ASSET_KEYS[traitType])
}

export function getEventAssetByArtKey(_artKey: string): string {
    return GAME_SELECTION_ASSETS.environment
}
