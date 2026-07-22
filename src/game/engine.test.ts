import { describe, expect, it } from 'vitest'

import { createInitialTraits } from './config'
import { getValidatedTraitRoundValue } from './scoring'
import {
    getTraitRoundValue,
    isTraitUsable,
    resolveRound,
} from './engine'

describe('game engine', () => {
    it('calculates trait value from environment modifier plus level', () => {
        const traits = createInitialTraits()
        traits.AGILITY.level = 2

        expect(getTraitRoundValue('FOREST', traits, 'AGILITY')).toBe(8)
    })

    it('keeps round resolution aligned with the shared validated helper', () => {
        const traits = createInitialTraits()
        traits.AGILITY.level = 1

        const helperValue = getValidatedTraitRoundValue('FOREST', traits, 'AGILITY')
        const result = resolveRound({
            roundNumber: 1,
            environment: 'FOREST',
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: traits,
            player2Traits: createInitialTraits(),
            player1Action: {
                playerId: 'p1',
                trait: 'AGILITY',
                actionType: 'USE',
            },
            player2Action: {
                playerId: 'p2',
                trait: 'STRENGTH',
                actionType: 'USE',
            },
        })

        expect(result.player1.roundValue).toBe(helperValue)
    })

    it('applies evolve without cooldown and increases the trait level', () => {
        const traits = createInitialTraits()
        const result = resolveRound({
            roundNumber: 1,
            environment: 'SWAMP',
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: traits,
            player2Traits: createInitialTraits(),
            player1Action: {
                playerId: 'p1',
                trait: 'METABOLISM',
                actionType: 'EVOLVE',
            },
            player2Action: {
                playerId: 'p2',
                trait: 'STRENGTH',
                actionType: 'EVOLVE',
            },
        })

        expect(result.player1.roundValue).toBe(0)
        expect(result.player1.traits.METABOLISM.level).toBe(1)
        expect(result.player1.traits.METABOLISM.cooldown).toBe(0)
    })

    it('puts a used trait on cooldown for the next round only', () => {
        const roundOne = resolveRound({
            roundNumber: 1,
            environment: 'FOREST',
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: createInitialTraits(),
            player2Traits: createInitialTraits(),
            player1Action: {
                playerId: 'p1',
                trait: 'AGILITY',
                actionType: 'USE',
            },
            player2Action: {
                playerId: 'p2',
                trait: 'STRENGTH',
                actionType: 'EVOLVE',
            },
        })

        expect(roundOne.player1.traits.AGILITY.cooldown).toBe(1)
        expect(isTraitUsable(roundOne.player1.traits, 'AGILITY')).toBe(false)

        expect(() =>
            resolveRound({
                roundNumber: 2,
                environment: 'MOUNTAIN',
                player1Id: 'p1',
                player2Id: 'p2',
                player1Traits: roundOne.player1.traits,
                player2Traits: roundOne.player2.traits,
                player1Action: {
                    playerId: 'p1',
                    trait: 'AGILITY',
                    actionType: 'USE',
                },
                player2Action: {
                    playerId: 'p2',
                    trait: 'RESISTANCE',
                    actionType: 'EVOLVE',
                },
            }),
        ).toThrow(/cooldown/i)

        const roundTwo = resolveRound({
            roundNumber: 2,
            environment: 'MOUNTAIN',
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: roundOne.player1.traits,
            player2Traits: roundOne.player2.traits,
            player1Action: {
                playerId: 'p1',
                trait: 'AGILITY',
                actionType: 'EVOLVE',
            },
            player2Action: {
                playerId: 'p2',
                trait: 'RESISTANCE',
                actionType: 'EVOLVE',
            },
        })

        expect(roundTwo.player1.traits.AGILITY.cooldown).toBe(0)
        expect(roundTwo.player1.traits.AGILITY.level).toBe(1)
    })

    it('resolves ties without assigning points', () => {
        const result = resolveRound({
            roundNumber: 1,
            environment: 'SWAMP',
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: createInitialTraits(),
            player2Traits: createInitialTraits(),
            player1Action: {
                playerId: 'p1',
                trait: 'PERCEPTION',
                actionType: 'USE',
            },
            player2Action: {
                playerId: 'p2',
                trait: 'PERCEPTION',
                actionType: 'USE',
            },
        })

        expect(result.winnerId).toBeNull()
        expect(result.player1ScoreDelta).toBe(0)
        expect(result.player2ScoreDelta).toBe(0)
    })

    it('assigns double points in the sixth round', () => {
        const result = resolveRound({
            roundNumber: 6,
            environment: 'MOUNTAIN',
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: createInitialTraits(),
            player2Traits: createInitialTraits(),
            player1Action: {
                playerId: 'p1',
                trait: 'RESISTANCE',
                actionType: 'USE',
            },
            player2Action: {
                playerId: 'p2',
                trait: 'STRENGTH',
                actionType: 'USE',
            },
        })

        expect(result.awardedPoints).toBe(2)
        expect(result.player1ScoreDelta).toBe(2)
        expect(result.player2ScoreDelta).toBe(0)
    })

    it('blocks double resolution of the same round', () => {
        expect(() =>
            resolveRound({
                roundNumber: 3,
                environment: 'FOREST',
                player1Id: 'p1',
                player2Id: 'p2',
                player1Traits: createInitialTraits(),
                player2Traits: createInitialTraits(),
                player1Action: {
                    playerId: 'p1',
                    trait: 'AGILITY',
                    actionType: 'USE',
                },
                player2Action: {
                    playerId: 'p2',
                    trait: 'ADAPTATION',
                    actionType: 'USE',
                },
                alreadyResolved: true,
            }),
        ).toThrow(/already been resolved/i)
    })

    it('rejects invalid runtime trait values before scoring', () => {
        expect(() =>
            resolveRound({
                roundNumber: 1,
                environment: 'FOREST',
                player1Id: 'p1',
                player2Id: 'p2',
                player1Traits: {
                    ...createInitialTraits(),
                    AGILITY: { level: Number.NaN, cooldown: 0 },
                },
                player2Traits: createInitialTraits(),
                player1Action: {
                    playerId: 'p1',
                    trait: 'AGILITY',
                    actionType: 'USE',
                },
                player2Action: {
                    playerId: 'p2',
                    trait: 'STRENGTH',
                    actionType: 'USE',
                },
            }),
        ).toThrow(/invalid trait state/i)
    })
})