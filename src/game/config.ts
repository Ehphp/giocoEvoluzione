import { ENVIRONMENTS, TRAITS, type Environment, type TraitCollection, type TraitType } from './types'
import { TRAIT_CATALOG } from './traits-catalog'

export const TOTAL_ROUNDS = 6
export const FINAL_ROUND_NUMBER = 6
export const FINAL_ROUND_POINTS = 2
export const DEFAULT_ROUND_POINTS = 1
export const ENVIRONMENT_WEIGHT = 2
export const MAX_EFFECTIVE_TRAIT_LEVEL = 5
export const ROOM_CODE_LENGTH = 5

export const TRAIT_LABELS: Record<TraitType, string> = TRAITS.reduce((labels, trait) => {
    labels[trait] = TRAIT_CATALOG[trait].label

    return labels
}, {} as Record<TraitType, string>)

export const ENVIRONMENT_MODIFIERS: Record<Environment, Record<TraitType, number>> = ENVIRONMENTS.reduce((matrix, environment) => {
    matrix[environment] = TRAITS.reduce((row, trait) => {
        row[trait] = TRAIT_CATALOG[trait].modifiers[environment]

        return row
    }, {} as Record<TraitType, number>)

    return matrix
}, {} as Record<Environment, Record<TraitType, number>>)

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

export function generateEnvironmentSequence(random = Math.random): Environment[] {
    return Array.from({ length: TOTAL_ROUNDS }, () => {
        const index = Math.floor(random() * ENVIRONMENTS.length)

        return ENVIRONMENTS[index] ?? ENVIRONMENTS[0]
    })
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