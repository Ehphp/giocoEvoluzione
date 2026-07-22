import { describe, expect, it } from 'vitest'

import { createInitialTraits } from '../../../game/config'
import { getTraitRoundValue } from '../../../game/engine'
import type { TraitType } from '../../../game/types'
import type { GameSnapshot, GameRecord, PlayerRecord } from '../../../lib/game-api'
import { buildGeneSelectionV2ViewModel } from './buildGeneSelectionV2ViewModel'

function createGame(overrides: Partial<GameRecord> = {}): GameRecord {
    return {
        id: 'game-1',
        room_code: 'ABCDE',
        status: 'CHOOSING',
        current_round: 1,
        environment_sequence: ['FOREST', 'MOUNTAIN', 'SWAMP', 'FOREST', 'SWAMP', 'MOUNTAIN'],
        player_1_id: 'p1',
        player_2_id: 'p2',
        player_1_score: 0,
        player_2_score: 0,
        winner_id: null,
        started_at: null,
        finished_at: null,
        rematch_count: 0,
        created_at: 'now',
        updated_at: 'now',
        ...overrides,
    }
}

function createPlayer(id: string, slot: 1 | 2, nickname: string): PlayerRecord {
    return {
        id,
        game_id: 'game-1',
        nickname,
        slot,
        traits: createInitialTraits(),
        connected: true,
        created_at: 'now',
    }
}

function createSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
    const me = createPlayer('p1', 1, 'Alice')
    const opponent = createPlayer('p2', 2, 'Bob')

    me.traits.AGILITY.level = 2
    me.traits.WEBBED_LIMBS.cooldown = 1
    opponent.traits.STRENGTH.level = 1

    return {
        game: createGame(),
        players: [me, opponent],
        me,
        opponent,
        currentEnvironment: 'FOREST',
        nextEnvironment: 'MOUNTAIN',
        actionsSubmitted: 0,
        myCurrentAction: null,
        currentRoundResult: null,
        ...overrides,
    }
}

function build(snapshot: GameSnapshot, overrides: Partial<Parameters<typeof buildGeneSelectionV2ViewModel>[0]> = {}) {
    return buildGeneSelectionV2ViewModel({
        snapshot,
        myScore: 2,
        opponentScore: 1,
        selectedGeneId: 'AGILITY',
        selectedAction: null,
        isSubmitting: false,
        submitErrorMessage: null,
        hasLocalSubmittedAction: false,
        localSubmittedAction: null,
        ...overrides,
    })
}

describe('buildGeneSelectionV2ViewModel', () => {
    it('maps player and opponent core data', () => {
        const viewModel = build(createSnapshot())

        expect(viewModel.player.name).toBe('Alice')
        expect(viewModel.player.score).toBe(2)
        expect(viewModel.opponent.name).toBe('Bob')
        expect(viewModel.opponent.score).toBe(1)
    })

    it('maps environment with real name and modifiers', () => {
        const viewModel = build(createSnapshot())

        expect(viewModel.environment.id).toBe('FOREST')
        expect(viewModel.environment.name).toContain('Foresta')
        expect(viewModel.environment.modifiers.length).toBeGreaterThan(0)
    })

    it('maps owned genes from real trait collection', () => {
        const viewModel = build(createSnapshot())

        expect(viewModel.genes.length).toBe(10)
        expect(viewModel.genes.some((gene) => gene.traitType === 'AGILITY')).toBe(true)
        expect(viewModel.genes.every((gene) => typeof gene.level === 'number')).toBe(true)
    })

    it('marks a non-usable gene when cooldown is active', () => {
        const viewModel = build(createSnapshot())
        const webbedLimbs = viewModel.genes.find((gene) => gene.traitType === 'WEBBED_LIMBS')

        expect(webbedLimbs?.usable).toBe(false)
        expect(webbedLimbs?.disabledReason).toContain('Cooldown')
    })

    it('maps affinity from environment modifiers', () => {
        const viewModel = build(createSnapshot())
        const agility = viewModel.genes.find((gene) => gene.traitType === 'AGILITY')

        expect(agility?.affinity).toBe('excellent')
    })

    it('uses shared engine calculation for predicted USE value', () => {
        const snapshot = createSnapshot()
        const viewModel = build(snapshot)
        const agility = viewModel.genes.find((gene) => gene.traitType === 'AGILITY')
        const expected = getTraitRoundValue('FOREST', snapshot.me!.traits, 'AGILITY')

        expect(agility?.predictedValue).toBe(expected)
    })

    it('returns choosing status by default', () => {
        const viewModel = build(createSnapshot())

        expect(viewModel.status).toBe('choosing')
    })

    it('returns submitting status while local submit is in progress', () => {
        const viewModel = build(createSnapshot(), { isSubmitting: true, selectedAction: 'USE' })

        expect(viewModel.status).toBe('submitting')
        expect(viewModel.canUse).toBe(false)
        expect(viewModel.canEvolve).toBe(false)
    })

    it('returns waiting state with 1/2 after local successful submit', () => {
        const viewModel = build(createSnapshot({ actionsSubmitted: 1 }), {
            hasLocalSubmittedAction: true,
            localSubmittedAction: { trait: 'AGILITY', actionType: 'USE' },
        })

        expect(viewModel.status).toBe('waiting')
        expect(viewModel.waitingState?.submittedCountLabel).toBe('1/2')
    })

    it('returns resolving state with 2/2 when both actions are present', () => {
        const snapshot = createSnapshot({
            actionsSubmitted: 2,
            myCurrentAction: {
                id: 'a1',
                game_id: 'game-1',
                round_number: 1,
                player_id: 'p1',
                trait: 'AGILITY',
                action_type: 'EVOLVE',
                created_at: 'now',
            },
        })
        const viewModel = build(snapshot)

        expect(viewModel.status).toBe('resolving')
        expect(viewModel.waitingState?.submittedCountLabel).toBe('2/2')
        expect(viewModel.waitingState?.isResolving).toBe(true)
    })

    it('recognizes already submitted action from snapshot', () => {
        const snapshot = createSnapshot({
            actionsSubmitted: 1,
            myCurrentAction: {
                id: 'a2',
                game_id: 'game-1',
                round_number: 1,
                player_id: 'p1',
                trait: 'PERCEPTION' as TraitType,
                action_type: 'USE',
                created_at: 'now',
            },
        })
        const viewModel = build(snapshot)

        expect(viewModel.player.status).toBe('ready')
        expect(viewModel.selectedAction).toBe('USE')
    })

    it('maps round changes from snapshot', () => {
        const snapshot = createSnapshot({
            game: createGame({ current_round: 2 }),
            currentEnvironment: 'MOUNTAIN',
        })
        const viewModel = build(snapshot)

        expect(viewModel.round.current).toBe(2)
        expect(viewModel.environment.id).toBe('MOUNTAIN')
    })
})
