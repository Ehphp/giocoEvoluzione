import { TRAITS, type TraitCollection, type TraitType } from './types'
import { TRAIT_CATALOG } from './traits-catalog'
import { generateRoundEventSequence as generateRoundEventSequenceFromCatalog, ROUND_EVENT_WEIGHT } from './round-events'

export const TOTAL_ROUNDS = 6
export const FINAL_ROUND_NUMBER = 6
export const FINAL_ROUND_POINTS = 2
export const DEFAULT_ROUND_POINTS = 1
export const EVENT_WEIGHT = ROUND_EVENT_WEIGHT
export const MAX_EFFECTIVE_TRAIT_LEVEL = 5
export const ROOM_CODE_LENGTH = 5

export const TRAIT_LABELS: Record<TraitType, string> = TRAITS.reduce((labels, trait) => {
    labels[trait] = TRAIT_CATALOG[trait].label

    return labels
}, {} as Record<TraitType, string>)

export const CREATURE_ASSETS = {
    BASE: '/assets/creatures/base.png',
    STRENGTH: '/assets/creatures/strength.png',
    RESISTANCE: '/assets/creatures/resistance.png',
    AGILITY: '/assets/creatures/agility.png',
    PERCEPTION: '/assets/creatures/perception.png',
    METABOLISM: '/assets/creatures/metabolism.png',
    ADAPTATION: '/assets/creatures/adaptation.png',
    GRIP_CLAWS: '/assets/creatures/grip_claws.png',
    CAMOUFLAGE: '/assets/creatures/camouflage.png',
    WEBBED_LIMBS: '/assets/creatures/webbed_limbs.png',
    FAT_RESERVES: '/assets/creatures/fat_reserves.png',
} as const

export type DominantTrait = TraitType | 'BASE'

type TraitLevels = Partial<Record<TraitType, { level?: number } | null | undefined>>

function getTraitLevel(state: { level?: number } | null | undefined): number {
    return typeof state?.level === 'number' && Number.isFinite(state.level) ? state.level : 0
}

export function getDominantTrait(traits: TraitLevels | null | undefined, previousDominantTrait?: DominantTrait): DominantTrait {
    const traitEntries = TRAITS.map((trait) => ({
        trait,
        level: getTraitLevel(traits?.[trait]),
    }))
    const maxLevel = traitEntries.reduce((currentMax, entry) => Math.max(currentMax, entry.level), 0)

    if (maxLevel <= 0) {
        return 'BASE'
    }

    const candidates = traitEntries.filter((entry) => entry.level === maxLevel).map((entry) => entry.trait)

    if (candidates.length === 1) {
        return candidates[0] ?? 'BASE'
    }

    if (previousDominantTrait && previousDominantTrait !== 'BASE' && candidates.includes(previousDominantTrait)) {
        return previousDominantTrait
    }

    // Deterministic fallback order for ties.
    return TRAITS.find((trait) => candidates.includes(trait)) ?? 'BASE'
}

export function createInitialTraits(): TraitCollection {
    return TRAITS.reduce<TraitCollection>((collection, trait) => {
        collection[trait] = {
            level: 0,
            cooldown: 0,
        }

        return collection
    }, {} as TraitCollection)
}

export function generateRoundEventSequence(random = Math.random): string[] {
    return generateRoundEventSequenceFromCatalog(TOTAL_ROUNDS, random)
}

type PartialTraitCollection = Partial<Record<TraitType, { level?: unknown; cooldown?: unknown } | null | undefined>>

export function normalizeTraitCollection(traits: PartialTraitCollection | null | undefined): TraitCollection {
    const normalized = createInitialTraits()

    if (!traits) {
        return normalized
    }

    for (const trait of TRAITS) {
        const state = traits[trait]

        if (!state) {
            continue
        }

        if (typeof state.level === 'number') {
            normalized[trait].level = state.level
        }

        if (typeof state.cooldown === 'number') {
            normalized[trait].cooldown = state.cooldown
        }
    }

    return normalized
}