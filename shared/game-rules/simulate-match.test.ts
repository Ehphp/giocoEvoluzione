import { describe, expect, it } from 'vitest'
import { BOT_COMBAT_MUTATION_LOADOUT, RULE_VERSION, createInitialAdaptations, createInitialCombatMutationState, createLookaheadPolicy, createSeededRandom, evolveFirstPolicy, getLegalBotActions, getRoundEventById, greedyUsePolicy, heuristicPolicy, lookaheadPolicy, randomPolicy, resolveRound, simulateMatch, type BotDecisionContext, type BotPolicy, type SimulateMatchInput } from './index.ts'

const events = ['VOLCANIC_ASH_WAVE', 'PROLONGED_ECLIPSE', 'PREDATOR_PACK_MIGRATION', 'HEAT_SPIKE', 'NUTRIENT_COLLAPSE', 'FLASH_FLOOD', 'VOLCANIC_ASH_WAVE']
const context = (_policy: BotPolicy): BotDecisionContext => ({ roundNumber: 1, ownScore: 0, opponentScore: 0, ruleVersion: RULE_VERSION, adaptations: createInitialAdaptations(), combatMutationState: createInitialCombatMutationState(), combatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT, publicOpponentAdaptations: createInitialAdaptations(), publicOpponentCombatMutationState: createInitialCombatMutationState(), publicOpponentCombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT, roundEvent: getRoundEventById(events[0]!), nextRoundEvent: getRoundEventById(events[1]!), publicHistory: [], legalActions: getLegalBotActions(createInitialAdaptations()), random: createSeededRandom(44) })
const initialMutations = () => ({ leftCombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT, rightCombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT, leftCombatMutationState: createInitialCombatMutationState(), rightCombatMutationState: createInitialCombatMutationState() })
function runSimulation(input: Omit<SimulateMatchInput, 'ruleVersion' | 'initialState'> & { initialState?: Partial<SimulateMatchInput['initialState']> }) {
    return simulateMatch({ ...input, ruleVersion: RULE_VERSION, initialState: { ...initialMutations(), ...input.initialState } })
}

