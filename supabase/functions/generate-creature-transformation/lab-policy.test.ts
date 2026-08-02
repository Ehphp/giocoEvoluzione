import { describe, expect, it } from 'vitest'

import { readCreatureTransformationLabPolicy } from './lab-policy.ts'

describe('creature transformation lab policy', () => {
    it('is disabled by default and reads only explicitly allowed concept modes', () => {
        const policy = readCreatureTransformationLabPolicy(() => undefined)

        expect(policy.enabled).toBe(false)
        expect(policy.allowedConceptModes.size).toBe(0)
    })

    it('parses the development policy without trusting client input', () => {
        const policy = readCreatureTransformationLabPolicy((name) => ({
            CREATURE_TRANSFORMATION_LAB_ENABLED: 'true',
            CREATURE_TRANSFORMATION_ALLOWED_CONCEPT_MODES: 'MOCK, AI, invalid',
        })[name])

        expect(policy.enabled).toBe(true)
        expect(policy.allowedConceptModes).toEqual(new Set(['MOCK', 'AI']))
    })
})

