import { TOTAL_ROUNDS } from './catalog.ts'
import { getAdaptationRoundValue, resolveRound } from './engine.ts'
import { getLegalBotActions, getLegalOpponentActions, pickSeeded, type BotDecision, type BotDecisionContext, type OfflineBotPolicy, type BotRoundAction, type PrivilegedBotDecisionContext } from './bot-policies.ts'
import { canonicalCombatMutationLoadoutCacheKey } from './state.ts'
import type { AdaptationCollection, CombatMutationLoadout, CombatMutationState, EnvironmentalCrisisDefinition, RoundAction, SymbiosisLink } from './types.ts'

export type EvaluationBreakdown = { terminal: number; score: number; levels: number; available: number; exhausted: number; matchupPotential: number; remaining: number; total: number }
export type LookaheadStats = { statesVisited: number; cacheHits: number; cacheMisses: number }
export type LookaheadOptions = { depth?: number; stats?: LookaheadStats; fullSearchLastRounds?: number; id?: string }
type SearchState = { own: AdaptationCollection; rival: AdaptationCollection; ownCombatMutationLoadout: CombatMutationLoadout; rivalCombatMutationLoadout: CombatMutationLoadout; ownCombatMutationState: CombatMutationState; rivalCombatMutationState: CombatMutationState; symbiosisLinks: SymbiosisLink[]; ownScore: number; rivalScore: number; round: number }
function canonical(adaptations: AdaptationCollection, combatMutationState: CombatMutationState, combatMutationLoadout: CombatMutationLoadout): string { return `${Object.values(adaptations).map((state) => `${state.level}:${Number(state.exhausted)}`).join(',')}|${canonicalCombatMutationLoadoutCacheKey(combatMutationLoadout)}|${Number(combatMutationState.elasticLimbsUsed)}:${combatMutationState.adaptiveCoreStatus}:${Number(combatMutationState.armoredMemoryUsed)}:${Number(combatMutationState.recoverySurgeUsed)}` }
function clone(adaptations: AdaptationCollection): AdaptationCollection { return Object.fromEntries(Object.entries(adaptations).map(([key, value]) => [key, { ...value }])) as AdaptationCollection }
function cloneCombatMutationState(state: CombatMutationState): CombatMutationState { return { ...state } }
function cloneSymbiosisLinks(links: readonly SymbiosisLink[]): SymbiosisLink[] { return links.map((link) => ({ ...link })) }
function canonicalSymbiosisLinks(links: readonly SymbiosisLink[]): string { return [...links].map((link) => `${link.ownerPlayerId}:${link.sourceTrait}>${link.targetPlayerId}:${link.targetTrait}@${link.activatedRound}`).sort().join(',') }
/** Keeps exhaustive root choices, while bounding only future opponent hypotheses. */
function plausibleActions(adaptations: AdaptationCollection, combatMutationState: CombatMutationState, combatMutationLoadout: CombatMutationLoadout, event: EnvironmentalCrisisDefinition, options?: { modelHumanSymbiosis: boolean; playerId: string; opponentId: string; ruleVersion: string; symbiosisLinks: readonly SymbiosisLink[] }): RoundAction[] {
    const actions = getLegalBotActions(adaptations)
    const uses = actions.filter((action) => action.actionType === 'USE').sort((left, right) => getAdaptationRoundValue(event, adaptations, right.trait, combatMutationState, combatMutationLoadout) - getAdaptationRoundValue(event, adaptations, left.trait, combatMutationState, combatMutationLoadout) || left.trait.localeCompare(right.trait)).slice(0, 1)
    const evolves = actions.filter((action) => action.actionType === 'EVOLVE').sort((left, right) => Number(adaptations[right.trait].exhausted) - Number(adaptations[left.trait].exhausted) || adaptations[left.trait].level - adaptations[right.trait].level || left.trait.localeCompare(right.trait)).slice(0, 1)
    const activation = options?.modelHumanSymbiosis
        ? getLegalOpponentActions({ adaptations, combatMutationLoadout, playerId: options.playerId, opponentId: options.opponentId, ruleVersion: options.ruleVersion, symbiosisLinks: options.symbiosisLinks })
            .filter((action): action is Extract<RoundAction, { actionType: 'ACTIVATE_MUTATION' }> => action.actionType === 'ACTIVATE_MUTATION')
            .sort((left, right) => left.sourceTrait.localeCompare(right.sourceTrait) || left.targetTrait.localeCompare(right.targetTrait))[0]
        : undefined
    return activation ? [...uses, ...evolves, activation] : [...uses, ...evolves]
}
export function evaluateBotState(state: SearchState, remaining: number): EvaluationBreakdown {
    const terminal = remaining <= 0 ? (state.ownScore > state.rivalScore ? 10_000 : state.ownScore === state.rivalScore ? 0 : -10_000) : 0
    const score = (state.ownScore - state.rivalScore) * 120
    const levels = Object.values(state.own).reduce((sum, trait) => sum + trait.level, 0) * 12 - Object.values(state.rival).reduce((sum, trait) => sum + trait.level, 0) * 12
    const available = getLegalBotActions(state.own).filter((action) => action.actionType === 'USE').length * 2 - getLegalBotActions(state.rival).filter((action) => action.actionType === 'USE').length * 2
    const exhausted = Object.values(state.rival).filter((trait) => trait.exhausted).length * 3 - Object.values(state.own).filter((trait) => trait.exhausted).length * 3
    const matchupPotential = 0
    const remainingContribution = remaining * (state.ownScore === state.rivalScore ? 1 : 0)
    return { terminal, score, levels, available, exhausted, matchupPotential, remaining: remainingContribution, total: terminal + score + levels + available + exhausted + matchupPotential + remainingContribution }
}
function decide(context: BotDecisionContext, events: readonly EnvironmentalCrisisDefinition[], depth: number, stats?: LookaheadStats): BotDecision {
    const memo = new Map<string, number>()
    const search = (state: SearchState, step: number): number => {
        const event = events[step]
        if (!event || step >= depth || state.round > TOTAL_ROUNDS) return evaluateBotState(state, Math.max(0, depth - step)).total
        const key = `${step}|${state.round}|${state.ownScore},${state.rivalScore}|${canonical(state.own, state.ownCombatMutationState, state.ownCombatMutationLoadout)}|${canonical(state.rival, state.rivalCombatMutationState, state.rivalCombatMutationLoadout)}|${canonicalSymbiosisLinks(state.symbiosisLinks)}`
        const cached = memo.get(key); if (cached !== undefined) { if (stats) stats.cacheHits += 1; return cached }
        if (stats) { stats.cacheMisses += 1; stats.statesVisited += 1 }
        let bestValue = Number.NEGATIVE_INFINITY
        for (const ownAction of plausibleActions(state.own, state.ownCombatMutationState, state.ownCombatMutationLoadout, event)) {
            const rivalActions = plausibleActions(state.rival, state.rivalCombatMutationState, state.rivalCombatMutationLoadout, event, { modelHumanSymbiosis: true, playerId: 'rival', opponentId: 'own', ruleVersion: context.ruleVersion, symbiosisLinks: state.symbiosisLinks }); let aggregate = 0
            for (const rivalAction of rivalActions) {
                const resolution = resolveRound({ roundNumber: state.round, roundEvent: event, player1Id: 'own', player2Id: 'rival', player1Traits: state.own, player2Traits: state.rival, ruleVersion: context.ruleVersion, player1CombatMutationLoadout: state.ownCombatMutationLoadout, player2CombatMutationLoadout: state.rivalCombatMutationLoadout, player1CombatMutationState: state.ownCombatMutationState, player2CombatMutationState: state.rivalCombatMutationState, symbiosisLinks: state.symbiosisLinks, player1Action: { playerId: 'own', ...ownAction }, player2Action: { playerId: 'rival', ...rivalAction } })
                aggregate += search({ own: resolution.player1.traits, rival: resolution.player2.traits, ownCombatMutationLoadout: state.ownCombatMutationLoadout, rivalCombatMutationLoadout: state.rivalCombatMutationLoadout, ownCombatMutationState: resolution.player1.combatMutationState, rivalCombatMutationState: resolution.player2.combatMutationState, symbiosisLinks: cloneSymbiosisLinks(resolution.symbiosisLinks), ownScore: state.ownScore + resolution.player1ScoreDelta, rivalScore: state.rivalScore + resolution.player2ScoreDelta, round: state.round + 1 }, step + 1)
            }
            bestValue = Math.max(bestValue, aggregate / rivalActions.length)
        }
        memo.set(key, bestValue); return bestValue
    }
    const root: SearchState = { own: clone(context.adaptations), rival: clone(context.publicOpponentAdaptations), ownCombatMutationLoadout: [...context.combatMutationLoadout], rivalCombatMutationLoadout: [...context.publicOpponentCombatMutationLoadout], ownCombatMutationState: cloneCombatMutationState(context.combatMutationState), rivalCombatMutationState: cloneCombatMutationState(context.publicOpponentCombatMutationState), symbiosisLinks: cloneSymbiosisLinks(context.symbiosisLinks ?? []), ownScore: context.ownScore, rivalScore: context.opponentScore, round: context.roundNumber }
    const choices = context.legalActions.map((action) => {
        const rivals = plausibleActions(root.rival, root.rivalCombatMutationState, root.rivalCombatMutationLoadout, context.roundEvent, { modelHumanSymbiosis: true, playerId: 'rival', opponentId: 'own', ruleVersion: context.ruleVersion, symbiosisLinks: root.symbiosisLinks }); let total = 0
        for (const rival of rivals) {
            const resolution = resolveRound({ roundNumber: root.round, roundEvent: context.roundEvent, player1Id: 'own', player2Id: 'rival', player1Traits: root.own, player2Traits: root.rival, ruleVersion: context.ruleVersion, player1CombatMutationLoadout: root.ownCombatMutationLoadout, player2CombatMutationLoadout: root.rivalCombatMutationLoadout, player1CombatMutationState: root.ownCombatMutationState, player2CombatMutationState: root.rivalCombatMutationState, symbiosisLinks: root.symbiosisLinks, player1Action: { playerId: 'own', ...action }, player2Action: { playerId: 'rival', ...rival } })
            total += search({ own: resolution.player1.traits, rival: resolution.player2.traits, ownCombatMutationLoadout: root.ownCombatMutationLoadout, rivalCombatMutationLoadout: root.rivalCombatMutationLoadout, ownCombatMutationState: resolution.player1.combatMutationState, rivalCombatMutationState: resolution.player2.combatMutationState, symbiosisLinks: cloneSymbiosisLinks(resolution.symbiosisLinks), ownScore: root.ownScore + resolution.player1ScoreDelta, rivalScore: root.rivalScore + resolution.player2ScoreDelta, round: root.round + 1 }, 1)
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
