import { MAX_ADAPTATION_LEVEL, ROUND_WIN_POINTS, RULE_VERSION, STANDARD_SCHEDULED_ROUNDS, SYMBIOSIS_RULE_VERSION } from './catalog.ts'
import { assertScheduledRounds, validateFineDelMondoActivations } from './fine-del-mondo.ts'
import { getMutationActivationBreakdown, getNaturalAdvantageBonus, getValidatedActionBreakdown, getValidatedAdaptationUseBreakdown } from './scoring.ts'
import { assertSupportedRuleVersion } from './state.ts'
import { createSymbiosisPropagationEvent, resolveSymbiosisPropagation, type DirectLevelUp } from './symbiosis.ts'
import type { AdaptationCollection, AdaptationId, CombatMutationEffect, CombatMutationId, CombatMutationLoadout, CombatMutationState, FineDelMondoActivation, FineDelMondoActivationRequest, PlayerRoundAction, ResolveRoundInput, EnvironmentalCrisisDefinition, RoundResolution, SymbiosisLink, SymbiosisRoundEvent } from './types.ts'

function cloneAdaptations(adaptations: AdaptationCollection): AdaptationCollection { return Object.fromEntries(Object.entries(adaptations).map(([adaptation, state]) => [adaptation, { ...state }])) as AdaptationCollection }
function cloneCombatMutationState(state: CombatMutationState): CombatMutationState { return { ...state } }
function cloneSymbiosisLinks(links: readonly SymbiosisLink[]): SymbiosisLink[] { return links.map((link) => ({ ...link })) }
export function isAdaptationUsable(adaptations: AdaptationCollection, adaptation: AdaptationId): boolean { return !adaptations[adaptation].exhausted }
export function isAdaptationEvolvable(adaptations: AdaptationCollection, adaptation: AdaptationId): boolean { const state = adaptations[adaptation]; return state.level < MAX_ADAPTATION_LEVEL || state.exhausted }
export function getRoundPoints(roundNumber: number, scheduledRounds = STANDARD_SCHEDULED_ROUNDS): number { return roundNumber >= 1 && roundNumber <= scheduledRounds ? ROUND_WIN_POINTS : 0 }
/** Loadouts are mandatory in all active-match calls. Slot order has no gameplay meaning. */
export function isCombatMutationEquipped(loadout: readonly CombatMutationId[], mutation: CombatMutationId): boolean { return loadout.includes(mutation) }
export function getCombatMutationUseBonus(state: CombatMutationState, loadout: CombatMutationLoadout): number { return state.adaptiveCoreStatus === 'ARMED' && isCombatMutationEquipped(loadout, 'ADAPTIVE_CORE') ? 1 : 0 }
/** Presentation and bot previews use this rather than reproducing mutation conditions. */
export function getCombatMutationUsePreview(state: CombatMutationState, adaptation: AdaptationId, loadout: CombatMutationLoadout) {
    return {
        mutationBonus: getCombatMutationUseBonus(state, loadout),
        elasticLimbsWillPreserveAgility: adaptation === 'AGILITY' && !state.elasticLimbsUsed && isCombatMutationEquipped(loadout, 'ELASTIC_LIMBS'),
        armoredMemoryWillPreserveArmor: adaptation === 'ARMOR' && !state.armoredMemoryUsed && isCombatMutationEquipped(loadout, 'ARMORED_MEMORY'),
    }
}
export function getCombatMutationEvolvePreview(state: CombatMutationState, adaptations: AdaptationCollection, adaptation: AdaptationId, loadout: CombatMutationLoadout) {
    return {
        mutationBonus: adaptations[adaptation].exhausted && !state.recoverySurgeUsed && isCombatMutationEquipped(loadout, 'RECOVERY_SURGE') ? 1 : 0,
        adaptiveCoreWillArm: state.adaptiveCoreStatus === 'DORMANT' && isCombatMutationEquipped(loadout, 'ADAPTIVE_CORE'),
    }
}
/** Shared transition preview used by both resolution and bot evaluation. */
export function getCombatMutationStateAfterEvolve(state: CombatMutationState, loadout: CombatMutationLoadout): CombatMutationState {
    const nextState = cloneCombatMutationState(state)
    if (nextState.adaptiveCoreStatus === 'DORMANT' && isCombatMutationEquipped(loadout, 'ADAPTIVE_CORE')) nextState.adaptiveCoreStatus = 'ARMED'
    return nextState
}
export function getAdaptationRoundValue(roundEvent: EnvironmentalCrisisDefinition, adaptations: AdaptationCollection, adaptation: AdaptationId, combatMutationState: CombatMutationState, combatMutationLoadout: CombatMutationLoadout): number { return getValidatedAdaptationUseBreakdown(roundEvent, adaptations, adaptation, 0, getCombatMutationUseBonus(combatMutationState, combatMutationLoadout)).total }
export function getEvolutionRoundValue(roundEvent: EnvironmentalCrisisDefinition, adaptations: AdaptationCollection, adaptation: AdaptationId, combatMutationState: CombatMutationState, combatMutationLoadout: CombatMutationLoadout): number { return getValidatedActionBreakdown(roundEvent, adaptations, adaptation, 'EVOLVE', 0, getCombatMutationEvolvePreview(combatMutationState, adaptations, adaptation, combatMutationLoadout).mutationBonus).total }
export function hasClinchedMatch(player1Score: number, player2Score: number, resolvedRoundNumber = 0, scheduledRounds = STANDARD_SCHEDULED_ROUNDS): boolean {
    assertScheduledRounds(scheduledRounds)
    const remainingRounds = Math.max(0, scheduledRounds - resolvedRoundNumber)
    return player1Score > player2Score + remainingRounds || player2Score > player1Score + remainingRounds
}

