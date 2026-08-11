import { describe, expect, it } from 'vitest'

import { isFluxPilotShortcutVisible } from './lab-flux-pilot-flag.ts'

describe('isFluxPilotShortcutVisible', () => {
    it('requires an explicit opt-in', () => {
        expect(isFluxPilotShortcutVisible(undefined)).toBe(false)
        expect(isFluxPilotShortcutVisible(false)).toBe(false)
        expect(isFluxPilotShortcutVisible('false')).toBe(false)
        expect(isFluxPilotShortcutVisible(true)).toBe(true)
        expect(isFluxPilotShortcutVisible('true')).toBe(true)
    })
})
