import { describe, expect, it } from 'vitest'

import battleStyles from './BattleScreen.css?raw'

describe('battle interaction contract', () => {
    it('keeps transformed creature artwork out of pointer hit testing', () => {
        expect(battleStyles).toMatch(/\.arena__creature\s*{[^}]*pointer-events:\s*none;/s)
    })
})