type ResolvedDirectAction = {
    roundValue: number
    breakdown: ReturnType<typeof getValidatedActionBreakdown>
    traits: AdaptationCollection
    combatMutationState: CombatMutationState
    mutationEffects: CombatMutationEffect[]
    directLevelUp: DirectLevelUp | null
    activationLink: SymbiosisLink | null
    fineDelMondoActivationRequest: FineDelMondoActivationRequest | null
}

function resolvePlayerAction(input: ResolveRoundInput, playerId: string, opponentId: string, adaptations: AdaptationCollection, combatMutationState: CombatMutationState, combatMutationLoadout: CombatMutationLoadout, action: PlayerRoundAction, opponentAction: PlayerRoundAction, linksAtStart: readonly SymbiosisLink[], fineDelMondoActivationsAtStart: readonly FineDelMondoActivation[], scheduledRounds: number): ResolvedDirectAction {
    if (action.playerId !== playerId) throw new Error('Round action player does not match its participant.')
    const nextAdaptations = cloneAdaptations(adaptations)
    const nextCombatMutationState = cloneCombatMutationState(combatMutationState)
    const mutationEffects: CombatMutationEffect[] = []
    if (action.actionType === 'ACTIVATE_MUTATION') {
        if (action.mutationId === 'SYMBIOSIS') {
            if (input.ruleVersion !== RULE_VERSION && input.ruleVersion !== SYMBIOSIS_RULE_VERSION) throw new Error('SYMBIOSIS is unavailable under this legacy ruleset.')
            if (!isCombatMutationEquipped(combatMutationLoadout, 'SYMBIOSIS')) throw new Error('SYMBIOSIS is not equipped.')
            if (linksAtStart.some((link) => link.ownerPlayerId === playerId)) throw new Error('SYMBIOSIS has already been activated by this player.')
            const breakdown = getValidatedActionBreakdown(input.roundEvent, adaptations, action.sourceTrait, 'ACTIVATE_MUTATION')
            return { roundValue: 0, breakdown, traits: nextAdaptations, combatMutationState: nextCombatMutationState, mutationEffects, directLevelUp: null, activationLink: { ownerPlayerId: playerId, sourceTrait: action.sourceTrait, targetPlayerId: opponentId, targetTrait: action.targetTrait, activatedRound: input.roundNumber }, fineDelMondoActivationRequest: null }
        }
        if (action.mutationId === 'FINE_DEL_MONDO') {
            if (input.ruleVersion !== RULE_VERSION) throw new Error('FINE_DEL_MONDO is unavailable under this legacy ruleset.')
            if (!isCombatMutationEquipped(combatMutationLoadout, 'FINE_DEL_MONDO')) throw new Error('FINE_DEL_MONDO is not equipped.')
            if (fineDelMondoActivationsAtStart.some((activation) => activation.ownerPlayerId === playerId)) throw new Error('FINE_DEL_MONDO has already been activated by this player.')
            if (input.roundNumber < 3) throw new Error('FINE_DEL_MONDO is unavailable before round 3.')
            if (input.roundNumber > scheduledRounds - 2) throw new Error('FINE_DEL_MONDO cannot move the deadline into the past.')
            return { roundValue: 0, breakdown: getMutationActivationBreakdown(), traits: nextAdaptations, combatMutationState: nextCombatMutationState, mutationEffects, directLevelUp: null, activationLink: null, fineDelMondoActivationRequest: { ownerPlayerId: playerId, activatedRound: input.roundNumber } }
        }
        throw new Error('Unsupported mutation activation.')
    }
    if (action.actionType === 'EVOLVE') {
        if (!isAdaptationEvolvable(adaptations, action.trait)) throw new Error(`Adaptation ${action.trait} is already available at the maximum level; EVOLVE would produce no transition.`)
        const mutationPreview = getCombatMutationEvolvePreview(combatMutationState, adaptations, action.trait, combatMutationLoadout)
        const breakdown = getValidatedActionBreakdown(input.roundEvent, adaptations, action.trait, action.actionType, 0, mutationPreview.mutationBonus)
        const levelBefore = nextAdaptations[action.trait].level
        if (levelBefore < MAX_ADAPTATION_LEVEL) nextAdaptations[action.trait].level += 1
        nextAdaptations[action.trait].exhausted = false
        if (mutationPreview.mutationBonus) {
            nextCombatMutationState.recoverySurgeUsed = true
            mutationEffects.push({ id: 'RECOVERY_SURGE', effect: 'EVOLVE_ROUND_BONUS', value: 1 })
        }
        if (mutationPreview.adaptiveCoreWillArm) {
            mutationEffects.push({ id: 'ADAPTIVE_CORE', effect: 'CORE_ARMED' })
        }
        return { roundValue: breakdown.total, breakdown, traits: nextAdaptations, combatMutationState: getCombatMutationStateAfterEvolve(nextCombatMutationState, combatMutationLoadout), mutationEffects, directLevelUp: nextAdaptations[action.trait].level > levelBefore ? { playerId, trait: action.trait } : null, activationLink: null, fineDelMondoActivationRequest: null }
    }
    if (!isAdaptationUsable(adaptations, action.trait)) throw new Error(`Adaptation ${action.trait} is exhausted and cannot be used.`)
    const matchupBonus = getNaturalAdvantageBonus(action, opponentAction)
    const mutationPreview = getCombatMutationUsePreview(combatMutationState, action.trait, combatMutationLoadout)
    const mutationBonus = mutationPreview.mutationBonus
    const breakdown = getValidatedActionBreakdown(input.roundEvent, adaptations, action.trait, action.actionType, matchupBonus, mutationBonus)
    if (mutationPreview.mutationBonus) {
        nextCombatMutationState.adaptiveCoreStatus = 'CONSUMED'
        mutationEffects.push({ id: 'ADAPTIVE_CORE', effect: 'ROUND_VALUE_BONUS', value: 1 })
    }
    if (mutationPreview.elasticLimbsWillPreserveAgility) {
        nextCombatMutationState.elasticLimbsUsed = true
        mutationEffects.push({ id: 'ELASTIC_LIMBS', effect: 'AGILITY_PRESERVED' })
    } else if (mutationPreview.armoredMemoryWillPreserveArmor) {
        nextCombatMutationState.armoredMemoryUsed = true
        mutationEffects.push({ id: 'ARMORED_MEMORY', effect: 'ARMOR_PRESERVED' })
    } else {
        nextAdaptations[action.trait].exhausted = true
    }
    return { roundValue: breakdown.total, breakdown, traits: nextAdaptations, combatMutationState: nextCombatMutationState, mutationEffects, directLevelUp: null, activationLink: null, fineDelMondoActivationRequest: null }
}

