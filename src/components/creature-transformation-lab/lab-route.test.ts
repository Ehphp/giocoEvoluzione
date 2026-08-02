import { describe, expect, it } from 'vitest'

import { canShowCreatureTransformationLab, CREATURE_TRANSFORMATION_LAB_HASH } from './lab-route'

describe('creature transformation laboratory route', () => {
    it('remains hidden without the explicit frontend flag or an authenticated creature', () => {
        expect(canShowCreatureTransformationLab({ enabled: false, hasAuthenticatedCreature: true, hash: CREATURE_TRANSFORMATION_LAB_HASH })).toBe(false)
        expect(canShowCreatureTransformationLab({ enabled: true, hasAuthenticatedCreature: false, hash: CREATURE_TRANSFORMATION_LAB_HASH })).toBe(false)
    })

    it('allows only the controlled technical hash for an authenticated creature', () => {
        expect(canShowCreatureTransformationLab({ enabled: true, hasAuthenticatedCreature: true, hash: CREATURE_TRANSFORMATION_LAB_HASH })).toBe(true)
        expect(canShowCreatureTransformationLab({ enabled: true, hasAuthenticatedCreature: true, hash: '#profile' })).toBe(false)
    })
})
