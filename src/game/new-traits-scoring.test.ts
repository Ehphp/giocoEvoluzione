import { describe, expect, it } from 'vitest'

import { createInitialTraits } from './config'
import { getTraitRoundValue, resolveRound } from './engine'
import { getRoundEventById } from './round-events'

describe('scoring with expanded trait catalog', () => {
    const flood = getRoundEventById('FLASH_FLOOD')
    const heat = getRoundEventById('HEAT_SPIKE')
    const predators = getRoundEventById('PREDATOR_PACK_MIGRATION')

    it('positive event modifier and level 0 gives weighted value', () => {
        const traits = createInitialTraits()

        expect(getTraitRoundValue(flood, traits, 'WEBBED_LIMBS')).toBe(4)
    })

    it('negative event modifier with high level remains valid', () => {
        const traits = createInitialTraits()
        traits.STRENGTH.level = 5

        expect(getTraitRoundValue(flood, traits, 'STRENGTH')).toBe(3)
    })

    it('high level on neutral trait can beat favored trait', () => {
        const p1 = createInitialTraits()
        const p2 = createInitialTraits()
        p1.STRENGTH.level = 5

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

        expect(result.player1.roundValue).toBe(5)
        expect(result.player2.roundValue).toBe(4)
        expect(result.winnerId).toBe('p1')
    })

    it('level advantage can recover a one-point event deficit', () => {
        const low = createInitialTraits()
        const high = createInitialTraits()

        low.FAT_RESERVES.level = 4
        let result = resolveRound({
            roundNumber: 1,
            roundEvent: predators,
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: low,
            player2Traits: high,
            player1Action: { playerId: 'p1', trait: 'FAT_RESERVES', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'STRENGTH', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(2)
        expect(result.player2.roundValue).toBe(0)
        expect(result.winnerId).toBe('p1')

        low.FAT_RESERVES.level = 0
        result = resolveRound({
            roundNumber: 1,
            roundEvent: predators,
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: low,
            player2Traits: high,
            player1Action: { playerId: 'p1', trait: 'FAT_RESERVES', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'STRENGTH', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(-2)
        expect(result.player2.roundValue).toBe(0)
        expect(result.winnerId).toBe('p2')
    })

    it('level 6 has the same effective contribution as level 5', () => {
        const five = createInitialTraits()
        const six = createInitialTraits()

        five.CAMOUFLAGE.level = 5
        six.CAMOUFLAGE.level = 6

        expect(getTraitRoundValue(predators, five, 'CAMOUFLAGE')).toBe(9)
        expect(getTraitRoundValue(predators, six, 'CAMOUFLAGE')).toBe(9)
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
