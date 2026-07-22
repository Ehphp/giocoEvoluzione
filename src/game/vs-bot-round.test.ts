import { describe, expect, it } from 'vitest'

import { createInitialTraits } from './config'
import type { TraitType } from './types'
import { ensureBotRoundAction } from './vs-bot-round'

function createStore() {
    const actions = new Map<string, { game_id: string; round_number: number; player_id: string; trait: TraitType; action_type: 'USE' | 'EVOLVE' }>()

    return {
        actions,
        async insertRoundAction(input: { gameId: string; roundNumber: number; playerId: string; trait: TraitType; actionType: 'USE' | 'EVOLVE' }) {
            const key = `${input.gameId}:${input.roundNumber}:${input.playerId}`

            if (actions.has(key)) {
                const duplicateError = new Error('duplicate') as Error & { code?: string }
                duplicateError.code = '23505'
                throw duplicateError
            }

            actions.set(key, {
                game_id: input.gameId,
                round_number: input.roundNumber,
                player_id: input.playerId,
                trait: input.trait,
                action_type: input.actionType,
            })
        },
        async getRoundAction(gameId: string, roundNumber: number, playerId: string) {
            return actions.get(`${gameId}:${roundNumber}:${playerId}`) ?? null
        },
    }
}

describe('ensureBotRoundAction', () => {
    it('creates exactly one action under concurrent calls', async () => {
        const store = createStore()
        const traits = createInitialTraits()

        const [firstAction, secondAction] = await Promise.all([
            ensureBotRoundAction(store, { gameId: 'game-1', roundNumber: 1, playerId: 'bot-1', traits, random: () => 0 }),
            ensureBotRoundAction(store, { gameId: 'game-1', roundNumber: 1, playerId: 'bot-1', traits, random: () => 0.99 }),
        ])

        expect(store.actions.size).toBe(1)
        expect(firstAction).toEqual(secondAction)
        expect(firstAction.player_id).toBe('bot-1')
    })
})