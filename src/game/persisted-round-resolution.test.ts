import { describe, expect, it } from 'vitest'

import { createInitialTraits } from './config'
import { resolveRound } from './engine'
import { buildPersistedRoundResolution } from './persisted-round-resolution'
import { getRoundEventById } from './round-events'
import type { PlayerRoundAction, TraitCollection, TraitType } from './types'

function withTraitState(
    trait: TraitType,
    state: Partial<TraitCollection[TraitType]>,
): TraitCollection {
    const traits = createInitialTraits()
    traits[trait] = { ...traits[trait], ...state }
    return traits
}

function createInput(overrides: {
    roundNumber?: number
    player1Traits?: TraitCollection
    player2Traits?: TraitCollection
    player1Action?: PlayerRoundAction
    player2Action?: PlayerRoundAction
} = {}) {
    return {
        roundNumber: overrides.roundNumber ?? 1,
        roundEvent: getRoundEventById('VOLCANIC_ASH_WAVE'),
        player1Id: 'p1',
        player2Id: 'p2',
        player1Score: 2,
        player2Score: 1,
        player1Traits: overrides.player1Traits ?? createInitialTraits(),
        player2Traits: overrides.player2Traits ?? createInitialTraits(),
        player1Action: overrides.player1Action ?? {
            playerId: 'p1',
            trait: 'RESISTANCE' as const,
            actionType: 'USE' as const,
        },
        player2Action: overrides.player2Action ?? {
            playerId: 'p2',
            trait: 'ADAPTATION' as const,
            actionType: 'EVOLVE' as const,
        },
        startedAt: null,
    }
}

function expectEngineAndPersistedParity(input: ReturnType<typeof createInput>) {
    const engineResult = resolveRound({
        roundNumber: input.roundNumber,
        roundEvent: input.roundEvent,
        player1Id: input.player1Id,
        player2Id: input.player2Id,
        player1Traits: input.player1Traits,
        player2Traits: input.player2Traits,
        player1Action: input.player1Action,
        player2Action: input.player2Action,
    })
    const persistedResult = buildPersistedRoundResolution({
        ...input,
        now: () => '2026-07-26T00:00:00.000Z',
    })

    expect(persistedResult.player_1_value).toBe(engineResult.player1.roundValue)
    expect(persistedResult.player_2_value).toBe(engineResult.player2.roundValue)
    expect(persistedResult.winner_id).toBe(engineResult.winnerId)
    expect(persistedResult.resolution_data.awardedPoints).toBe(engineResult.awardedPoints)
    expect(persistedResult.resolution_data.player1Breakdown).toEqual(engineResult.player1.breakdown)
    expect(persistedResult.resolution_data.player2Breakdown).toEqual(engineResult.player2.breakdown)
    expect(persistedResult.resolution_data.player1TraitsAfter).toEqual(engineResult.player1.traits)
    expect(persistedResult.resolution_data.player2TraitsAfter).toEqual(engineResult.player2.traits)

    return { engineResult, persistedResult }
}

describe('frontend and persisted Edge resolution parity', () => {
    it.each([
        {
            label: 'level 0 with +2 affinity',
            trait: 'FAT_RESERVES' as const,
            traits: createInitialTraits(),
            expected: 3,
        },
        {
            label: 'level 2 with neutral affinity',
            trait: 'STRENGTH' as const,
            traits: withTraitState('STRENGTH', { level: 2 }),
            expected: 3,
        },
        {
            label: 'level 1 with +1 affinity',
            trait: 'RESISTANCE' as const,
            traits: withTraitState('RESISTANCE', { level: 1 }),
            expected: 3,
        },
        {
            label: 'level 3 with +2 affinity',
            trait: 'FAT_RESERVES' as const,
            traits: withTraitState('FAT_RESERVES', { level: 3 }),
            expected: 6,
        },
    ])('uses base + level + modifier for $label', ({ trait, traits, expected }) => {
        const { engineResult } = expectEngineAndPersistedParity(createInput({
            player1Traits: traits,
            player1Action: { playerId: 'p1', trait, actionType: 'USE' },
        }))

        expect(engineResult.player1.roundValue).toBe(expected)
    })

    it('EVOLVE from level 2 stores level 3 and scores zero', () => {
        const { engineResult } = expectEngineAndPersistedParity(createInput({
            player1Traits: withTraitState('RESISTANCE', { level: 2 }),
            player1Action: { playerId: 'p1', trait: 'RESISTANCE', actionType: 'EVOLVE' },
        }))

        expect(engineResult.player1.roundValue).toBe(0)
        expect(engineResult.player1.traits.RESISTANCE.level).toBe(3)
    })

    it('rejects EVOLVE at level 3 in both entry points', () => {
        const input = createInput({
            player1Traits: withTraitState('RESISTANCE', { level: 3 }),
            player1Action: { playerId: 'p1', trait: 'RESISTANCE', actionType: 'EVOLVE' },
        })

        expect(() => resolveRound(input)).toThrow(/maximum level/i)
        expect(() => buildPersistedRoundResolution(input)).toThrow(/maximum level/i)
    })

    it('rejects USE in cooldown in both entry points', () => {
        const input = createInput({
            player1Traits: withTraitState('RESISTANCE', { cooldown: 1 }),
        })

        expect(() => resolveRound(input)).toThrow(/cooldown/i)
        expect(() => buildPersistedRoundResolution(input)).toThrow(/cooldown/i)
    })

    it('sets cooldown to 1 after USE and ticks it back to 0 on the next action', () => {
        const first = expectEngineAndPersistedParity(createInput()).engineResult
        expect(first.player1.traits.RESISTANCE.cooldown).toBe(1)

        const second = expectEngineAndPersistedParity(createInput({
            roundNumber: 2,
            player1Traits: first.player1.traits,
            player1Action: { playerId: 'p1', trait: 'AGILITY', actionType: 'EVOLVE' },
        })).engineResult

        expect(second.player1.traits.RESISTANCE.cooldown).toBe(0)
    })

    it('clamps legacy stored levels in the next persisted state', () => {
        const { engineResult, persistedResult } = expectEngineAndPersistedParity(createInput({
            player1Traits: withTraitState('RESISTANCE', { level: 8 }),
        }))

        expect(engineResult.player1.breakdown.originalLevel).toBe(8)
        expect(engineResult.player1.breakdown.effectiveLevel).toBe(3)
        expect(engineResult.player1.traits.RESISTANCE.level).toBe(3)
        expect(persistedResult.resolution_data.player1TraitsAfter.RESISTANCE.level).toBe(3)
    })

    it('assigns exactly one point in the final persisted resolution', () => {
        const { engineResult, persistedResult } = expectEngineAndPersistedParity(createInput({
            roundNumber: 6,
        }))

        expect(engineResult.awardedPoints).toBe(1)
        expect(persistedResult.resolution_data.awardedPoints).toBe(1)
        expect(persistedResult.resolution_data.player1PointsAwarded).toBe(1)
        expect(persistedResult.resolution_data.statusAfter).toBe('FINISHED')
    })
})
