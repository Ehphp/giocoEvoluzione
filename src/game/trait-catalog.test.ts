import { describe, expect, it } from 'vitest'

import { createInitialTraits, ENVIRONMENT_MODIFIERS, normalizeTraitCollection } from './config'
import { TRAIT_CATALOG } from './traits-catalog'
import { ENVIRONMENTS, TRAITS, type TraitType } from './types'

describe('trait catalog integrity', () => {
    it('contains all ten traits and keeps legacy IDs', () => {
        expect(TRAITS).toHaveLength(10)
        expect(TRAITS).toEqual([
            'STRENGTH',
            'RESISTANCE',
            'AGILITY',
            'PERCEPTION',
            'METABOLISM',
            'ADAPTATION',
            'GRIP_CLAWS',
            'CAMOUFLAGE',
            'WEBBED_LIMBS',
            'FAT_RESERVES',
        ])

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

    it('has a value for each environment and every value is in [0, 3]', () => {
        for (const trait of TRAITS) {
            for (const environment of ENVIRONMENTS) {
                const value = ENVIRONMENT_MODIFIERS[environment][trait]
                expect(Number.isInteger(value)).toBe(true)
                expect(value).toBeGreaterThanOrEqual(0)
                expect(value).toBeLessThanOrEqual(3)
            }
        }
    })

    it('keeps affinity sum equal to 4 for each trait', () => {
        for (const trait of TRAITS) {
            const sum = ENVIRONMENTS.reduce((total, environment) => total + ENVIRONMENT_MODIFIERS[environment][trait], 0)
            expect(sum).toBe(4)
        }
    })

    it('has no duplicate affinity profile across genes', () => {
        const profiles = TRAITS.map((trait) => ({
            trait,
            profile: ENVIRONMENTS.map((environment) => ENVIRONMENT_MODIFIERS[environment][trait]).join(','),
        }))

        const uniqueProfiles = new Set(profiles.map((entry) => entry.profile))

        expect(uniqueProfiles.size).toBe(profiles.length)
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
