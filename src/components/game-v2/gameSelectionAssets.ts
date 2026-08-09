import type { TraitType } from '../../game/types'
import { ASSETS, type GeneAssetKey } from '../../ui/assets'

export type CreatureVisual = {
    src: string
    alt: string
    /** Direction the original asset faces before battle presentation is applied. */
    nativeFacing?: 'left' | 'right'
    /** Multiplier applied to the shared battle-stage creature size. */
    scale?: number
    /** Percentage shift relative to the rendered creature asset. */
    offsetX?: number
    /** Percentage shift relative to the rendered creature asset. */
    offsetY?: number
}

export const GAME_SELECTION_ASSETS = {
    battleBackgroundDefault: ASSETS.scenery.forest,
    playerCreature: ASSETS.creatures.player,
    opponentCreature: ASSETS.creatures.opponent,
    backgroundFallback: ASSETS.scenery.fallback,
    playerAvatar: ASSETS.placeholders.playerAvatar,
    opponentAvatar: ASSETS.placeholders.opponentAvatar,
    environment: ASSETS.placeholders.environment,
    gene: ASSETS.placeholders.gene,
    genes: ASSETS.genes,
} as const

export const DEFAULT_BATTLE_PLAYER_CREATURE: CreatureVisual = {
    src: GAME_SELECTION_ASSETS.playerCreature,
    alt: 'Creatura del giocatore verde',
    nativeFacing: 'right',
    scale: .95,
    offsetX: 0,
    // The supplied PNG has transparent space under the feet.
    offsetY: 18,
}

export const DEFAULT_BATTLE_OPPONENT_CREATURE: CreatureVisual = {
    src: GAME_SELECTION_ASSETS.opponentCreature,
    alt: 'Creatura avversaria viola',
    // The supplied bot sprite already looks toward the left.
    nativeFacing: 'left',
    scale: .86,
    offsetX: 0,
    // The supplied PNG has transparent space under the feet.
    offsetY: 18,
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

export function getEventAssetByArtKey(artKey: string): string {
    return ASSETS.environments[artKey] ?? GAME_SELECTION_ASSETS.environment
}