function validateLinksAtRoundStart(links: readonly SymbiosisLink[], player1Id: string, player2Id: string, roundNumber: number): void {
    if (links.length > 2 || new Set(links.map((link) => link.ownerPlayerId)).size !== links.length) throw new Error('Invalid SYMBIOSIS link ownership.')
    for (const link of links) {
        const expectedTarget = link.ownerPlayerId === player1Id ? player2Id : link.ownerPlayerId === player2Id ? player1Id : null
        if (!expectedTarget || link.targetPlayerId !== expectedTarget || link.activatedRound >= roundNumber) throw new Error('Invalid SYMBIOSIS link for this round.')
    }
}

export function resolveRound(input: ResolveRoundInput): RoundResolution {
    assertSupportedRuleVersion(input.ruleVersion)
    if (input.alreadyResolved) throw new Error(`Round ${input.roundNumber} has already been resolved.`)
    const scheduledRounds = input.scheduledRounds ?? STANDARD_SCHEDULED_ROUNDS
    assertScheduledRounds(scheduledRounds)
    if (input.roundNumber < 1 || input.roundNumber > scheduledRounds) throw new Error(`Round ${input.roundNumber} is outside the scheduled match.`)
    const linksAtStart = cloneSymbiosisLinks(input.symbiosisLinks ?? [])
    const fineDelMondoActivationsAtStart = input.fineDelMondoActivations ?? []
    validateLinksAtRoundStart(linksAtStart, input.player1Id, input.player2Id, input.roundNumber)
    validateFineDelMondoActivations(fineDelMondoActivationsAtStart)
    const player1 = resolvePlayerAction(input, input.player1Id, input.player2Id, input.player1Traits, input.player1CombatMutationState, input.player1CombatMutationLoadout, input.player1Action, input.player2Action, linksAtStart, fineDelMondoActivationsAtStart, scheduledRounds)
    const player2 = resolvePlayerAction(input, input.player2Id, input.player1Id, input.player2Traits, input.player2CombatMutationState, input.player2CombatMutationLoadout, input.player2Action, input.player1Action, linksAtStart, fineDelMondoActivationsAtStart, scheduledRounds)
    const directLevelUps = [player1.directLevelUp, player2.directLevelUp].filter((levelUp): levelUp is DirectLevelUp => Boolean(levelUp))
    const propagationTargets = resolveSymbiosisPropagation(linksAtStart, directLevelUps)
    const symbiosisEvents: SymbiosisRoundEvent[] = []
    for (const target of propagationTargets) {
        const traits = target.targetPlayerId === input.player1Id ? player1.traits : target.targetPlayerId === input.player2Id ? player2.traits : null
        if (!traits) throw new Error('SYMBIOSIS propagation target is not a participant.')
        const event = createSymbiosisPropagationEvent(target, traits[target.targetTrait].level)
        traits[target.targetTrait].level = event.levelAfter
        symbiosisEvents.push(event)
    }
    const activatedLinks = [player1.activationLink, player2.activationLink].filter((link): link is SymbiosisLink => Boolean(link))
    const symbiosisLinks = [...linksAtStart, ...activatedLinks]
    for (const link of activatedLinks) symbiosisEvents.push({ effect: 'LINK_ACTIVATED', link })
    const player1Won = player1.roundValue > player2.roundValue
    const player2Won = player2.roundValue > player1.roundValue
    const awardedPoints = player1Won || player2Won ? getRoundPoints(input.roundNumber, scheduledRounds) : 0
    return { roundNumber: input.roundNumber, roundEvent: input.roundEvent, player1: { ...input.player1Action, roundValue: player1.roundValue, breakdown: player1.breakdown, traits: player1.traits, combatMutationState: player1.combatMutationState, mutationEffects: player1.mutationEffects }, player2: { ...input.player2Action, roundValue: player2.roundValue, breakdown: player2.breakdown, traits: player2.traits, combatMutationState: player2.combatMutationState, mutationEffects: player2.mutationEffects }, winnerId: player1Won ? input.player1Id : player2Won ? input.player2Id : null, awardedPoints, player1ScoreDelta: player1Won ? awardedPoints : 0, player2ScoreDelta: player2Won ? awardedPoints : 0, symbiosisLinks, symbiosisEvents, fineDelMondoActivationRequests: [player1.fineDelMondoActivationRequest, player2.fineDelMondoActivationRequest].filter((request): request is FineDelMondoActivationRequest => Boolean(request)) }
}
