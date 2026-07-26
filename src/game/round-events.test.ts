import { describe, expect, it } from 'vitest'

import { TOTAL_ROUNDS } from './config'
import {
    generateRoundEventSequence,
    getRoundEventById,
    getRoundEventForRound,
    ROUND_EVENT_DEFINITIONS,
} from './round-events'
import { TRAITS } from './types'

function makeDeterministicRandom(seed = 42): () => number {
    let state = seed >>> 0

    return () => {
        state = (1664525 * state + 1013904223) >>> 0

        return state / 0x100000000
    }
}

describe('round event deck', () => {
    it('generates enough events for all rounds', () => {
        const sequence = generateRoundEventSequence()

        expect(sequence.length).toBe(TOTAL_ROUNDS)
    })

    it('avoids duplicates when rounds do not exceed catalog size', () => {
        const sequence = generateRoundEventSequence()
        const unique = new Set(sequence)

        expect(unique.size).toBe(sequence.length)
    })

    it('is deterministic with a deterministic random source', () => {
        const randomA = makeDeterministicRandom(7)
        const randomB = makeDeterministicRandom(7)

        const sequenceA = generateRoundEventSequence(TOTAL_ROUNDS, randomA)
        const sequenceB = generateRoundEventSequence(TOTAL_ROUNDS, randomB)

        expect(sequenceA).toEqual(sequenceB)
    })

    it('maps each generated event id to a known event definition', () => {
        const sequence = generateRoundEventSequence(TOTAL_ROUNDS, makeDeterministicRandom(11))

        for (const eventId of sequence) {
            const eventDefinition = getRoundEventById(eventId)
            expect(eventDefinition.id).toBe(eventId)
        }
    })

    it('includes placeholder catalog entries sufficient to finish one match', () => {
        expect(ROUND_EVENT_DEFINITIONS.length).toBeGreaterThanOrEqual(TOTAL_ROUNDS)
    })

    it('resolves the correct event for each round number', () => {
        const sequence = [
            'VOLCANIC_ASH_WAVE',
            'PROLONGED_ECLIPSE',
            'PREDATOR_PACK_MIGRATION',
            'HEAT_SPIKE',
            'NUTRIENT_COLLAPSE',
            'FLASH_FLOOD',
        ]

        expect(getRoundEventForRound(sequence, 1)?.id).toBe('VOLCANIC_ASH_WAVE')
        expect(getRoundEventForRound(sequence, 2)?.id).toBe('PROLONGED_ECLIPSE')
        expect(getRoundEventForRound(sequence, 6)?.id).toBe('FLASH_FLOOD')
    })

    it('keeps same event after reconnect when sequence and round are unchanged', () => {
        const sequence = generateRoundEventSequence(TOTAL_ROUNDS, makeDeterministicRandom(21))

        const beforeReconnect = getRoundEventForRound(sequence, 3)
        const afterReconnect = getRoundEventForRound(sequence, 3)

        expect(beforeReconnect?.id).toBe(afterReconnect?.id)
    })

    it('returns the same event for both players in the same round', () => {
        const sequence = generateRoundEventSequence(TOTAL_ROUNDS, makeDeterministicRandom(33))

        const playerOneView = getRoundEventForRound(sequence, 4)
        const playerTwoView = getRoundEventForRound(sequence, 4)

        expect(playerOneView?.id).toBe(playerTwoView?.id)
    })

    it('keeps stable event and trait IDs with the controlled affinity matrix', () => {
        const expectedMatrix = {
            VOLCANIC_ASH_WAVE: [
                ['RESISTANCE', 2],
                ['FAT_RESERVES', 1],
                ['PERCEPTION', -1],
            ],
            PROLONGED_ECLIPSE: [
                ['PERCEPTION', 2],
                ['CAMOUFLAGE', 1],
                ['METABOLISM', -1],
            ],
            PREDATOR_PACK_MIGRATION: [
                ['AGILITY', 2],
                ['CAMOUFLAGE', 1],
                ['STRENGTH', 1],
                ['FAT_RESERVES', -1],
            ],
            HEAT_SPIKE: [
                ['METABOLISM', 2],
                ['WEBBED_LIMBS', 1],
                ['FAT_RESERVES', -1],
            ],
            NUTRIENT_COLLAPSE: [
                ['FAT_RESERVES', 2],
                ['ADAPTATION', 1],
                ['STRENGTH', -1],
            ],
            FLASH_FLOOD: [
                ['WEBBED_LIMBS', 2],
                ['GRIP_CLAWS', 1],
                ['STRENGTH', 1],
                ['AGILITY', -1],
            ],
        } as const

        expect(ROUND_EVENT_DEFINITIONS.map((event) => event.id)).toEqual(Object.keys(expectedMatrix))
        expect(TRAITS).toEqual([
            'STRENGTH',
            'RESISTANCE',
            'AGILITY',
            'PERCEPTION',
            'METABOLISM',
            'ADAPTATION',
            'GRIP_CLAWS',
            'CAMOUFLAGE',
            'WEBBED_LIMBS',
            'FAT_RESERVES',
        ])

        for (const [eventId, expectedEffects] of Object.entries(expectedMatrix)) {
            const event = getRoundEventById(eventId)
            expect(event.effects.map((effect) => [effect.trait, effect.modifier])).toEqual(expectedEffects)
            expect(event.effects.every((effect) => effect.reason.trim().length > 0)).toBe(true)
        }
    })
})
