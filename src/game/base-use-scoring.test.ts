import { describe, expect, it } from 'vitest'

import edgeSource from '../../supabase/functions/resolve-round/index.ts?raw'
import { BASE_USE_VALUE, createInitialTraits } from './config'
import { resolveRound } from './engine'
import { buildPersistedRoundResolution } from './persisted-round-resolution'
import { getRoundEventById } from './round-events'
import { getValidatedActionBreakdown, getValidatedTraitUseBreakdown } from './scoring'
import type { PlayerRoundAction, RoundEventDefinition, TraitCollection } from './types'

const neutralEvent: RoundEventDefinition = {
    id: 'NEUTRAL_TEST_EVENT',
    title: 'Evento neutro',
    shortDescription: 'Nessun gene viene modificato.',
    category: 'ECOLOGICAL',
    rarity: 'COMMON',
    intensity: 1,
    artKey: 'neutral-test-event',
    tags: ['test'],
    effects: [],
}

function resolveActions(
    player1Action: PlayerRoundAction,
    player2Action: PlayerRoundAction,
    player1Traits: TraitCollection = createInitialTraits(),
    player2Traits: TraitCollection = createInitialTraits(),
    roundEvent: RoundEventDefinition = neutralEvent,
) {
    return resolveRound({
        roundNumber: 1,
        roundEvent,
        player1Id: 'p1',
        player2Id: 'p2',
        player1Traits,
        player2Traits,
        player1Action,
        player2Action,
    })
}

describe('intrinsic USE value', () => {
    it('gives a neutral level-0 gene the positive base value', () => {
        const breakdown = getValidatedTraitUseBreakdown(
            neutralEvent,
            createInitialTraits(),
            'STRENGTH',
        )

        expect(BASE_USE_VALUE).toBe(1)
        expect(breakdown).toMatchObject({
            actionType: 'USE',
            baseContribution: 1,
            levelContribution: 0,
            eventContribution: 0,
            total: 1,
        })
    })

    it('adds level contribution after the base value for a neutral evolved gene', () => {
        const traits = createInitialTraits()
        traits.STRENGTH.level = 1

        expect(getValidatedTraitUseBreakdown(neutralEvent, traits, 'STRENGTH')).toMatchObject({
            baseContribution: 1,
            levelContribution: 1,
            eventContribution: 0,
            total: 2,
        })
    })

    it('adds a +2 event contribution at level 0 with the current event weight', () => {
        const breakdown = getValidatedTraitUseBreakdown(
            getRoundEventById('PREDATOR_PACK_MIGRATION'),
            createInitialTraits(),
            'STRENGTH',
        )

        expect(breakdown).toMatchObject({
            baseContribution: 1,
            levelContribution: 0,
            eventContribution: 2,
            total: 3,
        })
    })

    it('lets the production -1 penalty offset the level-0 base to zero', () => {
        const breakdown = getValidatedTraitUseBreakdown(
            getRoundEventById('HEAT_SPIKE'),
            createInitialTraits(),
            'FAT_RESERVES',
        )

        expect(breakdown).toMatchObject({
            baseContribution: 1,
            levelContribution: 0,
            eventContribution: -1,
            total: 0,
        })
    })

    it('preserves intentional negative totals instead of clamping them', () => {
        const severePenaltyEvent: RoundEventDefinition = {
            ...neutralEvent,
            id: 'SEVERE_PENALTY_TEST_EVENT',
            effects: [{
                trait: 'STRENGTH',
                modifier: -2,
                reason: 'Penalita di regressione abbastanza forte da superare il valore base.',
            }],
        }

        expect(getValidatedTraitUseBreakdown(
            severePenaltyEvent,
            createInitialTraits(),
            'STRENGTH',
        )).toMatchObject({
            baseContribution: 1,
            eventContribution: -2,
            total: -1,
        })
    })

    it('keeps EVOLVE at zero for every contribution and total', () => {
        const traits = createInitialTraits()
        traits.STRENGTH.level = 2

        expect(getValidatedActionBreakdown(
            getRoundEventById('PREDATOR_PACK_MIGRATION'),
            traits,
            'STRENGTH',
            'EVOLVE',
        )).toMatchObject({
            actionType: 'EVOLVE',
            baseContribution: 0,
            levelContribution: 0,
            eventContribution: 0,
            total: 0,
        })
    })

    it('resolves equal neutral level-0 USE actions as a tie at value 1', () => {
        const result = resolveActions(
            { playerId: 'p1', trait: 'STRENGTH', actionType: 'USE' },
            { playerId: 'p2', trait: 'RESISTANCE', actionType: 'USE' },
        )

        expect(result.player1.roundValue).toBe(1)
        expect(result.player2.roundValue).toBe(1)
        expect(result.winnerId).toBeNull()
    })
})

describe('frontend and Edge scoring parity', () => {
    it.each([
        {
            label: 'neutral level 0 USE',
            roundEvent: neutralEvent,
            traits: createInitialTraits(),
            action: { playerId: 'p1', trait: 'STRENGTH', actionType: 'USE' } as const,
        },
        {
            label: 'favored level 0 USE',
            roundEvent: getRoundEventById('PREDATOR_PACK_MIGRATION'),
            traits: createInitialTraits(),
            action: { playerId: 'p1', trait: 'STRENGTH', actionType: 'USE' } as const,
        },
        {
            label: 'penalized level 0 USE',
            roundEvent: getRoundEventById('HEAT_SPIKE'),
            traits: createInitialTraits(),
            action: { playerId: 'p1', trait: 'FAT_RESERVES', actionType: 'USE' } as const,
        },
        {
            label: 'EVOLVE',
            roundEvent: getRoundEventById('PREDATOR_PACK_MIGRATION'),
            traits: createInitialTraits(),
            action: { playerId: 'p1', trait: 'STRENGTH', actionType: 'EVOLVE' } as const,
        },
    ])('persists exactly the frontend engine result for $label', ({ roundEvent, traits, action }) => {
        const opponentAction = {
            playerId: 'p2',
            trait: 'ADAPTATION',
            actionType: 'EVOLVE',
        } as const
        const engineResult = resolveActions(
            action,
            opponentAction,
            traits,
            createInitialTraits(),
            roundEvent,
        )
        const persistedResult = buildPersistedRoundResolution({
            roundNumber: 1,
            roundEvent,
            player1Id: 'p1',
            player2Id: 'p2',
            player1Score: 0,
            player2Score: 0,
            player1Traits: traits,
            player2Traits: createInitialTraits(),
            player1Action: action,
            player2Action: opponentAction,
            startedAt: null,
        })

        expect(persistedResult.player_1_value).toBe(engineResult.player1.roundValue)
        expect(persistedResult.player_2_value).toBe(engineResult.player2.roundValue)
        expect(persistedResult.winner_id).toBe(engineResult.winnerId)
        expect(persistedResult.resolution_data.player1Breakdown).toEqual(engineResult.player1.breakdown)
        expect(persistedResult.resolution_data.player2Breakdown).toEqual(engineResult.player2.breakdown)
    })

    it('keeps the Edge rule copy aligned and delegates production resolution to the shared engine path', () => {
        expect(edgeSource).toContain(`const EDGE_BASE_USE_VALUE = ${BASE_USE_VALUE}`)
        expect(edgeSource).toContain('EDGE_BASE_USE_VALUE !== BASE_USE_VALUE')
        expect(edgeSource).toContain('buildPersistedRoundResolution({')
    })
})
