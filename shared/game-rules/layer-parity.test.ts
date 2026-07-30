import { describe, expect, it } from 'vitest'

import { buildGeneSelectionV2ViewModel } from '../../src/components/game-v2/controller/buildGeneSelectionV2ViewModel.ts'
import { getValidatedTraitUseBreakdown } from '../../src/game/scoring.ts'
import { getWorldById } from '../../src/game/worlds.ts'
import type { GameRecord, GameSnapshot, PlayerRecord, RoundResultRecord } from '../../src/lib/game-api.ts'
import { resolveEdgeRound } from '../../supabase/functions/resolve-round/round-domain.ts'
import {
    ADAPTATION_IDS,
    buildPersistedRoundResolution,
    createInitialAdaptations,
    getNaturalAdvantageBonus,
    getValidatedActionBreakdown,
    resolveRound,
    type AdaptationCollection,
    type AdaptationId,
    type AdaptationLevel,
    type EnvironmentalCrisisDefinition,
    type PlayerRoundAction,
    type StoredRoundValue,
} from './index.ts'

function eventWith(modifiers: Partial<Record<AdaptationId, 0 | 1 | 2>> = {}): EnvironmentalCrisisDefinition {
    const valueFor = (trait: AdaptationId): 0 | 1 | 2 => modifiers[trait] ?? 0
    return {
        id: 'PARITY_ORACLE',
        title: 'Parity oracle',
        shortDescription: 'Deterministic cross-layer oracle.',
        category: 'ECOLOGICAL',
        artKey: 'audit',
        tags: [],
        modifiers: {
            FEROCITY: valueFor('FEROCITY'),
            ARMOR: valueFor('ARMOR'),
            AGILITY: valueFor('AGILITY'),
            SENSES: valueFor('SENSES'),
            CAMOUFLAGE: valueFor('CAMOUFLAGE'),
        },
        effects: ADAPTATION_IDS.map((trait) => ({
            trait,
            modifier: valueFor(trait),
            reason: 'Parity oracle.',
        })),
    }
}

const action = (playerId: string, trait: AdaptationId, actionType: 'USE' | 'EVOLVE'): PlayerRoundAction => ({ playerId, trait, actionType })

function withState(trait: AdaptationId, level: AdaptationLevel, exhausted: boolean): AdaptationCollection {
    const adaptations = createInitialAdaptations()
    adaptations[trait] = { level, exhausted }
    return adaptations
}

type OracleScenario = {
    name: string
    roundNumber: number
    roundEvent: EnvironmentalCrisisDefinition
    player1Traits: AdaptationCollection
    player2Traits: AdaptationCollection
    player1Action: PlayerRoundAction
    player2Action: PlayerRoundAction
    player1Score: number
    player2Score: number
    priorRoundValues: StoredRoundValue[]
    expectedValues: [number, number]
    expectedWinner: string | null
    expectedStatus: 'REVEALING' | 'FINISHED'
    expectedEndReason: 'CLINCH' | 'ROUND_VALUE_TIEBREAK' | null
}

