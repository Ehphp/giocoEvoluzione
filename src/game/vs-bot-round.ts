import { selectRandomBotAction } from './bot.ts'
import type { ActionType, TraitCollection, TraitType } from './types.ts'

export type BotRoundActionRecord = {
    id?: string
    game_id: string
    round_number: number
    player_id: string
    trait: TraitType
    action_type: ActionType
    created_at?: string
}

export type BotRoundActionStore = {
    insertRoundAction: (input: {
        gameId: string
        roundNumber: number
        playerId: string
        trait: TraitType
        actionType: ActionType
    }) => Promise<void>
    getRoundAction: (gameId: string, roundNumber: number, playerId: string) => Promise<BotRoundActionRecord | null>
}

export async function ensureBotRoundAction(
    store: BotRoundActionStore,
    input: {
        gameId: string
        roundNumber: number
        playerId: string
        traits: TraitCollection
        random?: () => number
    },
): Promise<BotRoundActionRecord> {
    const botAction = selectRandomBotAction(input.traits, input.random)

    try {
        await store.insertRoundAction({
            gameId: input.gameId,
            roundNumber: input.roundNumber,
            playerId: input.playerId,
            trait: botAction.trait,
            actionType: botAction.actionType,
        })
    } catch (error) {
        const maybeError = error as { code?: string; message?: string }

        if (maybeError.code !== '23505') {
            throw new Error(maybeError.message ?? 'Impossibile creare l azione del bot.')
        }
    }

    const storedAction = await store.getRoundAction(input.gameId, input.roundNumber, input.playerId)

    if (!storedAction) {
        throw new Error('Impossibile recuperare l azione del bot.')
    }

    return storedAction
}