describe('deterministic policy simulation', () => {
    it('all shipped policies choose legal actions from public context only', () => {
        for (const policy of [randomPolicy, greedyUsePolicy, evolveFirstPolicy, heuristicPolicy, lookaheadPolicy]) {
            const input = context(policy); const action = policy.selectAction(input)
            expect(input.legalActions).toContainEqual({ trait: action.trait, actionType: action.actionType })
            expect('opponentAction' in input).toBe(false)
        }
    })
    it('is deterministic for the same seed and never mutates its initial state', () => {
        const initial = createInitialAdaptations(); initial.FEROCITY.level = 1
        const input = { leftPolicy: heuristicPolicy, rightPolicy: greedyUsePolicy, eventSequence: events, seed: 12345, initialState: { leftAdaptations: initial }, trace: true }
        const first = runSimulation(input); const second = runSimulation(input)
        expect(second).toEqual(first); expect(initial.FEROCITY).toEqual({ level: 1, exhausted: false })
    })
    it('uses production exhaustion, evolution and matchup resolution in its trace', () => {
        const evolve: BotPolicy = { id: 'evolve-ferocity', selectAction: (input) => input.roundNumber === 1 ? { trait: 'FEROCITY', actionType: 'EVOLVE' } : input.legalActions.find((action) => action.trait === 'FEROCITY' && action.actionType === 'USE') ?? input.legalActions[0]! }
        const useArmor: BotPolicy = { id: 'use-armor', selectAction: (input) => input.roundNumber === 1 ? { trait: 'ARMOR', actionType: 'EVOLVE' } : input.legalActions.find((action) => action.trait === 'ARMOR' && action.actionType === 'USE') ?? input.legalActions[0]! }
        const report = runSimulation({ leftPolicy: evolve, rightPolicy: useArmor, eventSequence: events, seed: 1, trace: true })
        expect(report.trace[0]?.leftAction.actionType).toBe('EVOLVE'); expect(report.trace[1]?.leftBreakdown.levelContribution).toBe(1)
        expect(report.trace[1]?.leftBreakdown.matchupBonus).toBeGreaterThan(0); expect(report.trace[1]?.leftValue).toBeGreaterThan(report.trace[1]?.rightValue)
    })
    it('resolves a simultaneous round symmetrically when players and actions are swapped', () => {
        const event = getRoundEventById('HEAT_SPIKE'); const leftTraits = createInitialAdaptations(); leftTraits.SENSES.level = 1; const rightTraits = createInitialAdaptations(); rightTraits.FEROCITY.level = 1
        const forward = resolveRound({ roundNumber: 2, roundEvent: event, player1Id: 'left', player2Id: 'right', player1Traits: leftTraits, player2Traits: rightTraits, ruleVersion: RULE_VERSION, player1CombatMutationState: createInitialCombatMutationState(), player2CombatMutationState: createInitialCombatMutationState(), player1CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT, player2CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT, player1Action: { playerId: 'left', trait: 'SENSES', actionType: 'USE' }, player2Action: { playerId: 'right', trait: 'FEROCITY', actionType: 'USE' } })
        const swapped = resolveRound({ roundNumber: 2, roundEvent: event, player1Id: 'right', player2Id: 'left', player1Traits: rightTraits, player2Traits: leftTraits, ruleVersion: RULE_VERSION, player1CombatMutationState: createInitialCombatMutationState(), player2CombatMutationState: createInitialCombatMutationState(), player1CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT, player2CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT, player1Action: { playerId: 'right', trait: 'FEROCITY', actionType: 'USE' }, player2Action: { playerId: 'left', trait: 'SENSES', actionType: 'USE' } })
        expect(swapped.player1.roundValue).toBe(forward.player2.roundValue); expect(swapped.player2.roundValue).toBe(forward.player1.roundValue)
        expect(swapped.player1.breakdown).toEqual(forward.player2.breakdown); expect(swapped.player2.breakdown).toEqual(forward.player1.breakdown)
        expect(swapped.winnerId).toBe(forward.winnerId)
    })
    it('produces a mirror match after swapping policies while preserving each policy stream', () => {
        const forward = runSimulation({ leftPolicy: randomPolicy, rightPolicy: heuristicPolicy, eventSequence: events, seed: 777, trace: true })
        const swapped = runSimulation({ leftPolicy: heuristicPolicy, rightPolicy: randomPolicy, eventSequence: events, seed: 777, trace: true })
        expect(swapped.finalScore).toEqual({ left: forward.finalScore.right, right: forward.finalScore.left })
        expect(swapped.winner === null ? null : swapped.winner === 'left' ? 'right' : 'left').toBe(forward.winner)
        expect(swapped.trace.map((round) => [round.rightAction, round.leftAction])).toEqual(forward.trace.map((round) => [round.leftAction, round.rightAction]))
    })
    it('lookahead evaluates without changing the caller state and reports cache statistics', () => {
        const stats = { statesVisited: 0, cacheHits: 0, cacheMisses: 0 }; const policy = createLookaheadPolicy({ depth: 2, stats }); const adaptations = createInitialAdaptations(); const input = context(policy); input.adaptations = adaptations
        policy.selectAction(input); expect(adaptations).toEqual(createInitialAdaptations()); expect(stats.cacheMisses).toBeGreaterThan(0)
    })
    it('mutation-aware heuristic and lookahead beat random across a deterministic fixture', () => {
        const score = (left: BotPolicy, right: BotPolicy) => Array.from({ length: 8 }, (_, index) => runSimulation({ leftPolicy: index % 2 ? right : left, rightPolicy: index % 2 ? left : right, eventSequence: events, seed: index + 90 })).reduce((total, match, index) => total + (match.winner === (index % 2 ? 'right' : 'left') ? 1 : match.winner ? -1 : 0), 0)
        expect(score(heuristicPolicy, randomPolicy)).toBeGreaterThan(3); expect(score(lookaheadPolicy, heuristicPolicy)).toBeGreaterThanOrEqual(-1)
    })
})
