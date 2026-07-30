import { describe, expect, it } from 'vitest'

import { ROUND_EVENT_BY_ID } from '../../../../shared/game-rules/catalog'
import { buildRoundEventEffects } from './buildGeneSelectionV2ViewModel'

describe('buildRoundEventEffects', () => {
    it('shows all five affinities using only the 0-1-2 scale', () => {
        const flashFlood = ROUND_EVENT_BY_ID.FLASH_FLOOD!

        expect(buildRoundEventEffects(flashFlood, true).map((effect) => effect.modifier)).toEqual([2, 1, 1, 0, 0])
        expect(buildRoundEventEffects(flashFlood, true).map((effect) => effect.value)).toEqual(expect.arrayContaining(['Ideale · Mimetismo', 'Adatto · Agilita', 'Sfavorevole · Ferocia']))
    })
})
