import { describe, expect, it } from 'vitest'
import {
    BOT_COMBAT_MUTATION_LOADOUT,
    RULE_VERSION,
    createInitialAdaptations,
    createInitialCombatMutationState,
    getRoundEventById,
    selectBotAction,
    simulateMatch,
    type BotPolicy,
} from './index.ts'
import { selectEdgeBotAction } from '../../supabase/functions/resolve-round/bot-policy.ts'
describe('bot policy', () => {
    it('does not USE an exhausted adaptation and Edge stays equivalent', () => {
        const traits = createInitialAdaptations()
        traits.SENSES.exhausted = true
        const opponent = createInitialAdaptations()
        const input = {
            adaptations: traits,
            combatMutationState: createInitialCombatMutationState(),
            combatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT,
            ruleVersion: RULE_VERSION,
            roundEvent: getRoundEventById('HEAT_SPIKE'),
            roundNumber: 1,
            publicOpponentAdaptations: opponent,
            publicOpponentCombatMutationState: createInitialCombatMutationState(),
            publicOpponentCombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT,
            random: () => 0,
        }
        const selected = selectBotAction(input)
        expect(selected).not.toEqual({ trait: 'SENSES', actionType: 'USE' })
        expect(
            selectEdgeBotAction({
                traits,
                combatMutationState: input.combatMutationState,
                combatMutationLoadout: input.combatMutationLoadout,
                ruleVersion: RULE_VERSION,
                roundEvent: input.roundEvent,
                roundNumber: 1,
                publicOpponentTraits: opponent,
                publicOpponentCombatMutationState: input.publicOpponentCombatMutationState,
                publicOpponentCombatMutationLoadout: input.publicOpponentCombatMutationLoadout,
                random: () => 0,
            }),
        ).toEqual(selected)
    })

    it('keeps Combat Mutation state in the same bot simulation path as player actions', () => {
        const evolveThenAgility: BotPolicy = {
            id: 'evolve-then-agility',
            selectAction: (context) =>
                context.roundNumber === 1
                    ? { trait: 'FEROCITY', actionType: 'EVOLVE' }
                    : context.roundNumber === 2
                      ? context.legalActions.find(
                            (candidate) => candidate.trait === 'AGILITY' && candidate.actionType === 'USE',
                        )!
                      : context.legalActions[0]!,
        }
        const respond: BotPolicy = {
            id: 'respond',
            selectAction: (context) => context.legalActions.find((candidate) => candidate.actionType === 'EVOLVE')!,
        }
        const report = simulateMatch({
            leftPolicy: evolveThenAgility,
            rightPolicy: respond,
            eventSequence: ['HEAT_SPIKE'],
            seed: 7,
            ruleVersion: RULE_VERSION,
            trace: true,
            initialState: {
                leftCombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT,
                rightCombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT,
                leftCombatMutationState: createInitialCombatMutationState(),
                rightCombatMutationState: createInitialCombatMutationState(),
            },
        })

        expect(report.trace[0]?.leftMutationEffects).toEqual([{ id: 'ADAPTIVE_CORE', effect: 'CORE_ARMED' }])
        expect(report.trace[1]?.leftBreakdown.mutationBonus).toBe(1)
        expect(report.trace[1]?.leftMutationEffects).toEqual(
            expect.arrayContaining([
                { id: 'ADAPTIVE_CORE', effect: 'ROUND_VALUE_BONUS', value: 1 },
                { id: 'ELASTIC_LIMBS', effect: 'AGILITY_PRESERVED' },
            ]),
        )
    })
})
