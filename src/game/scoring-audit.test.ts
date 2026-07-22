import { describe, expect, it } from 'vitest'

import { createInitialTraits } from './config'
import { resolveRound } from './engine'
import { getRoundEventById } from './round-events'
import type { TraitCollection, TraitType } from './types'

type ScenarioAction = {
    trait: TraitType
    actionType: 'USE' | 'EVOLVE'
}

function withLevels(levels: Partial<Record<TraitType, number>>): TraitCollection {
    const traits = createInitialTraits()

    for (const [trait, level] of Object.entries(levels) as Array<[TraitType, number]>) {
        traits[trait].level = level
    }

    return traits
}

function playRound(input: {
    eventId: string
    player1Levels?: Partial<Record<TraitType, number>>
    player2Levels?: Partial<Record<TraitType, number>>
    player1Action: ScenarioAction
    player2Action: ScenarioAction
    roundNumber?: number
}) {
    return resolveRound({
        roundNumber: input.roundNumber ?? 1,
        roundEvent: getRoundEventById(input.eventId),
        player1Id: 'p1',
        player2Id: 'p2',
        player1Traits: withLevels(input.player1Levels ?? {}),
        player2Traits: withLevels(input.player2Levels ?? {}),
        player1Action: {
            playerId: 'p1',
            trait: input.player1Action.trait,
            actionType: input.player1Action.actionType,
        },
        player2Action: {
            playerId: 'p2',
            trait: input.player2Action.trait,
            actionType: input.player2Action.actionType,
        },
    })
}

describe('scoring audit scenarios', () => {
    it('bonus positivo su tratto favorito', () => {
        const result = playRound({
            eventId: 'PREDATOR_PACK_MIGRATION',
            player1Action: { trait: 'AGILITY', actionType: 'USE' },
            player2Action: { trait: 'STRENGTH', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(4)
        expect(result.player2.roundValue).toBe(0)
        expect(result.winnerId).toBe('p1')
    })

    it('malus negativo su tratto penalizzato', () => {
        const result = playRound({
            eventId: 'HEAT_SPIKE',
            player1Action: { trait: 'FAT_RESERVES', actionType: 'USE' },
            player2Action: { trait: 'METABOLISM', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(-4)
        expect(result.player2.roundValue).toBe(4)
        expect(result.winnerId).toBe('p2')
    })

    it('gene senza effetto evento mantiene solo contributo livello', () => {
        const result = playRound({
            eventId: 'VOLCANIC_ASH_WAVE',
            player1Levels: { ADAPTATION: 3 },
            player2Levels: { STRENGTH: 1 },
            player1Action: { trait: 'ADAPTATION', actionType: 'USE' },
            player2Action: { trait: 'STRENGTH', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(3)
        expect(result.player2.roundValue).toBe(1)
        expect(result.winnerId).toBe('p1')
    })

    it('reason disponibile nel breakdown effetti', () => {
        const result = playRound({
            eventId: 'VOLCANIC_ASH_WAVE',
            player1Action: { trait: 'RESISTANCE', actionType: 'USE' },
            player2Action: { trait: 'STRENGTH', actionType: 'USE' },
        })

        expect(result.player1.breakdown.appliedEventEffects.length).toBeGreaterThan(0)
        expect(result.player1.breakdown.appliedEventEffects[0]?.reason).toMatch(/particolato/i)
    })

    it('determinismo: stessa configurazione produce stesso risultato', () => {
        const a = playRound({
            eventId: 'PROLONGED_ECLIPSE',
            player1Levels: { PERCEPTION: 2 },
            player2Levels: { STRENGTH: 2 },
            player1Action: { trait: 'PERCEPTION', actionType: 'USE' },
            player2Action: { trait: 'STRENGTH', actionType: 'USE' },
        })

        const b = playRound({
            eventId: 'PROLONGED_ECLIPSE',
            player1Levels: { PERCEPTION: 2 },
            player2Levels: { STRENGTH: 2 },
            player1Action: { trait: 'PERCEPTION', actionType: 'USE' },
            player2Action: { trait: 'STRENGTH', actionType: 'USE' },
        })

        expect(a.player1.roundValue).toBe(b.player1.roundValue)
        expect(a.player2.roundValue).toBe(b.player2.roundValue)
        expect(a.winnerId).toBe(b.winnerId)
    })
})
