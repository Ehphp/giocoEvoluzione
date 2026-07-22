import { describe, expect, it } from 'vitest'

import { createInitialTraits, getDominantTrait } from './config'

describe('getDominantTrait', () => {
    it('returns BASE when all trait levels are zero', () => {
        expect(getDominantTrait(createInitialTraits())).toBe('BASE')
    })

    it('returns the only trait with the highest level', () => {
        const traits = createInitialTraits()
        traits.RESISTANCE.level = 3
        traits.STRENGTH.level = 1
        traits.AGILITY.level = 2

        expect(getDominantTrait(traits)).toBe('RESISTANCE')
    })

    it('keeps the previous dominant trait when it is still tied for the maximum level', () => {
        const traits = createInitialTraits()
        traits.STRENGTH.level = 2
        traits.RESISTANCE.level = 2
        traits.AGILITY.level = 1

        expect(getDominantTrait(traits, 'RESISTANCE')).toBe('RESISTANCE')
    })

    it('uses the deterministic fallback order when the tie has no previous dominant trait', () => {
        const traits = createInitialTraits()
        traits.STRENGTH.level = 2
        traits.RESISTANCE.level = 2
        traits.ADAPTATION.level = 2

        expect(getDominantTrait(traits)).toBe('STRENGTH')
    })

    it('ignores incomplete trait structures without crashing', () => {
        expect(getDominantTrait({ STRENGTH: { level: 4 }, RESISTANCE: null })).toBe('STRENGTH')
    })
})
