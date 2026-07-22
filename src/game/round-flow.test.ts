import { describe, expect, it } from 'vitest'

import { createInitialTraits, TOTAL_ROUNDS } from './config'
import { resolveRound } from './engine'
import { generateRoundEventSequence, getRoundEventForRound } from './round-events'

describe('round flow with event sequence', () => {
    it('plays a complete match using one persisted event sequence', () => {
        const sequence = generateRoundEventSequence(TOTAL_ROUNDS, () => 0.37)
        let player1Traits = createInitialTraits()
        let player2Traits = createInitialTraits()
        let player1Score = 0
        let player2Score = 0

        for (let roundNumber = 1; roundNumber <= TOTAL_ROUNDS; roundNumber += 1) {
            const roundEvent = getRoundEventForRound(sequence, roundNumber)
            const player1CanUseAgility = player1Traits.AGILITY.cooldown === 0
            const player1ActionType = player1CanUseAgility ? 'USE' : 'EVOLVE'

            expect(roundEvent).not.toBeNull()

            const resolution = resolveRound({
                roundNumber,
                roundEvent: roundEvent!,
                player1Id: 'p1',
                player2Id: 'p2',
                player1Traits,
                player2Traits,
                player1Action: { playerId: 'p1', trait: 'AGILITY', actionType: player1ActionType },
                player2Action: { playerId: 'p2', trait: 'RESISTANCE', actionType: 'EVOLVE' },
            })

            player1Traits = resolution.player1.traits
            player2Traits = resolution.player2.traits
            player1Score += resolution.player1ScoreDelta
            player2Score += resolution.player2ScoreDelta
        }

        expect(player1Score + player2Score).toBeGreaterThanOrEqual(0)
        expect(player1Traits.AGILITY.level).toBeGreaterThanOrEqual(0)
        expect(player2Traits.RESISTANCE.level).toBe(TOTAL_ROUNDS)
    })

    it('awards 2 points on final round advancement', () => {
        const sequence = [
            'VOLCANIC_ASH_WAVE',
            'PROLONGED_ECLIPSE',
            'PREDATOR_PACK_MIGRATION',
            'HEAT_SPIKE',
            'NUTRIENT_COLLAPSE',
            'FLASH_FLOOD',
        ]

        const finalEvent = getRoundEventForRound(sequence, 6)

        const resolution = resolveRound({
            roundNumber: 6,
            roundEvent: finalEvent!,
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: createInitialTraits(),
            player2Traits: createInitialTraits(),
            player1Action: { playerId: 'p1', trait: 'WEBBED_LIMBS', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'STRENGTH', actionType: 'USE' },
        })

        expect(resolution.awardedPoints).toBe(2)
        expect(resolution.player1ScoreDelta).toBe(2)
    })
})
