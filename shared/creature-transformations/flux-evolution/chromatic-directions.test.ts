import { describe, expect, it } from 'vitest'

import {
    CHROMATIC_DIRECTION_BY_ID,
    CHROMATIC_DIRECTION_IDS,
    CHROMATIC_DIRECTIONS,
    resolveChromaticDirection,
} from './chromatic-directions.ts'

describe('chromatic directions', () => {
    it('defines one complete Skin-only catalogue without anatomical, biome or optical-effect concepts', () => {
        expect(CHROMATIC_DIRECTION_IDS).toHaveLength(8)
        expect(CHROMATIC_DIRECTIONS.map((direction) => direction.id)).toEqual([...CHROMATIC_DIRECTION_IDS])
        expect(Object.keys(CHROMATIC_DIRECTION_BY_ID)).toEqual([...CHROMATIC_DIRECTION_IDS])

        const catalogueText = CHROMATIC_DIRECTIONS
            .flatMap((direction) => [direction.id, direction.description])
            .join(' ')
        expect(catalogueText).not.toMatch(
            /\b(?:anatomy|limb|tail|wing|fin|spine|horn|crest|scale|shell|fur|feather|biome|habitat|marine|aquatic|water|iridescen\w*|translucen\w*|bioluminescen\w*|sheen)\b/i,
        )
    })

    it('resolves the same Skin direction for the same seed', () => {
        const first = resolveChromaticDirection({ evolutionTargetId: 'SKIN_AND_COVERING', seed: 'skin-seed' })
        const repeated = resolveChromaticDirection({ evolutionTargetId: 'SKIN_AND_COVERING', seed: 'skin-seed' })

        expect(first).toEqual(repeated)
        expect(first).not.toBeNull()
    })

    it('distributes different Skin seeds across the catalogue', () => {
        const selected = new Set(
            Array.from({ length: 512 }, (_, index) =>
                resolveChromaticDirection({ evolutionTargetId: 'SKIN_AND_COVERING', seed: `chromatic-${index}` })?.id,
            ),
        )
        selected.delete(undefined)

        expect(selected).toEqual(new Set(CHROMATIC_DIRECTION_IDS))
    })

    it('does not assign a chromatic direction to non-Skin targets', () => {
        expect(resolveChromaticDirection({ evolutionTargetId: 'TAIL', seed: 'skin-seed' })).toBeNull()
        expect(resolveChromaticDirection({ evolutionTargetId: 'BODY_SHAPE', seed: 'skin-seed' })).toBeNull()
    })
})
