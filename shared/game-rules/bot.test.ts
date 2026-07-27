import { describe, expect, it } from 'vitest'
import { selectEdgeBotAction } from '../../supabase/functions/resolve-round/bot-policy.ts'
import { selectBotAction } from './bot.ts'
import { createInitialGenes, getRoundEventById } from './state.ts'
import { ensureBotRoundAction } from './vs-bot-round.ts'
import type { BotRoundActionRecord } from './vs-bot-round.ts'

function scriptedRandom(...values: number[]) {
    let call = 0
    return () => values[call++] ?? 0
}

describe('bot action policy', () => {
    it('chooses EVOLVE below the 25% threshold in rounds 1-4', () => {
        const action = selectBotAction({ traits: createInitialGenes(), roundEvent: getRoundEventById('HEAT_SPIKE'), roundNumber: 1, random: scriptedRandom(0.24, 0) })
        expect(action.actionType).toBe('EVOLVE')
    })

    it('chooses USE above the 25% threshold in rounds 1-4', () => {
        const action = selectBotAction({ traits: createInitialGenes(), roundEvent: getRoundEventById('HEAT_SPIKE'), roundNumber: 4, random: scriptedRandom(0.25, 0) })
        expect(action).toEqual({ trait: 'METABOLISM', actionType: 'USE' })
    })

    it('uses the 10% EVOLVE threshold in round 5', () => {
        const evolveAction = selectBotAction({ traits: createInitialGenes(), roundEvent: getRoundEventById('HEAT_SPIKE'), roundNumber: 5, random: scriptedRandom(0.09, 0) })
        const useAction = selectBotAction({ traits: createInitialGenes(), roundEvent: getRoundEventById('HEAT_SPIKE'), roundNumber: 5, random: scriptedRandom(0.10, 0) })
        expect(evolveAction.actionType).toBe('EVOLVE')
        expect(useAction.actionType).toBe('USE')
    })

    it('never chooses EVOLVE in round 6', () => {
        const action = selectBotAction({ traits: createInitialGenes(), roundEvent: getRoundEventById('HEAT_SPIKE'), roundNumber: 6, random: scriptedRandom(0, 0) })
        expect(action).toEqual({ trait: 'METABOLISM', actionType: 'USE' })
    })

    it('uses the usable gene with the highest current round value', () => {
        const action = selectBotAction({ traits: createInitialGenes(), roundEvent: getRoundEventById('HEAT_SPIKE'), roundNumber: 1, random: scriptedRandom(0.5, 0) })
        expect(action).toEqual({ trait: 'METABOLISM', actionType: 'USE' })
    })

    it('excludes a cooling-down gene even when it would have the highest value', () => {
        const traits = createInitialGenes()
        traits.METABOLISM.cooldown = 1
        const action = selectBotAction({ traits, roundEvent: getRoundEventById('HEAT_SPIKE'), roundNumber: 1, random: scriptedRandom(0.5, 0) })
        expect(action).toEqual({ trait: 'SENSES', actionType: 'USE' })
    })

    it('uses injected random selection among equally valuable usable genes', () => {
        const traits = createInitialGenes()
        for (const trait of Object.values(traits)) trait.level = 0
        let calls = 0
        const random = () => [0.5, 0.8][calls++] ?? 0
        const roundEvent = { ...getRoundEventById('HEAT_SPIKE'), modifiers: { RESILIENCE: 0, MOBILITY: 0, SENSES: 0, METABOLISM: 0, AQUATIC: 0 }, effects: [] }
        const action = selectBotAction({ traits, roundEvent, roundNumber: 1, random })
        expect(action).toEqual({ trait: 'AQUATIC', actionType: 'USE' })
        expect(calls).toBe(2)
    })

    it('uses the least-negative trait when every usable score is negative', () => {
        const traits = createInitialGenes()
        for (const trait of Object.values(traits)) trait.level = 0
        const roundEvent = {
            ...getRoundEventById('HEAT_SPIKE'),
            modifiers: { RESILIENCE: -6, MOBILITY: -5, SENSES: -4, METABOLISM: -3, AQUATIC: -2 },
            effects: [],
        }
        const action = selectBotAction({ traits, roundEvent, roundNumber: 1, random: scriptedRandom(0.5, 0) })
        expect(action).toEqual({ trait: 'AQUATIC', actionType: 'USE' })
    })

    it('does not evolve a gene at its maximum level', () => {
        const traits = createInitialGenes()
        traits.RESILIENCE.level = 3
        const action = selectBotAction({ traits, roundEvent: getRoundEventById('HEAT_SPIKE'), roundNumber: 1, random: scriptedRandom(0.1, 0) })
        expect(action).toEqual({ trait: 'MOBILITY', actionType: 'EVOLVE' })
    })

    it('falls back to EVOLVE when every gene is on cooldown', () => {
        const traits = createInitialGenes()
        for (const trait of Object.values(traits)) trait.cooldown = 1
        const action = selectBotAction({ traits, roundEvent: getRoundEventById('HEAT_SPIKE'), roundNumber: 1, random: scriptedRandom(0.5, 0.8) })
        expect(action).toEqual({ trait: 'AQUATIC', actionType: 'EVOLVE' })
    })

    it('falls back to the best USE when no gene can evolve', () => {
        const traits = createInitialGenes()
        for (const trait of Object.values(traits)) trait.level = 3
        const action = selectBotAction({ traits, roundEvent: getRoundEventById('HEAT_SPIKE'), roundNumber: 1, random: scriptedRandom(0.1, 0) })
        expect(action).toEqual({ trait: 'METABOLISM', actionType: 'USE' })
    })

    it('throws explicitly when no action is legal', () => {
        const traits = createInitialGenes()
        for (const trait of Object.values(traits)) {
            trait.level = 3
            trait.cooldown = 1
        }
        expect(() => selectBotAction({ traits, roundEvent: getRoundEventById('HEAT_SPIKE'), roundNumber: 1, random: () => 0 })).toThrow(/no legal bot actions/i)
    })

    it('creates one stored action when ensureBotRoundAction is called concurrently', async () => {
        let storedAction: BotRoundActionRecord | null = null
        const store = {
            insertRoundAction: async (input: { gameId: string; roundNumber: number; playerId: string; trait: BotRoundActionRecord['trait']; actionType: BotRoundActionRecord['action_type'] }) => {
                await Promise.resolve()
                if (storedAction) {
                    throw { code: '23505', message: 'duplicate action' }
                }
                storedAction = { id: 'action-1', game_id: input.gameId, round_number: input.roundNumber, player_id: input.playerId, trait: input.trait, action_type: input.actionType }
            },
            getRoundAction: async () => storedAction,
        }
        const input = { gameId: 'game-1', roundNumber: 1, playerId: 'bot-1', traits: createInitialGenes(), roundEvent: getRoundEventById('HEAT_SPIKE'), random: scriptedRandom(0.5, 0) }
        const [first, second] = await Promise.all([ensureBotRoundAction(store, input), ensureBotRoundAction(store, input)])
        expect(first).toEqual(second)
        expect(storedAction).toEqual(first)
    })

    it('keeps the local Edge policy equivalent to the shared policy', () => {
        const cases = [
            { traits: createInitialGenes(), roundEvent: getRoundEventById('HEAT_SPIKE'), roundNumber: 1, randomValues: [0.1, 0.6] },
            { traits: createInitialGenes(), roundEvent: getRoundEventById('HEAT_SPIKE'), roundNumber: 5, randomValues: [0.5, 0] },
            { traits: createInitialGenes(), roundEvent: getRoundEventById('FLASH_FLOOD'), roundNumber: 6, randomValues: [0, 0] },
        ]
        cases[2]!.traits.AQUATIC.cooldown = 1

        for (const testCase of cases) {
            expect(selectEdgeBotAction({ ...testCase, random: scriptedRandom(...testCase.randomValues) })).toEqual(
                selectBotAction({ ...testCase, random: scriptedRandom(...testCase.randomValues) }),
            )
        }
    })
})
