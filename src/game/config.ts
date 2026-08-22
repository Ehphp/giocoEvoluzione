import {
    ADAPTATION_CATALOG,
    BASE_USE_VALUE as SHARED_BASE_USE_VALUE,
    LEVEL_BONUS as SHARED_LEVEL_BONUS,
    MAX_ADAPTATION_LEVEL as SHARED_MAX_ADAPTATION_LEVEL,
    TOTAL_ROUNDS as SHARED_TOTAL_ROUNDS,
} from '../../shared/game-rules/catalog.ts'
import {
    createInitialAdaptations,
    generateRoundEventSequence,
    getAdaptationLabel,
    normalizeAdaptationCollection,
} from '../../shared/game-rules/state.ts'
import { ADAPTATION_IDS, type AdaptationCollection, type AdaptationId } from '../../shared/game-rules/types.ts'
export const TRAITS = ADAPTATION_IDS
export const TOTAL_ROUNDS = SHARED_TOTAL_ROUNDS
export const FINAL_ROUND_NUMBER = TOTAL_ROUNDS
export const BASE_USE_VALUE = SHARED_BASE_USE_VALUE
export const MAX_TRAIT_LEVEL = SHARED_MAX_ADAPTATION_LEVEL
export const LEVEL_BONUS = SHARED_LEVEL_BONUS
export const ROOM_CODE_LENGTH = 5
export const TRAIT_LABELS: Record<AdaptationId, string> = Object.fromEntries(
    ADAPTATION_IDS.map((adaptation) => [adaptation, getAdaptationLabel(adaptation)]),
) as Record<AdaptationId, string>
export function createInitialTraits(): AdaptationCollection {
    return createInitialAdaptations()
}
export { generateRoundEventSequence }
export function normalizeTraitCollection(
    value: Partial<Record<AdaptationId, { level?: unknown; exhausted?: unknown }>> | null | undefined,
): AdaptationCollection {
    return normalizeAdaptationCollection(value)
}
export { ADAPTATION_CATALOG as TRAIT_CATALOG }
