import { describe, expect, it } from 'vitest'

import { createInitialTraits } from './config'
import { getTraitRoundValue, resolveRound } from './engine'
import { getRoundEventById } from './round-events'

describe('scoring with expanded trait catalog', () => {
    const flood = getRoundEventById('FLASH_FLOOD')
    const heat = getRoundEventById('HEAT_SPIKE')
    const predators = getRoundEventById('PREDATOR_PACK_MIGRATION')

    it('positive +2 event modifier and level 0 gives value 3', () => {
        const traits = createInitialTraits()

        expect(getTraitRoundValue(flood, traits, 'GRIP_CLAWS')).toBe(3)
    })

    it('negative event modifier with high level remains valid', () => {
        const traits = createInitialTraits()
        traits.AGILITY.level = 3

        expect(getTraitRoundValue(flood, traits, 'AGILITY')).toBe(3)
    })

    it('high level on neutral trait can beat favored trait', () => {
        const p1 = createInitialTraits()
        const p2 = createInitialTraits()
        p1.STRENGTH.level = 3

        const result = resolveRound({
            roundNumber: 1,
            roundEvent: heat,
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: p1,
            player2Traits: p2,
            player1Action: { playerId: 'p1', trait: 'STRENGTH', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'METABOLISM', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(4)
        expect(result.player2.roundValue).toBe(3)
        expect(result.winnerId).toBe('p1')
    })

    it('one level recovers the gap between a +1 secondary and a +2 primary', () => {
        const secondary = createInitialTraits()
        const primary = createInitialTraits()

        secondary.CAMOUFLAGE.level = 1
        let result = resolveRound({
            roundNumber: 1,
            roundEvent: predators,
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: secondary,
            player2Traits: primary,
            player1Action: { playerId: 'p1', trait: 'CAMOUFLAGE', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'STRENGTH', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(3)
        expect(result.player2.roundValue).toBe(3)
        expect(result.winnerId).toBeNull()

        secondary.CAMOUFLAGE.level = 2
        result = resolveRound({
            roundNumber: 1,
            roundEvent: predators,
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: secondary,
            player2Traits: primary,
            player1Action: { playerId: 'p1', trait: 'CAMOUFLAGE', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'STRENGTH', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(4)
        expect(result.player2.roundValue).toBe(3)
        expect(result.winnerId).toBe('p1')
    })

    it('legacy level 6 has the same effective contribution as level 3', () => {
        const three = createInitialTraits()
        const six = createInitialTraits()

        three.CAMOUFLAGE.level = 3
        six.CAMOUFLAGE.level = 6

        expect(getTraitRoundValue(predators, three, 'CAMOUFLAGE')).toBe(5)
        expect(getTraitRoundValue(predators, six, 'CAMOUFLAGE')).toBe(5)
    })

    it('invalid level values are rejected (NaN, undefined, Infinity, negative)', () => {
        const nanTraits = createInitialTraits()
        nanTraits.CAMOUFLAGE.level = Number.NaN

        const undefinedTraits = createInitialTraits()
        undefinedTraits.CAMOUFLAGE.level = undefined as unknown as number

        const infTraits = createInitialTraits()
        infTraits.CAMOUFLAGE.level = Number.POSITIVE_INFINITY

        const negativeTraits = createInitialTraits()
        negativeTraits.CAMOUFLAGE.level = -1

        expect(() => getTraitRoundValue(predators, nanTraits, 'CAMOUFLAGE')).toThrow(/invalid trait state/i)
        expect(() => getTraitRoundValue(predators, undefinedTraits, 'CAMOUFLAGE')).toThrow(/invalid trait state/i)
        expect(() => getTraitRoundValue(predators, infTraits, 'CAMOUFLAGE')).toThrow(/invalid trait state/i)
        expect(() => getTraitRoundValue(predators, negativeTraits, 'CAMOUFLAGE')).toThrow(/invalid trait state/i)
    })
})
