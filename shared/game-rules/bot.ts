import { GENE_IDS } from './types.ts'
import { isGeneEvolvable, isGeneUsable } from './engine.ts'
import { TOTAL_ROUNDS } from './catalog.ts'
import type { ActionType, GeneCollection, GeneId, RoundEventDefinition } from './types.ts'

export type BotRoundAction = { trait: GeneId; actionType: ActionType }
export function getLegalBotActions(genes: GeneCollection): BotRoundAction[] {
    return GENE_IDS.flatMap((gene) => [
        ...(isGeneEvolvable(genes, gene) ? [{ trait: gene, actionType: 'EVOLVE' as const }] : []),
        ...(isGeneUsable(genes, gene) ? [{ trait: gene, actionType: 'USE' as const }] : []),
    ])
}
export function selectRandomBotAction(genes: GeneCollection, random: () => number = Math.random): BotRoundAction {
    const actions = getLegalBotActions(genes)
    if (!actions.length) throw new Error('No legal bot actions available.')
    return actions[Math.floor(random() * actions.length)] ?? actions[0]!
}

function selectBestAction(actions: BotRoundAction[], score: (action: BotRoundAction) => number, random: () => number): BotRoundAction {
    const bestScore = Math.max(...actions.map(score))
    const bestActions = actions.filter((action) => score(action) === bestScore)
    return bestActions[Math.floor(random() * bestActions.length)] ?? bestActions[0]!
}

export function selectStrategicBotAction(
    genes: GeneCollection,
    roundEvent: RoundEventDefinition,
    roundNumber: number,
    nextRoundEvent: RoundEventDefinition | null,
    random: () => number = Math.random,
): BotRoundAction {
    const actions = getLegalBotActions(genes)
    if (!actions.length) throw new Error('No legal bot actions available.')

    const evolvableActions = actions.filter((action) => action.actionType === 'EVOLVE')
    if (roundNumber < TOTAL_ROUNDS && nextRoundEvent) {
        const nextRoundBonusTwo = evolvableActions.filter((action) => nextRoundEvent.modifiers[action.trait] === 2)
        const availableBonusTwo = nextRoundBonusTwo.filter((action) => isGeneUsable(genes, action.trait))
        if (availableBonusTwo.length) return selectBestAction(availableBonusTwo, (action) => -genes[action.trait].level, random)

        if (nextRoundBonusTwo.length) {
            const availableBonusOne = evolvableActions.filter(
                (action) => nextRoundEvent.modifiers[action.trait] === 1 && isGeneUsable(genes, action.trait),
            )
            if (availableBonusOne.length) return selectBestAction(availableBonusOne, (action) => -genes[action.trait].level, random)
        }
    }

    const useValue = (action: BotRoundAction) => 1 + genes[action.trait].level + roundEvent.modifiers[action.trait]
    const positiveUseActions = actions.filter((action) => action.actionType === 'USE' && useValue(action) > 0)
    const bestUse = positiveUseActions.length ? selectBestAction(positiveUseActions, useValue, random) : null

    if (bestUse) return bestUse

    if (evolvableActions.length) {
        return selectBestAction(
            evolvableActions,
            (action) => roundEvent.modifiers[action.trait] * 10 - genes[action.trait].level,
            random,
        )
    }

    throw new Error('No positive-value bot action available.')
}
