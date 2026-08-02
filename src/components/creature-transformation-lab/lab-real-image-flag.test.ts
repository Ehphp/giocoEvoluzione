import { describe, expect, it } from 'vitest'

import { isRealImageExperimentVisible } from './lab-real-image-flag.ts'

describe('real image laboratory frontend flag', () => {
    it('keeps the paid pilot hidden unless the non-sensitive flag is explicitly true', () => {
        expect(isRealImageExperimentVisible(undefined)).toBe(false)
        expect(isRealImageExperimentVisible(false)).toBe(false)
        expect(isRealImageExperimentVisible('false')).toBe(false)
        expect(isRealImageExperimentVisible('true')).toBe(true)
    })
})
