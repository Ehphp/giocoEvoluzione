/**
 * Asset manifest.
 *
 * Every image the UI renders is addressed from here, so swapping artwork is a one-file change
 * and nothing hard-codes a path. Files live under `public/assets/`:
 *
 *   branding/      logo and brand marks
 *   battle/        arena backgrounds and creature sprites
 *   creatures/     base creature art
 *   game-ui/       interface art: gene glyphs, biome thumbnails, placeholders
 *
 * Paths are absolute so they resolve identically from any route.
 */

const DEFAULT_CREATURE_IMAGE = '/assets/battle/creatures/verdant-hatchling.png'

export const ASSETS = {
    branding: {
        logo: '/assets/branding/evori-logo.png',
    },

    /** Painted backdrop behind every screen, keyed by scene. */
    scenery: {
        forest: '/assets/battle/backgrounds/enchanted-forest.png',
        fallback: '/assets/game-ui/placeholders/background.svg',
    },

    creatures: {
        default: DEFAULT_CREATURE_IMAGE,
        player: DEFAULT_CREATURE_IMAGE,
        opponent: '/assets/battle/creatures/newCreaturaViola.png',
        base: DEFAULT_CREATURE_IMAGE,
    },

    /** Fallbacks used when a signed or generated asset is unavailable. */
    placeholders: {
        playerAvatar: '/assets/game-ui/placeholders/player-avatar.svg',
        opponentAvatar: '/assets/game-ui/placeholders/opponent-avatar.svg',
        environment: '/assets/game-ui/placeholders/environment.svg',
        gene: '/assets/game-ui/placeholders/gene.svg',
    },

    /** Gene glyph artwork, keyed by the catalogue asset key. */
    genes: {
        resilience: '/assets/game-ui/genes/gene-resilience.svg',
        mobility: '/assets/game-ui/genes/gene-mobility.svg',
        senses: '/assets/game-ui/genes/gene-senses.svg',
        metabolism: '/assets/game-ui/genes/gene-metabolism.svg',
        aquatic: '/assets/game-ui/genes/gene-aquatic.svg',
    },

    /** Biome thumbnails, keyed by the environmental-crisis art key. */
    environments: {
        'event-volcanic-ash-wave': '/assets/game-ui/environments/volcanic-ash-wave.svg',
        'event-prolonged-eclipse': '/assets/game-ui/environments/prolonged-eclipse.svg',
        'event-predator-pack-migration': '/assets/game-ui/environments/predator-pack-migration.svg',
        'event-heat-spike': '/assets/game-ui/environments/heat-spike.svg',
        'event-nutrient-collapse': '/assets/game-ui/environments/nutrient-collapse.svg',
        'event-flash-flood': '/assets/game-ui/environments/flash-flood.svg',
    } as Record<string, string>,
} as const

export function fallbackToDefaultCreatureImage(image: HTMLImageElement): void {
    if (image.getAttribute('src') !== ASSETS.creatures.default) {
        image.setAttribute('src', ASSETS.creatures.default)
    }
}

export function withResolvedCreatureImage<T extends { signedUrl: string, versionNumber?: number, isBaseVersion?: boolean }>(visual: T): T {
    if (visual.isBaseVersion !== true && visual.versionNumber !== 1) return visual
    return { ...visual, signedUrl: ASSETS.creatures.default }
}

export type GeneAssetKey = keyof typeof ASSETS.genes
