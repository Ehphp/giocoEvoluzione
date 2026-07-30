import { ADAPTATION_IDS, type ActionType, type AdaptationCollection, type AdaptationId, type EnvironmentalCrisisDefinition } from './types.ts'
import { EVOLVE_ROUND_VALUE, MAX_ADAPTATION_LEVEL, NATURAL_ADVANTAGE, TOTAL_ROUNDS } from './catalog.ts'
import { getAdaptationRoundValue, isAdaptationEvolvable, isAdaptationUsable } from './engine.ts'

export type BotRoundAction = { trait: AdaptationId; actionType: ActionType }
export type PublicRoundHistory = { roundNumber: number; eventId: string; leftAction: BotRoundAction; rightAction: BotRoundAction; leftValue: number; rightValue: number }
export type BotDecisionContext = {
    roundNumber: number; ownScore: number; opponentScore: number
    adaptations: AdaptationCollection; publicOpponentAdaptations?: AdaptationCollection
    roundEvent: EnvironmentalCrisisDefinition; nextRoundEvent?: EnvironmentalCrisisDefinition | null
    publicHistory: readonly PublicRoundHistory[]; legalActions: readonly BotRoundAction[]
    random: () => number
}
/** Offline-only extension. Production policies never receive this object. */
export type PrivilegedBotDecisionContext = BotDecisionContext & { remainingEvents: readonly EnvironmentalCrisisDefinition[] }
export type BotDecision = BotRoundAction & { reason?: string }
export interface BotPolicy { id: string; selectAction(context: BotDecisionContext): BotDecision }
export type OfflineBotPolicy = BotPolicy & { selectPrivilegedAction?: (context: PrivilegedBotDecisionContext) => BotDecision }
export type HeuristicWeights = {
    immediateValue: number; matchup: number; level: number; conservation: number; evolution: number
    remainingRounds: number; scorePressure: number; decisiveRound: number
}
export type HeuristicActionEvaluation = { action: BotRoundAction; score: number; reason: string; components: { immediateValue: number; matchup: number; level: number; conservation: number; evolution: number; remainingRounds: number; scorePressure: number; decisiveRound: number } }
export const DEFAULT_HEURISTIC_WEIGHTS: HeuristicWeights = {
    immediateValue: 1, matchup: 1.2, level: 0.2, conservation: 0.2, evolution: 0.75,
    remainingRounds: 0.35, scorePressure: 0.45, decisiveRound: 0.8,
}

