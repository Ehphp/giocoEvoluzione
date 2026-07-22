import { describe, expect, it } from 'vitest'

import { createInitialTraits, normalizeTraitCollection } from './config'
import { ROUND_EVENT_DEFINITIONS } from './round-events'
import { TRAIT_CATALOG } from './traits-catalog'
import { TRAITS, type TraitType } from './types'

describe('trait catalog integrity', () => {
    it('contains all ten traits and keeps stable IDs', () => {
        expect(TRAITS).toHaveLength(10)

        for (const trait of TRAITS) {
            expect(TRAIT_CATALOG[trait]).toBeDefined()
            expect(TRAIT_CATALOG[trait].id).toBe(trait)
        }
    })

    it('creates initial state with level 0 and cooldown 0 for every trait', () => {
        const traits = createInitialTraits()

        for (const trait of TRAITS) {
            expect(traits[trait].level).toBe(0)
            expect(traits[trait].cooldown).toBe(0)
        }
    })

    it('every trait appears in at least one round event effect', () => {
        const coveredTraits = new Set(
            ROUND_EVENT_DEFINITIONS.flatMap((eventDefinition) => eventDefinition.effects.map((effect) => effect.trait)),
        )

        for (const trait of TRAITS) {
            expect(coveredTraits.has(trait)).toBe(true)
        }
    })

    it('normalizes legacy 6-trait state without overwriting existing values', () => {
        const legacyState = {
            STRENGTH: { level: 2, cooldown: 1 },
            RESISTANCE: { level: 1, cooldown: 0 },
            AGILITY: { level: 3, cooldown: 0 },
            PERCEPTION: { level: 0, cooldown: 0 },
            METABOLISM: { level: 4, cooldown: 0 },
            ADAPTATION: { level: 2, cooldown: 1 },
        } as Partial<Record<TraitType, { level: number; cooldown: number }>>

        const normalized = normalizeTraitCollection(legacyState)

        expect(normalized.STRENGTH).toEqual({ level: 2, cooldown: 1 })
        expect(normalized.METABOLISM).toEqual({ level: 4, cooldown: 0 })
        expect(normalized.GRIP_CLAWS).toEqual({ level: 0, cooldown: 0 })
        expect(normalized.CAMOUFLAGE).toEqual({ level: 0, cooldown: 0 })
        expect(normalized.WEBBED_LIMBS).toEqual({ level: 0, cooldown: 0 })
        expect(normalized.FAT_RESERVES).toEqual({ level: 0, cooldown: 0 })
    })
})
