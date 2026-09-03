/** Canonical biological height used when legacy data does not carry one. */
export const DEFAULT_CREATURE_HEIGHT_METERS = 1.4

const STARTER_HEIGHT_METERS: Readonly<Record<string, number>> = {
    VERDANT_HATCHLING: DEFAULT_CREATURE_HEIGHT_METERS,
    AMETHYST_HATCHLING: DEFAULT_CREATURE_HEIGHT_METERS,
}

const BATTLE_BIOLOGICAL_SCALE_EXPONENT = 1.45
const MIN_BATTLE_BIOLOGICAL_SCALE = .72
const MAX_BATTLE_BIOLOGICAL_SCALE = 1.35

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

/**
 * Maps real height to an intentionally perceptible, but bounded battle-stage scale.
 *
 * Framing is normalized separately from the alpha foreground. This curve is therefore only the
 * biological distinction: 1.652m versus the 1.4m reference is approximately 1.27× on screen.
 */
export function getCreatureBattleScale(heightMeters: number): number {
    const referenceHeight = DEFAULT_CREATURE_HEIGHT_METERS
    const safeHeightMeters = resolveCreatureHeightMeters(heightMeters)

    return Math.min(
        MAX_BATTLE_BIOLOGICAL_SCALE,
        Math.max(
            MIN_BATTLE_BIOLOGICAL_SCALE,
            Math.pow(safeHeightMeters / referenceHeight, BATTLE_BIOLOGICAL_SCALE_EXPONENT),
        ),
    )
}
