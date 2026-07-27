import { describe, expect, it } from 'vitest'

import { ROUND_EVENT_BY_ID } from '../../../../shared/game-rules/catalog'
import { buildRoundEventEffects } from './buildGeneSelectionV2ViewModel'

describe('buildRoundEventEffects', () => {
    it('keeps every bonus ahead of maluses, including modifiers above +2', () => {
        const flashFlood = ROUND_EVENT_BY_ID.FLASH_FLOOD!

        expect(buildRoundEventEffects(flashFlood, true).map((effect) => effect.modifier)).toEqual([3, 1, -1, -1])
    })
})
