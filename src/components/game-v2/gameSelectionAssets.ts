type GeneAssetKey =
    | 'strength'
    | 'resistance'
    | 'agility'
    | 'perception'
    | 'metabolism'
    | 'adaptation'
    | 'grip-claws'
    | 'camouflage'
    | 'webbed-limbs'
    | 'fat-reserves'

import type { TraitType } from '../../game/types'

export const GAME_SELECTION_ASSETS = {
    background: '/assets/game-ui/placeholders/background.svg',
    playerAvatar: '/assets/game-ui/placeholders/player-avatar.svg',
    opponentAvatar: '/assets/game-ui/placeholders/opponent-avatar.svg',
    playerCreature: '/assets/game-ui/placeholders/player-creature.svg',
    opponentCreature: '/assets/game-ui/placeholders/opponent-creature.svg',
    environment: '/assets/game-ui/placeholders/environment.svg',
    gene: '/assets/game-ui/placeholders/gene.svg',
    genes: {
        strength: '/assets/game-ui/placeholders/gene-strength.svg',
        resistance: '/assets/game-ui/placeholders/gene-resistance.svg',
        agility: '/assets/game-ui/placeholders/gene-agility.svg',
        perception: '/assets/game-ui/placeholders/gene-perception.svg',
        metabolism: '/assets/game-ui/placeholders/gene-metabolism.svg',
        adaptation: '/assets/game-ui/placeholders/gene-adaptation.svg',
        'grip-claws': '/assets/game-ui/placeholders/gene-grip-claws.svg',
        camouflage: '/assets/game-ui/placeholders/gene-camouflage.svg',
        'webbed-limbs': '/assets/game-ui/placeholders/gene-webbed-limbs.svg',
        'fat-reserves': '/assets/game-ui/placeholders/gene-fat-reserves.svg',
    } as const,
} as const

export function getGeneAssetOrFallback(geneKey: GeneAssetKey): string {
    return GAME_SELECTION_ASSETS.genes[geneKey] ?? GAME_SELECTION_ASSETS.gene
}

const TRAIT_ASSET_KEYS: Record<TraitType, GeneAssetKey> = {
    STRENGTH: 'strength',
    RESISTANCE: 'resistance',
    AGILITY: 'agility',
    PERCEPTION: 'perception',
    METABOLISM: 'metabolism',
    ADAPTATION: 'adaptation',
    GRIP_CLAWS: 'grip-claws',
    CAMOUFLAGE: 'camouflage',
    WEBBED_LIMBS: 'webbed-limbs',
    FAT_RESERVES: 'fat-reserves',
}

export function getGeneAssetByTrait(traitType: TraitType): string {
    return getGeneAssetOrFallback(TRAIT_ASSET_KEYS[traitType])
}

export function getEventAssetByArtKey(_artKey: string): string {
    return GAME_SELECTION_ASSETS.environment
}