export function getUsableBotAdaptations(adaptations: AdaptationCollection): AdaptationId[] { return ADAPTATION_IDS.filter((trait) => isAdaptationUsable(adaptations, trait)) }
export function getEvolvableBotAdaptations(adaptations: AdaptationCollection): AdaptationId[] { return ADAPTATION_IDS.filter((trait) => isAdaptationEvolvable(adaptations, trait)) }
export function getLegalBotActions(adaptations: AdaptationCollection): BotRoundAction[] {
    return ADAPTATION_IDS.flatMap((trait) => [
        ...(isAdaptationEvolvable(adaptations, trait) ? [{ trait, actionType: 'EVOLVE' as const }] : []),
        ...(isAdaptationUsable(adaptations, trait) ? [{ trait, actionType: 'USE' as const }] : []),
    ])
}
export function createSeededRandom(seed: number): () => number {
    let state = (seed >>> 0) || 0x9e3779b9
    return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x1_0000_0000 }
}
export function pickSeeded<T>(items: readonly T[], random: () => number): T {
    if (!items.length) throw new Error('Cannot select from an empty collection.')
    return items[Math.min(items.length - 1, Math.floor(random() * items.length))]!
}
function estimateMatchup(trait: AdaptationId, opponent: AdaptationCollection | undefined): number {
    const plausibleUses = opponent ? getUsableBotAdaptations(opponent) : ADAPTATION_IDS
    return plausibleUses.length ? plausibleUses.filter((candidate) => NATURAL_ADVANTAGE[trait] === candidate).length / plausibleUses.length : 0
}
function best<T extends { score: number; action: BotRoundAction; reason?: string }>(items: readonly T[], random: () => number): BotDecision {
    const top = Math.max(...items.map((item) => item.score))
    const choices = items.filter((item) => Math.abs(item.score - top) < 1e-9)
    const selected = pickSeeded(choices, random)
    return { ...selected.action, reason: selected.reason }
}
export const randomPolicy: BotPolicy = { id: 'random', selectAction: (context) => ({ ...pickSeeded(context.legalActions, context.random), reason: 'Azione legale estratta con seed deterministico.' }) }
export const greedyUsePolicy: BotPolicy = { id: 'greedy-immediate-use', selectAction(context) {
    const uses = context.legalActions.filter((action) => action.actionType === 'USE')
    const candidates = uses.length ? uses : context.legalActions
    return best(candidates.map((action) => ({ action, score: action.actionType === 'USE' ? getAdaptationRoundValue(context.roundEvent, context.adaptations, action.trait) : EVOLVE_ROUND_VALUE, reason: action.actionType === 'USE' ? 'Massimizza il valore immediato.' : 'Nessun USE disponibile.' })), context.random)
} }
export const evolveFirstPolicy: BotPolicy = { id: 'evolve-first', selectAction(context) {
    const evolutions = context.legalActions.filter((action) => action.actionType === 'EVOLVE')
    if (context.roundNumber <= 2 && evolutions.length) return best(evolutions.map((action) => ({ action, score: MAX_ADAPTATION_LEVEL - context.adaptations[action.trait].level, reason: 'Investimento nei primi round.' })), context.random)
    return greedyUsePolicy.selectAction(context)
} }
/** Public, component-level explanation used by the heuristic and audit diagnostics. */
export function evaluateHeuristicAction(context: BotDecisionContext, action: BotRoundAction, weights: HeuristicWeights = DEFAULT_HEURISTIC_WEIGHTS): HeuristicActionEvaluation {
    const remaining = TOTAL_ROUNDS - context.roundNumber + 1; const behind = Math.max(0, context.opponentScore - context.ownScore); const decisive = Math.abs(context.ownScore - context.opponentScore) <= 1 && remaining <= 2 ? 1 : 0; const trait = context.adaptations[action.trait]
    if (action.actionType === 'USE') {
        const immediateValue = getAdaptationRoundValue(context.roundEvent, context.adaptations, action.trait); const matchup = estimateMatchup(action.trait, context.publicOpponentAdaptations); const conservation = context.nextRoundEvent ? getAdaptationRoundValue(context.nextRoundEvent, context.adaptations, action.trait) : immediateValue
        return { action, score: immediateValue * weights.immediateValue + matchup * weights.matchup + trait.level * weights.level - conservation * weights.conservation + behind * weights.scorePressure + decisive * weights.decisiveRound, reason: `Valore ${immediateValue}, previsione matchup e costo di consumo valutati.`, components: { immediateValue, matchup, level: trait.level, conservation: -conservation, evolution: 0, remainingRounds: 0, scorePressure: behind, decisiveRound: decisive } }
    }
    const nextLevel = Math.min(MAX_ADAPTATION_LEVEL, trait.level + 1) as typeof trait.level; const recovered = trait.exhausted ? 1 : 0; const evolution = context.nextRoundEvent ? getAdaptationRoundValue(context.nextRoundEvent, { ...context.adaptations, [action.trait]: { level: nextLevel, exhausted: false } }, action.trait) - getAdaptationRoundValue(context.nextRoundEvent, context.adaptations, action.trait) : nextLevel - trait.level; const remainingRounds = (MAX_ADAPTATION_LEVEL - trait.level + recovered) * remaining / TOTAL_ROUNDS
    return { action, score: EVOLVE_ROUND_VALUE + evolution * weights.evolution + recovered * weights.conservation + remainingRounds * weights.remainingRounds - behind * weights.scorePressure * 0.3 + decisive * weights.decisiveRound * 0.2, reason: `${recovered ? 'Recupero e ' : ''}investimento futuro ${evolution} con ${remaining} round residui.`, components: { immediateValue: EVOLVE_ROUND_VALUE, matchup: 0, level: 0, conservation: recovered, evolution, remainingRounds, scorePressure: -behind * 0.3, decisiveRound: decisive * 0.2 } }
}
export function createHeuristicPolicy(weights: HeuristicWeights = DEFAULT_HEURISTIC_WEIGHTS): BotPolicy {
    return { id: 'heuristic', selectAction(context) {
        return best(context.legalActions.map((action) => evaluateHeuristicAction(context, action, weights)), context.random)
    } }
}
export const heuristicPolicy = createHeuristicPolicy()

export type ParametricPolicyOptions = { id: string; evolveRounds?: number; evolveTrait?: AdaptationId; evolveWhen?: 'always' | 'ahead' | 'behind'; useMatchup?: boolean; evolveThreshold?: number }
export function createParametricPolicy(options: ParametricPolicyOptions): BotPolicy {
    return { id: options.id, selectAction(context) {
        const withinEvolutionWindow = options.evolveRounds === undefined ? Boolean(options.evolveWhen) : options.evolveRounds >= context.roundNumber
        const canEvolve = withinEvolutionWindow && (options.evolveWhen === 'ahead' ? context.ownScore > context.opponentScore : options.evolveWhen === 'behind' ? context.ownScore < context.opponentScore : true)
        const requested = options.evolveTrait ? context.legalActions.find((action) => action.actionType === 'EVOLVE' && action.trait === options.evolveTrait) : context.legalActions.find((action) => action.actionType === 'EVOLVE')
        const greedy = greedyUsePolicy.selectAction(context)
        if (canEvolve && requested && (options.evolveThreshold === undefined || getAdaptationRoundValue(context.roundEvent, context.adaptations, greedy.trait) <= options.evolveThreshold)) return { ...requested, reason: 'Regola parametrica di evoluzione.' }
        const uses = context.legalActions.filter((action) => action.actionType === 'USE')
        if (options.useMatchup && uses.length) return best(uses.map((action) => ({ action, score: getAdaptationRoundValue(context.roundEvent, context.adaptations, action.trait) + estimateMatchup(action.trait, context.publicOpponentAdaptations), reason: 'Regola parametrica: valore e matchup.' })), context.random)
        return greedy
    } }
}
