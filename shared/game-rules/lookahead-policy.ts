import { TOTAL_ROUNDS } from './catalog.ts'
import { getAdaptationRoundValue, resolveRound } from './engine.ts'
import { getLegalBotActions, pickSeeded, type BotDecision, type BotDecisionContext, type OfflineBotPolicy, type BotRoundAction, type PrivilegedBotDecisionContext } from './bot-policies.ts'
import type { AdaptationCollection, EnvironmentalCrisisDefinition } from './types.ts'

export type EvaluationBreakdown = { terminal: number; score: number; levels: number; available: number; cooldown: number; matchupPotential: number; remaining: number; total: number }
export type LookaheadStats = { statesVisited: number; cacheHits: number; cacheMisses: number }
export type LookaheadOptions = { depth?: number; stats?: LookaheadStats; fullSearchLastRounds?: number; id?: string }
type SearchState = { own: AdaptationCollection; rival: AdaptationCollection; ownScore: number; rivalScore: number; round: number }
function canonical(adaptations: AdaptationCollection): string { return Object.values(adaptations).map((state) => `${state.level}:${state.cooldown}`).join(',') }
function clone(adaptations: AdaptationCollection): AdaptationCollection { return Object.fromEntries(Object.entries(adaptations).map(([key, value]) => [key, { ...value }])) as AdaptationCollection }
/** Keeps exhaustive root choices, while bounding only future opponent hypotheses. */
function plausibleActions(adaptations: AdaptationCollection, event: EnvironmentalCrisisDefinition): BotRoundAction[] {
    const actions = getLegalBotActions(adaptations)
    const uses = actions.filter((action) => action.actionType === 'USE').sort((left, right) => getAdaptationRoundValue(event, adaptations, right.trait) - getAdaptationRoundValue(event, adaptations, left.trait) || left.trait.localeCompare(right.trait)).slice(0, 2)
    const evolves = actions.filter((action) => action.actionType === 'EVOLVE').sort((left, right) => adaptations[left.trait].level - adaptations[right.trait].level || left.trait.localeCompare(right.trait)).slice(0, 2)
    return [...uses, ...evolves]
}
export function evaluateBotState(state: SearchState, remaining: number): EvaluationBreakdown {
    const terminal = remaining <= 0 ? (state.ownScore > state.rivalScore ? 10_000 : state.ownScore === state.rivalScore ? 0 : -10_000) : 0
    const score = (state.ownScore - state.rivalScore) * 120
    const levels = Object.values(state.own).reduce((sum, trait) => sum + trait.level, 0) * 12 - Object.values(state.rival).reduce((sum, trait) => sum + trait.level, 0) * 12
    const available = getLegalBotActions(state.own).filter((action) => action.actionType === 'USE').length * 2 - getLegalBotActions(state.rival).filter((action) => action.actionType === 'USE').length * 2
    const cooldown = Object.values(state.rival).reduce((sum, trait) => sum + trait.cooldown, 0) * 3 - Object.values(state.own).reduce((sum, trait) => sum + trait.cooldown, 0) * 3
    const matchupPotential = 0
    const remainingContribution = remaining * (state.ownScore === state.rivalScore ? 1 : 0)
    return { terminal, score, levels, available, cooldown, matchupPotential, remaining: remainingContribution, total: terminal + score + levels + available + cooldown + matchupPotential + remainingContribution }
}
function decide(context: BotDecisionContext, events: readonly EnvironmentalCrisisDefinition[], depth: number, stats?: LookaheadStats): BotDecision {
    const memo = new Map<string, number>()
    const search = (state: SearchState, step: number): number => {
        const event = events[step]
        if (!event || step >= depth || state.round > TOTAL_ROUNDS) return evaluateBotState(state, Math.max(0, depth - step)).total
        const key = `${step}|${state.round}|${state.ownScore},${state.rivalScore}|${canonical(state.own)}|${canonical(state.rival)}`
        const cached = memo.get(key); if (cached !== undefined) { if (stats) stats.cacheHits += 1; return cached }
        if (stats) { stats.cacheMisses += 1; stats.statesVisited += 1 }
        let bestValue = Number.NEGATIVE_INFINITY
        for (const ownAction of plausibleActions(state.own, event)) {
            const rivalActions = plausibleActions(state.rival, event); let aggregate = 0
            for (const rivalAction of rivalActions) {
                const resolution = resolveRound({ roundNumber: state.round, roundEvent: event, player1Id: 'own', player2Id: 'rival', player1Traits: state.own, player2Traits: state.rival, player1Action: { playerId: 'own', ...ownAction }, player2Action: { playerId: 'rival', ...rivalAction } })
                aggregate += search({ own: resolution.player1.traits, rival: resolution.player2.traits, ownScore: state.ownScore + resolution.player1ScoreDelta, rivalScore: state.rivalScore + resolution.player2ScoreDelta, round: state.round + 1 }, step + 1)
            }
            bestValue = Math.max(bestValue, aggregate / rivalActions.length)
        }
        memo.set(key, bestValue); return bestValue
    }
    const root: SearchState = { own: clone(context.adaptations), rival: clone(context.publicOpponentAdaptations ?? context.adaptations), ownScore: context.ownScore, rivalScore: context.opponentScore, round: context.roundNumber }
    const choices = context.legalActions.map((action) => {
        const rivals = plausibleActions(root.rival, context.roundEvent); let total = 0
        for (const rival of rivals) {
            const resolution = resolveRound({ roundNumber: root.round, roundEvent: context.roundEvent, player1Id: 'own', player2Id: 'rival', player1Traits: root.own, player2Traits: root.rival, player1Action: { playerId: 'own', ...action }, player2Action: { playerId: 'rival', ...rival } })
            total += search({ own: resolution.player1.traits, rival: resolution.player2.traits, ownScore: root.ownScore + resolution.player1ScoreDelta, rivalScore: root.rivalScore + resolution.player2ScoreDelta, round: root.round + 1 }, 1)
        }
        return { action, value: total / rivals.length }
    })
    const maximum = Math.max(...choices.map((entry) => entry.value)); const tied = choices.filter((entry) => Math.abs(entry.value - maximum) < 1e-9)
    const selected = pickSeeded(tied, context.random)
    return { ...selected.action as BotRoundAction, reason: `Lookahead simultaneo profondita ${depth}; stati ${stats?.statesVisited ?? memo.size}.` }
}
export function createLookaheadPolicy(options: LookaheadOptions = {}): OfflineBotPolicy {
    const baseDepth = Math.max(1, Math.min(options.depth ?? 2, 4)); const fullLastRounds = options.fullSearchLastRounds ?? 0
    return {
        id: options.id ?? (fullLastRounds ? `lookahead-full-last-${fullLastRounds}` : `lookahead-${baseDepth}`),
        selectAction(context) { return decide(context, [context.roundEvent, ...(context.nextRoundEvent ? [context.nextRoundEvent] : [])], Math.min(baseDepth, 2), options.stats) },
        selectPrivilegedAction(context: PrivilegedBotDecisionContext) { const depth = fullLastRounds ? (context.remainingEvents.length <= fullLastRounds ? context.remainingEvents.length : Math.min(baseDepth, 2)) : Math.min(baseDepth, context.remainingEvents.length); return decide(context, context.remainingEvents, depth, options.stats) },
    }
}
export const lookaheadPolicy = createLookaheadPolicy()
