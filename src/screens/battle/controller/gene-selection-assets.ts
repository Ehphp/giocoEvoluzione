import { DEFAULT_CREATURE_HEIGHT_METERS } from '../../../../shared/creature-scale.ts'
import type { TraitType } from '../../../game/types'
import { ASSETS, type GeneAssetKey } from '../../../ui/assets'

export type CreatureVisual = {
    src: string
    alt: string
    /** Canonical biological height, used only by BattleArena. */
    heightMeters: number
    /** Direction the original asset faces before battle presentation is applied. */
    nativeFacing?: 'left' | 'right'
    /** Percentage shift relative to the rendered creature asset. */
    offsetX?: number
    /** Percentage shift relative to the rendered creature asset. */
    offsetY?: number
}

/** A loaded visual may replace the asset while retaining the participant's biological data. */
export type CreatureVisualSource = Pick<CreatureVisual, 'src' | 'alt' | 'nativeFacing' | 'offsetX' | 'offsetY'>

export const GAME_SELECTION_ASSETS = {
    battleBackgroundDefault: ASSETS.scenery.forest,
    playerCreature: ASSETS.creatures.default,
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
    heightMeters: DEFAULT_CREATURE_HEIGHT_METERS,
    nativeFacing: 'right',
    offsetX: 0,
    offsetY: 0,
}

export const DEFAULT_BATTLE_OPPONENT_CREATURE: CreatureVisual = {
    src: GAME_SELECTION_ASSETS.opponentCreature,
    alt: 'Creatura avversaria viola',
    heightMeters: DEFAULT_CREATURE_HEIGHT_METERS,
    // The supplied bot sprite already looks toward the left.
    nativeFacing: 'left',
    offsetX: 0,
    offsetY: 0,
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
