import { describe, expect, it } from 'vitest'

import { createInitialTraits } from './config'
import { getTraitRoundValue, resolveRound } from './engine'

describe('scoring with expanded trait catalog', () => {
    it('modifier 3 and level 0 gives value 6', () => {
        const traits = createInitialTraits()

        expect(getTraitRoundValue('FOREST', traits, 'AGILITY')).toBe(6)
    })

    it('modifier 0 and level 5 gives value 5', () => {
        const traits = createInitialTraits()
        traits.STRENGTH.level = 5

        expect(getTraitRoundValue('SWAMP', traits, 'STRENGTH')).toBe(5)
    })

    it('modifier 0 level 5 does not beat modifier 3 level 0', () => {
        const p1 = createInitialTraits()
        const p2 = createInitialTraits()
        p1.STRENGTH.level = 5

        const result = resolveRound({
            roundNumber: 1,
            environment: 'SWAMP',
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: p1,
            player2Traits: p2,
            player1Action: { playerId: 'p1', trait: 'STRENGTH', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'METABOLISM', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(5)
        expect(result.player2.roundValue).toBe(6)
        expect(result.winnerId).toBe('p2')
    })

    it('a one-point lower environment gene needs at least three levels advantage to win', () => {
        const low = createInitialTraits()
        const high = createInitialTraits()

        low.ADAPTATION.level = 2
        let result = resolveRound({
            roundNumber: 1,
            environment: 'SWAMP',
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: low,
            player2Traits: high,
            player1Action: { playerId: 'p1', trait: 'ADAPTATION', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'METABOLISM', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(6)
        expect(result.player2.roundValue).toBe(6)
        expect(result.winnerId).toBeNull()

        low.ADAPTATION.level = 3
        result = resolveRound({
            roundNumber: 1,
            environment: 'SWAMP',
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: low,
            player2Traits: high,
            player1Action: { playerId: 'p1', trait: 'ADAPTATION', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'METABOLISM', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(7)
        expect(result.player2.roundValue).toBe(6)
        expect(result.winnerId).toBe('p1')
    })

    it('a two-point lower environment gene needs at least five levels advantage to win', () => {
        const low = createInitialTraits()
        const high = createInitialTraits()

        low.ADAPTATION.level = 4
        let result = resolveRound({
            roundNumber: 1,
            environment: 'MOUNTAIN',
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: low,
            player2Traits: high,
            player1Action: { playerId: 'p1', trait: 'ADAPTATION', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'RESISTANCE', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(6)
        expect(result.player2.roundValue).toBe(6)
        expect(result.winnerId).toBeNull()

        low.ADAPTATION.level = 5
        result = resolveRound({
            roundNumber: 1,
            environment: 'MOUNTAIN',
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: low,
            player2Traits: high,
            player1Action: { playerId: 'p1', trait: 'ADAPTATION', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'RESISTANCE', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(7)
        expect(result.player2.roundValue).toBe(6)
        expect(result.winnerId).toBe('p1')
    })

    it('level 6 has the same effective contribution as level 5', () => {
        const five = createInitialTraits()
        const six = createInitialTraits()

        five.CAMOUFLAGE.level = 5
        six.CAMOUFLAGE.level = 6

        expect(getTraitRoundValue('FOREST', five, 'CAMOUFLAGE')).toBe(11)
        expect(getTraitRoundValue('FOREST', six, 'CAMOUFLAGE')).toBe(11)
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

        expect(() => getTraitRoundValue('FOREST', nanTraits, 'CAMOUFLAGE')).toThrow(/invalid trait state/i)
        expect(() => getTraitRoundValue('FOREST', undefinedTraits, 'CAMOUFLAGE')).toThrow(/invalid trait state/i)
        expect(() => getTraitRoundValue('FOREST', infTraits, 'CAMOUFLAGE')).toThrow(/invalid trait state/i)
        expect(() => getTraitRoundValue('FOREST', negativeTraits, 'CAMOUFLAGE')).toThrow(/invalid trait state/i)
    })

    it('computes round values correctly for the four new traits', () => {
        const traits = createInitialTraits()

        expect(getTraitRoundValue('MOUNTAIN', traits, 'GRIP_CLAWS')).toBe(6)
        expect(getTraitRoundValue('FOREST', traits, 'CAMOUFLAGE')).toBe(6)
        expect(getTraitRoundValue('SWAMP', traits, 'WEBBED_LIMBS')).toBe(6)
        expect(getTraitRoundValue('MOUNTAIN', traits, 'FAT_RESERVES')).toBe(4)
    })
})
