import { describe, expect, it } from 'vitest'

import { createInitialTraits } from './config'
import { resolveRound } from './engine'
import type { Environment, TraitCollection, TraitType } from './types'

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
    environment: Environment
    player1Levels?: Partial<Record<TraitType, number>>
    player2Levels?: Partial<Record<TraitType, number>>
    player1Action: ScenarioAction
    player2Action: ScenarioAction
    roundNumber?: number
}) {
    return resolveRound({
        roundNumber: input.roundNumber ?? 1,
        environment: input.environment,
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

function makeTraitsWithCustomOrder(levels: Array<[TraitType, number]>): TraitCollection {
    const result: Partial<TraitCollection> = {}

    for (const [trait, level] of levels) {
        result[trait] = {
            level,
            cooldown: 0,
        }
    }

    return result as TraitCollection
}

describe('scoring audit scenarios', () => {
    it('1) no favored trait selected in FOREST', () => {
        const result = playRound({
            environment: 'FOREST',
            player1Action: { trait: 'METABOLISM', actionType: 'USE' },
            player2Action: { trait: 'STRENGTH', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(0)
        expect(result.player2.roundValue).toBe(4)
        expect(result.winnerId).toBe('p2')
    })

    it('2) one favored trait improves score', () => {
        const result = playRound({
            environment: 'FOREST',
            player1Action: { trait: 'AGILITY', actionType: 'USE' },
            player2Action: { trait: 'STRENGTH', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(6)
        expect(result.player2.roundValue).toBe(4)
        expect(result.winnerId).toBe('p1')
    })

    it('3) two favored levels can outperform one favored level', () => {
        const result = playRound({
            environment: 'FOREST',
            player1Levels: { AGILITY: 1, PERCEPTION: 1 },
            player2Levels: { AGILITY: 1 },
            player1Action: { trait: 'PERCEPTION', actionType: 'USE' },
            player2Action: { trait: 'AGILITY', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(5)
        expect(result.player2.roundValue).toBe(7)
        expect(result.winnerId).toBe('p2')
    })

    it('4) unfavorable trait is low but not negative', () => {
        const result = playRound({
            environment: 'MOUNTAIN',
            player1Action: { trait: 'AGILITY', actionType: 'USE' },
            player2Action: { trait: 'RESISTANCE', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(2)
        expect(result.player2.roundValue).toBe(6)
        expect(result.winnerId).toBe('p2')
    })

    it('5) bonus and weak trait comparison in same round', () => {
        const result = playRound({
            environment: 'SWAMP',
            player1Levels: { METABOLISM: 2 },
            player2Levels: { STRENGTH: 2 },
            player1Action: { trait: 'METABOLISM', actionType: 'USE' },
            player2Action: { trait: 'STRENGTH', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(8)
        expect(result.player2.roundValue).toBe(2)
        expect(result.winnerId).toBe('p1')
    })

    it('6) all neutral levels lead to deterministic tie', () => {
        const result = playRound({
            environment: 'SWAMP',
            player1Action: { trait: 'PERCEPTION', actionType: 'USE' },
            player2Action: { trait: 'PERCEPTION', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(4)
        expect(result.player2.roundValue).toBe(4)
        expect(result.winnerId).toBeNull()
        expect(result.player1ScoreDelta).toBe(0)
        expect(result.player2ScoreDelta).toBe(0)
    })

    it('7) same traits and actions always produce same score', () => {
        const a = playRound({
            environment: 'FOREST',
            player1Levels: { AGILITY: 2 },
            player2Levels: { STRENGTH: 1 },
            player1Action: { trait: 'AGILITY', actionType: 'USE' },
            player2Action: { trait: 'STRENGTH', actionType: 'USE' },
        })

        const b = playRound({
            environment: 'FOREST',
            player1Levels: { AGILITY: 2 },
            player2Levels: { STRENGTH: 1 },
            player1Action: { trait: 'AGILITY', actionType: 'USE' },
            player2Action: { trait: 'STRENGTH', actionType: 'USE' },
        })

        expect(a.player1.roundValue).toBe(b.player1.roundValue)
        expect(a.player2.roundValue).toBe(b.player2.roundValue)
        expect(a.winnerId).toBe(b.winnerId)
    })

    it('8) trait object key order does not change result', () => {
        const orderedTraits = makeTraitsWithCustomOrder([
            ['STRENGTH', 0],
            ['RESISTANCE', 0],
            ['AGILITY', 2],
            ['PERCEPTION', 0],
            ['METABOLISM', 0],
            ['ADAPTATION', 0],
            ['GRIP_CLAWS', 0],
            ['CAMOUFLAGE', 0],
            ['WEBBED_LIMBS', 0],
            ['FAT_RESERVES', 0],
        ])

        const reorderedTraits = makeTraitsWithCustomOrder([
            ['FAT_RESERVES', 0],
            ['WEBBED_LIMBS', 0],
            ['CAMOUFLAGE', 0],
            ['GRIP_CLAWS', 0],
            ['ADAPTATION', 0],
            ['METABOLISM', 0],
            ['PERCEPTION', 0],
            ['AGILITY', 2],
            ['RESISTANCE', 0],
            ['STRENGTH', 0],
        ])

        const a = resolveRound({
            roundNumber: 1,
            environment: 'FOREST',
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: orderedTraits,
            player2Traits: createInitialTraits(),
            player1Action: { playerId: 'p1', trait: 'AGILITY', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'STRENGTH', actionType: 'USE' },
        })

        const b = resolveRound({
            roundNumber: 1,
            environment: 'FOREST',
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: reorderedTraits,
            player2Traits: createInitialTraits(),
            player1Action: { playerId: 'p1', trait: 'AGILITY', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'STRENGTH', actionType: 'USE' },
        })

        expect(a.player1.roundValue).toBe(8)
        expect(b.player1.roundValue).toBe(8)
        expect(a.winnerId).toBe(b.winnerId)
    })

    it('9) environment with multiple pressures still uses one selected trait per player', () => {
        const forestResult = playRound({
            environment: 'FOREST',
            player1Action: { trait: 'AGILITY', actionType: 'USE' },
            player2Action: { trait: 'RESISTANCE', actionType: 'USE' },
        })

        const mountainResult = playRound({
            environment: 'MOUNTAIN',
            player1Action: { trait: 'AGILITY', actionType: 'USE' },
            player2Action: { trait: 'RESISTANCE', actionType: 'USE' },
        })

        expect(forestResult.player1.roundValue).toBe(6)
        expect(mountainResult.player1.roundValue).toBe(2)
        expect(forestResult.player2.roundValue).toBe(0)
        expect(mountainResult.player2.roundValue).toBe(6)
    })

    it('10) multi-effect trait expectation is not present in current formula', () => {
        const result = playRound({
            environment: 'SWAMP',
            player1Action: { trait: 'ADAPTATION', actionType: 'USE' },
            player2Action: { trait: 'METABOLISM', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(4)
        expect(result.player2.roundValue).toBe(6)
        expect(result.winnerId).toBe('p2')
    })

    it('11) invalid runtime level is rejected before scoring', () => {
        expect(() =>
            resolveRound({
                roundNumber: 1,
                environment: 'FOREST',
                player1Id: 'p1',
                player2Id: 'p2',
                player1Traits: {
                    ...createInitialTraits(),
                    AGILITY: { level: undefined as unknown as number, cooldown: 0 },
                },
                player2Traits: createInitialTraits(),
                player1Action: { playerId: 'p1', trait: 'AGILITY', actionType: 'USE' },
                player2Action: { playerId: 'p2', trait: 'STRENGTH', actionType: 'USE' },
            }),
        ).toThrow(/invalid trait state/i)
    })

    it('12) potentially anomalous: high level on unfavorable trait beats low favored trait', () => {
        const result = playRound({
            environment: 'MOUNTAIN',
            player1Levels: { AGILITY: 5 },
            player2Levels: { RESISTANCE: 0 },
            player1Action: { trait: 'AGILITY', actionType: 'USE' },
            player2Action: { trait: 'RESISTANCE', actionType: 'USE' },
        })

        expect(result.player1.roundValue).toBe(7)
        expect(result.player2.roundValue).toBe(6)
        expect(result.winnerId).toBe('p1')
    })
})

describe('scoring invariants', () => {
    it('is symmetric when swapping players and actions', () => {
        const forward = playRound({
            environment: 'SWAMP',
            player1Levels: { METABOLISM: 1 },
            player2Levels: { ADAPTATION: 1 },
            player1Action: { trait: 'METABOLISM', actionType: 'USE' },
            player2Action: { trait: 'ADAPTATION', actionType: 'USE' },
        })

        const reverse = resolveRound({
            roundNumber: 1,
            environment: 'SWAMP',
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: withLevels({ ADAPTATION: 1 }),
            player2Traits: withLevels({ METABOLISM: 1 }),
            player1Action: { playerId: 'p1', trait: 'ADAPTATION', actionType: 'USE' },
            player2Action: { playerId: 'p2', trait: 'METABOLISM', actionType: 'USE' },
        })

        expect(forward.player1.roundValue).toBe(reverse.player2.roundValue)
        expect(forward.player2.roundValue).toBe(reverse.player1.roundValue)
    })

    it('awards points to declared winner and winner matches higher round value', () => {
        const result = playRound({
            environment: 'FOREST',
            player1Action: { trait: 'AGILITY', actionType: 'USE' },
            player2Action: { trait: 'METABOLISM', actionType: 'USE' },
            roundNumber: 6,
        })

        expect(result.player1.roundValue).toBeGreaterThan(result.player2.roundValue)
        expect(result.winnerId).toBe('p1')
        expect(result.player1ScoreDelta).toBe(2)
        expect(result.player2ScoreDelta).toBe(0)
    })
})