function oracleScenarios(): OracleScenario[] {
    return [
        {
            name: '1. level 0, affinity 0, no matchup',
            roundNumber: 1,
            roundEvent: eventWith(),
            player1Traits: withState('FEROCITY', 0, false),
            player2Traits: createInitialAdaptations(),
            player1Action: action('p1', 'FEROCITY', 'USE'),
            player2Action: action('p2', 'AGILITY', 'USE'),
            player1Score: 0,
            player2Score: 0,
            priorRoundValues: [],
            expectedValues: [2, 2],
            expectedWinner: null,
            expectedStatus: 'REVEALING',
            expectedEndReason: null,
        },
        {
            name: '2. level 2, affinity 2, no matchup',
            roundNumber: 1,
            roundEvent: eventWith({ FEROCITY: 2 }),
            player1Traits: withState('FEROCITY', 2, false),
            player2Traits: createInitialAdaptations(),
            player1Action: action('p1', 'FEROCITY', 'USE'),
            player2Action: action('p2', 'AGILITY', 'EVOLVE'),
            player1Score: 0,
            player2Score: 0,
            priorRoundValues: [],
            expectedValues: [6, 1],
            expectedWinner: 'p1',
            expectedStatus: 'REVEALING',
            expectedEndReason: null,
        },
        {
            name: '3. level 0, affinity 0, matchup',
            roundNumber: 1,
            roundEvent: eventWith(),
            player1Traits: withState('FEROCITY', 0, false),
            player2Traits: createInitialAdaptations(),
            player1Action: action('p1', 'FEROCITY', 'USE'),
            player2Action: action('p2', 'ARMOR', 'USE'),
            player1Score: 0,
            player2Score: 0,
            priorRoundValues: [],
            expectedValues: [4, 2],
            expectedWinner: 'p1',
            expectedStatus: 'REVEALING',
            expectedEndReason: null,
        },
        {
            name: '4. level 2, affinity 2, matchup',
            roundNumber: 1,
            roundEvent: eventWith({ FEROCITY: 2 }),
            player1Traits: withState('FEROCITY', 2, false),
            player2Traits: createInitialAdaptations(),
            player1Action: action('p1', 'FEROCITY', 'USE'),
            player2Action: action('p2', 'ARMOR', 'USE'),
            player1Score: 0,
            player2Score: 0,
            priorRoundValues: [],
            expectedValues: [8, 2],
            expectedWinner: 'p1',
            expectedStatus: 'REVEALING',
            expectedEndReason: null,
        },
        {
            name: '5. double EVOLVE',
            roundNumber: 1,
            roundEvent: eventWith({ FEROCITY: 2, ARMOR: 2 }),
            player1Traits: createInitialAdaptations(),
            player2Traits: createInitialAdaptations(),
            player1Action: action('p1', 'FEROCITY', 'EVOLVE'),
            player2Action: action('p2', 'ARMOR', 'EVOLVE'),
            player1Score: 0,
            player2Score: 0,
            priorRoundValues: [],
            expectedValues: [1, 1],
            expectedWinner: null,
            expectedStatus: 'REVEALING',
            expectedEndReason: null,
        },
        {
            name: '6. minimum USE against EVOLVE',
            roundNumber: 1,
            roundEvent: eventWith(),
            player1Traits: createInitialAdaptations(),
            player2Traits: createInitialAdaptations(),
            player1Action: action('p1', 'FEROCITY', 'USE'),
            player2Action: action('p2', 'ARMOR', 'EVOLVE'),
            player1Score: 0,
            player2Score: 0,
            priorRoundValues: [],
            expectedValues: [2, 1],
            expectedWinner: 'p1',
            expectedStatus: 'REVEALING',
            expectedEndReason: null,
        },
        {
            name: '7. matchup overturns environmental difference',
            roundNumber: 1,
            roundEvent: eventWith({ ARMOR: 1 }),
            player1Traits: createInitialAdaptations(),
            player2Traits: createInitialAdaptations(),
            player1Action: action('p1', 'FEROCITY', 'USE'),
            player2Action: action('p2', 'ARMOR', 'USE'),
            player1Score: 0,
            player2Score: 0,
            priorRoundValues: [],
            expectedValues: [4, 3],
            expectedWinner: 'p1',
            expectedStatus: 'REVEALING',
            expectedEndReason: null,
        },
        {
            name: '8. exhausted gene recovers below max level',
            roundNumber: 2,
            roundEvent: eventWith({ FEROCITY: 2 }),
            player1Traits: withState('FEROCITY', 0, true),
            player2Traits: createInitialAdaptations(),
            player1Action: action('p1', 'FEROCITY', 'EVOLVE'),
            player2Action: action('p2', 'ARMOR', 'USE'),
            player1Score: 0,
            player2Score: 0,
            priorRoundValues: [{ player1Value: 2, player2Value: 2 }],
            expectedValues: [1, 2],
            expectedWinner: 'p2',
            expectedStatus: 'REVEALING',
            expectedEndReason: null,
        },
        {
            name: '9. exhausted max-level gene recovers',
            roundNumber: 3,
            roundEvent: eventWith({ FEROCITY: 2 }),
            player1Traits: withState('FEROCITY', 2, true),
            player2Traits: createInitialAdaptations(),
            player1Action: action('p1', 'FEROCITY', 'EVOLVE'),
            player2Action: action('p2', 'ARMOR', 'USE'),
            player1Score: 0,
            player2Score: 1,
            priorRoundValues: [
                { player1Value: 2, player2Value: 2 },
                { player1Value: 1, player2Value: 2 },
            ],
            expectedValues: [1, 2],
            expectedWinner: 'p2',
            expectedStatus: 'REVEALING',
            expectedEndReason: null,
        },
        {
            name: '11. fourth win clinches the match',
            roundNumber: 4,
            roundEvent: eventWith(),
            player1Traits: createInitialAdaptations(),
            player2Traits: createInitialAdaptations(),
            player1Action: action('p1', 'FEROCITY', 'USE'),
            player2Action: action('p2', 'ARMOR', 'EVOLVE'),
            player1Score: 3,
            player2Score: 0,
            priorRoundValues: [
                { player1Value: 2, player2Value: 1 },
                { player1Value: 3, player2Value: 1 },
                { player1Value: 4, player2Value: 1 },
            ],
            expectedValues: [2, 1],
            expectedWinner: 'p1',
            expectedStatus: 'FINISHED',
            expectedEndReason: 'CLINCH',
        },
        {
            name: '12. seventh-round stored-value tiebreak',
            roundNumber: 7,
            roundEvent: eventWith(),
            player1Traits: createInitialAdaptations(),
            player2Traits: createInitialAdaptations(),
            player1Action: action('p1', 'FEROCITY', 'EVOLVE'),
            player2Action: action('p2', 'ARMOR', 'EVOLVE'),
            player1Score: 3,
            player2Score: 3,
            priorRoundValues: [
                { player1Value: 2, player2Value: 1 },
                { player1Value: 1, player2Value: 2 },
                { player1Value: 4, player2Value: 2 },
                { player1Value: 2, player2Value: 4 },
                { player1Value: 3, player2Value: 2 },
                { player1Value: 2, player2Value: 2 },
            ],
            expectedValues: [1, 1],
            expectedWinner: null,
            expectedStatus: 'FINISHED',
            expectedEndReason: 'ROUND_VALUE_TIEBREAK',
        },
    ]
}

