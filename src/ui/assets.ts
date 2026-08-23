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
 *
 * **The rasters here are generated, not authored.** `public/` is copied verbatim by Vite, so the
 * masters live in `assets-source/` and `npm run assets:optimize` writes the WebP derivatives that
 * ship. Editing a path below without a matching spec in `tools/optimize-assets.ts` points the app at
 * a file nobody produces; `npm run assets:check` catches the mismatch in either direction.
 */

const DEFAULT_CREATURE_IMAGE = '/assets/battle/creatures/verdant-hatchling.webp'

export const ASSETS = {
    branding: {
        logo: '/assets/branding/evori-logo.webp',
    },

    /** Painted backdrop behind every screen, keyed by scene. */
    scenery: {
        forest: '/assets/battle/backgrounds/enchanted-forest.webp',
        fallback: '/assets/game-ui/placeholders/background.svg',
    },

    creatures: {
        default: DEFAULT_CREATURE_IMAGE,
        player: DEFAULT_CREATURE_IMAGE,
        opponent: '/assets/battle/creatures/amethyst-hatchling.webp',
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

/**
 * Width-descriptor candidates for the rasters that have more than one size, keyed by the `src` in
 * `ASSETS`. Mirrors the widths in `tools/optimize-assets.ts`; `assets:check` keeps the files honest.
 *
 * Keyed by URL rather than exposed as an object per asset, because a `src` reaches a component
 * through several hands — `GAME_SELECTION_ASSETS`, a view model's `background`, a signed Supabase
 * URL — and only some of those are ours. A lookup answers for the ones that are and shrugs at the
 * rest, which is what lets `AppShell` serve every screen's scenery responsively without a single
 * call site knowing about it.
 */
const SRC_SETS: Readonly<Record<string, string>> = {
    '/assets/branding/evori-logo.webp': [
        '/assets/branding/evori-logo-300w.webp 300w',
        '/assets/branding/evori-logo-600w.webp 600w',
        '/assets/branding/evori-logo.webp 900w',
    ].join(', '),

    '/assets/battle/backgrounds/enchanted-forest.webp': [
        '/assets/battle/backgrounds/enchanted-forest-720w.webp 720w',
        '/assets/battle/backgrounds/enchanted-forest.webp 941w',
    ].join(', '),

    '/assets/battle/creatures/verdant-hatchling.webp': [
        '/assets/battle/creatures/verdant-hatchling-250w.webp 250w',
        '/assets/battle/creatures/verdant-hatchling.webp 500w',
    ].join(', '),

    '/assets/battle/creatures/amethyst-hatchling.webp': [
        '/assets/battle/creatures/amethyst-hatchling-250w.webp 250w',
        '/assets/battle/creatures/amethyst-hatchling.webp 500w',
    ].join(', '),
}

/**
 * The candidate set for a `src`, or `undefined` where there is nothing to choose from — an SVG, or a
 * signed URL from the transformation pipeline. Safe to spread onto any `<img>`.
 *
 * A `srcSet` is only half the instruction: without `sizes` the browser assumes the image fills the
 * viewport and fetches the widest candidate. Pass `sizes` wherever that is not true.
 */
export function srcSetFor(src: string | null | undefined): string | undefined {
    return src ? SRC_SETS[src] : undefined
}

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
