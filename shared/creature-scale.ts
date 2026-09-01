/** Canonical biological height used when legacy data does not carry one. */
export const DEFAULT_CREATURE_HEIGHT_METERS = 1.4

const STARTER_HEIGHT_METERS: Readonly<Record<string, number>> = {
    VERDANT_HATCHLING: DEFAULT_CREATURE_HEIGHT_METERS,
    AMETHYST_HATCHLING: DEFAULT_CREATURE_HEIGHT_METERS,
}

function isValidHeightMeters(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Resolves persisted and legacy heights in one place. Starter keys retain their canonical
 * biological height; all other malformed or missing data uses the neutral reference height.
 */
export function resolveCreatureHeightMeters(heightMeters: unknown, baseCreatureKey?: unknown): number {
    if (isValidHeightMeters(heightMeters)) {
        return heightMeters
    }

    const starterHeight = typeof baseCreatureKey === 'string'
        ? STARTER_HEIGHT_METERS[baseCreatureKey.trim().toUpperCase()]
        : undefined

    return starterHeight ?? DEFAULT_CREATURE_HEIGHT_METERS
}

/** Maps a creature's real biological height to the bounded battle-stage scale. */
export function getCreatureBattleScale(heightMeters: number): number {
    const referenceHeight = DEFAULT_CREATURE_HEIGHT_METERS
    const safeHeightMeters = resolveCreatureHeightMeters(heightMeters)

    return Math.min(
        1.35,
        Math.max(
            0.72,
            0.72 + 0.28 * Math.sqrt(safeHeightMeters / referenceHeight),
        ),
    )
}
