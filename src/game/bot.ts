import { TRAITS } from './types.ts'
import type { ActionType, TraitCollection, TraitType } from './types.ts'

export type BotRoundAction = {
    trait: TraitType
    actionType: ActionType
}

export function getLegalBotActions(traits: TraitCollection): BotRoundAction[] {
    const actions: BotRoundAction[] = []

    for (const trait of TRAITS) {
        actions.push({ trait, actionType: 'EVOLVE' })

        if (traits[trait].cooldown === 0) {
            actions.push({ trait, actionType: 'USE' })
        }
    }

    return actions
}

export function selectRandomBotAction(traits: TraitCollection, random: () => number = Math.random): BotRoundAction {
    const legalActions = getLegalBotActions(traits)

    if (legalActions.length === 0) {
        throw new Error('No legal bot actions available.')
    }

    const index = Math.floor(random() * legalActions.length)

    return legalActions[index] ?? legalActions[0]
}