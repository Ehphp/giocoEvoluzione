import { describe, expect, it } from 'vitest'

import { createInitialTraits } from '../../../game/config'
import { getRoundEventById } from '../../../game/round-events'
import type { RoundEventDefinition, TraitCollection, TraitType } from '../../../game/types'
import type { GameSnapshot, GameRecord, PlayerRecord } from '../../../lib/game-api'
import { buildGeneSelectionV2ViewModel } from './buildGeneSelectionV2ViewModel'

function createGame(overrides: Partial<GameRecord> = {}): GameRecord {
    return {
        id: 'game-1',
        room_code: 'ABCDE',
        game_mode: 'PVP',
        status: 'CHOOSING',
        current_round: 1,
        world_id: 'AURELIA_PRIME',
        round_event_sequence: [
            'VOLCANIC_ASH_WAVE',
            'PROLONGED_ECLIPSE',
            'PREDATOR_PACK_MIGRATION',
            'HEAT_SPIKE',
            'NUTRIENT_COLLAPSE',
            'FLASH_FLOOD',
        ],
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
        player_type: 'HUMAN',
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
        world: {
            id: 'AURELIA_PRIME',
            name: 'Aurelia Prime',
            planetName: 'Aurelia',
            backgroundArtKey: 'world-aurelia-prime',
            paletteKey: 'aurelia-amber',
        },
        currentRoundEvent: getRoundEventById('VOLCANIC_ASH_WAVE'),
        nextRoundEvent: getRoundEventById('PROLONGED_ECLIPSE'),
        actionsSubmitted: 0,
        myCurrentAction: null,
        currentRoundResult: null,
        ...overrides,
    }
}

function createEvent(overrides: Partial<RoundEventDefinition> = {}): RoundEventDefinition {
    return {
        id: 'custom-event',
        title: 'Evento di test',
        shortDescription: 'Descrizione breve',
        category: 'CLIMATE',
        rarity: 'COMMON',
        intensity: 1,
        artKey: 'world-aurelia-prime',
        tags: [],
        effects: [],
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

    it('maps round event with title and effects', () => {
        const viewModel = build(createSnapshot())

        expect(viewModel.roundEvent.id).toBe('VOLCANIC_ASH_WAVE')
        expect(viewModel.roundEvent.title).toContain('ceneri')
        expect(viewModel.roundEvent.effects.length).toBeGreaterThan(0)
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

    it('maps affinity from round event effects', () => {
        const viewModel = build(createSnapshot())
        const agility = viewModel.genes.find((gene) => gene.traitType === 'AGILITY')

        expect(agility?.affinity).toBe('medium')
    })

    it('maps the exact predicted use score and its contributions', () => {
        const viewModel = build(createSnapshot())
        const resistance = viewModel.genes.find((gene) => gene.traitType === 'RESISTANCE')
        const agility = viewModel.genes.find((gene) => gene.traitType === 'AGILITY')

        expect(resistance?.prediction).toMatchObject({
            useScore: 4,
            levelContribution: 0,
            eventContribution: 4,
        })
        expect(resistance?.prediction?.reasons[0]).toContain('pelle isolante')
        expect(agility?.prediction).toMatchObject({
            useScore: 2,
            levelContribution: 2,
            eventContribution: 0,
        })
    })

    it('returns choosing status by default', () => {
        const viewModel = build(createSnapshot())

        expect(viewModel.status).toBe('choosing')
    })

    it('selects the first gene by default when no selectedGeneId is provided', () => {
        const viewModel = build(createSnapshot(), { selectedGeneId: null })

        expect(viewModel.selectedGene).not.toBeNull()
        expect(viewModel.selectedGeneId).toBe(viewModel.genes[0]?.id)
    })

    it('produces all 10 genes from valid traits', () => {
        const snapshot = createSnapshot()
        const viewModel = build(snapshot)

        expect(viewModel.genes.length).toBe(10)
        expect(viewModel.genes.map((gene) => gene.traitType)).toEqual([
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
    })

    it('keeps all 10 genes available when event has no effects', () => {
        const snapshot = createSnapshot({
            currentRoundEvent: createEvent({ id: 'NO_EFFECT_EVENT', title: 'No Effect', effects: [] }),
        })
        const viewModel = build(snapshot)

        expect(viewModel.genes.length).toBe(10)
        expect(viewModel.genes.every((gene) => gene.affinity === 'medium')).toBe(true)
    })

    it('marks snapshot as invalid when round event sequence is empty', () => {
        const snapshot = createSnapshot({
            game: createGame({ round_event_sequence: [] }),
            currentRoundEvent: null,
        })
        const viewModel = build(snapshot)

        expect(viewModel.status).toBe('invalid')
        expect(viewModel.genes.length).toBe(0)
        expect(viewModel.invalidReason).toContain('obsoleta')
    })

    it('marks snapshot as invalid when traits are incomplete', () => {
        const snapshot = createSnapshot()
        const incompleteTraits = { ...snapshot.me!.traits }
        delete (incompleteTraits as Record<string, unknown>).AGILITY
        snapshot.me!.traits = incompleteTraits as unknown as TraitCollection

        const viewModel = build(snapshot)

        expect(viewModel.status).toBe('invalid')
        expect(viewModel.genes.length).toBe(0)
    })

    it('does not show action panel state when no gene is selected', () => {
        const snapshot = createSnapshot()
        snapshot.me!.traits = null as unknown as TraitCollection
        const viewModel = build(snapshot, { selectedGeneId: null })

        expect(viewModel.selectedGene).toBeNull()
        expect(viewModel.canUse).toBe(false)
        expect(viewModel.canEvolve).toBe(false)
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
            currentRoundEvent: getRoundEventById('PROLONGED_ECLIPSE'),
        })
        const viewModel = build(snapshot)

        expect(viewModel.round.current).toBe(2)
        expect(viewModel.roundEvent.id).toBe('PROLONGED_ECLIPSE')
    })
})