function snapshotFor(scenario: OracleScenario): GameSnapshot {
    const me: PlayerRecord = {
        id: 'p1',
        game_id: 'game',
        nickname: 'Player 1',
        slot: 1,
        player_type: 'HUMAN',
        traits: scenario.player1Traits,
        connected: true,
        created_at: '2026-07-30T10:00:00.000Z',
    }
    const opponent: PlayerRecord = {
        id: 'p2',
        game_id: 'game',
        nickname: 'Player 2',
        slot: 2,
        player_type: 'HUMAN',
        traits: scenario.player2Traits,
        connected: true,
        created_at: '2026-07-30T10:00:00.000Z',
    }
    const game: GameRecord = {
        id: 'game',
        room_code: 'ORACLE',
        game_mode: 'PVP',
        bot_difficulty: 'NORMAL',
        status: 'CHOOSING',
        current_round: scenario.roundNumber,
        world_id: 'AURELIA_PRIME',
        round_event_sequence: Array.from({ length: 7 }, () => scenario.roundEvent.id),
        player_1_id: 'p1',
        player_2_id: 'p2',
        player_1_score: scenario.player1Score,
        player_2_score: scenario.player2Score,
        winner_id: null,
        started_at: '2026-07-30T10:00:00.000Z',
        finished_at: null,
        rematch_count: 0,
        created_at: '2026-07-30T10:00:00.000Z',
        updated_at: '2026-07-30T10:00:00.000Z',
    }
    const roundResults: RoundResultRecord[] = scenario.priorRoundValues.map((value, index) => ({
        id: `result-${index + 1}`,
        game_id: 'game',
        round_number: index + 1,
        player_1_value: value.player1Value,
        player_2_value: value.player2Value,
        winner_id: null,
        resolution_data: {},
        created_at: '2026-07-30T10:00:00.000Z',
    }))
    return {
        game,
        players: [me, opponent],
        me,
        opponent,
        world: getWorldById('AURELIA_PRIME'),
        currentRoundEvent: scenario.roundEvent,
        nextRoundEvent: null,
        actionsSubmitted: 0,
        myCurrentAction: null,
        currentRoundResult: null,
        roundResults,
    }
}

function buildFrontendModel(scenario: OracleScenario) {
    return buildGeneSelectionV2ViewModel({
        snapshot: snapshotFor(scenario),
        myScore: scenario.player1Score,
        opponentScore: scenario.player2Score,
        selectedGeneId: scenario.player1Action.trait,
        selectedAction: scenario.player1Action.actionType,
        isSubmitting: false,
        submitErrorMessage: null,
        hasLocalSubmittedAction: false,
        localSubmittedAction: null,
    })
}

