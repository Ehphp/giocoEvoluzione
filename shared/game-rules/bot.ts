import { GENE_IDS } from './types.ts'
import { isGeneEvolvable, isGeneUsable } from './engine.ts'
import type { ActionType, GeneCollection, GeneId } from './types.ts'

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