describe('deterministic cross-layer oracle', () => {
    it.each(oracleScenarios())('$name', (scenario) => {
        const player1Matchup = getNaturalAdvantageBonus(scenario.player1Action, scenario.player2Action)
        const player2Matchup = getNaturalAdvantageBonus(scenario.player2Action, scenario.player1Action)
        const player1Scoring = getValidatedActionBreakdown(
            scenario.roundEvent,
            scenario.player1Traits,
            scenario.player1Action.trait,
            scenario.player1Action.actionType,
            player1Matchup,
        )
        const player2Scoring = getValidatedActionBreakdown(
            scenario.roundEvent,
            scenario.player2Traits,
            scenario.player2Action.trait,
            scenario.player2Action.actionType,
            player2Matchup,
        )
        const roundInput = {
            roundNumber: scenario.roundNumber,
            roundEvent: scenario.roundEvent,
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: scenario.player1Traits,
            player2Traits: scenario.player2Traits,
            player1Action: scenario.player1Action,
            player2Action: scenario.player2Action,
        }
        const engine = resolveRound(roundInput)
        const persistedInput = {
            ...roundInput,
            player1Score: scenario.player1Score,
            player2Score: scenario.player2Score,
            priorRoundValues: scenario.priorRoundValues,
            startedAt: '2026-07-30T10:00:00.000Z',
            now: () => '2026-07-30T10:00:05.000Z',
        }
        const persisted = buildPersistedRoundResolution(persistedInput)
        const edge = resolveEdgeRound(persistedInput)
        const frontend = buildFrontendModel(scenario)
        const frontendPreview = getValidatedTraitUseBreakdown(
            scenario.roundEvent,
            scenario.player1Traits,
            scenario.player1Action.trait,
        )

        expect([player1Scoring.total, player2Scoring.total]).toEqual(scenario.expectedValues)
        expect([engine.player1.roundValue, engine.player2.roundValue]).toEqual(scenario.expectedValues)
        expect(engine.player1.breakdown).toEqual(player1Scoring)
        expect(engine.player2.breakdown).toEqual(player2Scoring)
        expect(engine.winnerId).toBe(scenario.expectedWinner)
        expect(engine.awardedPoints).toBe(engine.winnerId ? 1 : 0)
        expect(persisted.player_1_value).toBe(engine.player1.roundValue)
        expect(persisted.player_2_value).toBe(engine.player2.roundValue)
        expect(persisted.winner_id).toBe(engine.winnerId)
        expect(persisted.resolution_data.player1Breakdown).toEqual(engine.player1.breakdown)
        expect(persisted.resolution_data.player2Breakdown).toEqual(engine.player2.breakdown)
        expect(persisted.resolution_data.player1TraitsAfter).toEqual(engine.player1.traits)
        expect(persisted.resolution_data.player2TraitsAfter).toEqual(engine.player2.traits)
        expect(persisted.resolution_data.statusAfter).toBe(scenario.expectedStatus)
        expect(persisted.resolution_data.matchEndReason).toBe(scenario.expectedEndReason)
        expect(edge).toEqual(persisted)
        expect(frontend.selectedGene?.prediction).toMatchObject({
            useScore: frontendPreview.total,
            baseContribution: frontendPreview.baseContribution,
            levelContribution: frontendPreview.levelContribution,
            eventModifier: frontendPreview.eventModifier,
        })
        if (scenario.player1Action.actionType === 'USE') {
            expect(frontend.selectedGene?.prediction?.useScore).toBe(player1Scoring.total - player1Scoring.matchupBonus)
        } else {
            expect(player1Scoring.total).toBe(1)
        }
        expect(frontend.canUse).toBe(!scenario.player1Traits[scenario.player1Action.trait].exhausted)
        expect(frontend.canEvolve).toBe(
            scenario.player1Traits[scenario.player1Action.trait].level < 2
            || scenario.player1Traits[scenario.player1Action.trait].exhausted,
        )
    })

    it('10. rejects available max-level EVOLVE in engine, persistence, and Edge while the frontend disables it', () => {
        const scenario: OracleScenario = {
            name: '10. available max-level EVOLVE is illegal',
            roundNumber: 1,
            roundEvent: eventWith(),
            player1Traits: withState('FEROCITY', 2, false),
            player2Traits: createInitialAdaptations(),
            player1Action: action('p1', 'FEROCITY', 'EVOLVE'),
            player2Action: action('p2', 'ARMOR', 'EVOLVE'),
            player1Score: 0,
            player2Score: 0,
            priorRoundValues: [],
            expectedValues: [1, 1],
            expectedWinner: null,
            expectedStatus: 'REVEALING',
            expectedEndReason: null,
        }
        const roundInput = {
            roundNumber: scenario.roundNumber,
            roundEvent: scenario.roundEvent,
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: scenario.player1Traits,
            player2Traits: scenario.player2Traits,
            player1Action: scenario.player1Action,
            player2Action: scenario.player2Action,
        }
        const persistedInput = {
            ...roundInput,
            player1Score: 0,
            player2Score: 0,
            priorRoundValues: [],
            startedAt: null,
        }
        const frontend = buildFrontendModel(scenario)

        expect(getValidatedActionBreakdown(
            scenario.roundEvent,
            scenario.player1Traits,
            scenario.player1Action.trait,
            'EVOLVE',
        ).total).toBe(1)
        expect(frontend.canEvolve).toBe(false)
        expect(() => resolveRound(roundInput)).toThrow('no transition')
        expect(() => buildPersistedRoundResolution(persistedInput)).toThrow('no transition')
        expect(() => resolveEdgeRound(persistedInput)).toThrow('no transition')
    })
})
