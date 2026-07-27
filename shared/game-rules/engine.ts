import { COOLDOWN_ROUNDS, MAX_TRAIT_LEVEL, ROUND_WIN_POINTS, TOTAL_ROUNDS } from './catalog.ts'
import { getValidatedActionBreakdown, getValidatedGeneUseBreakdown } from './scoring.ts'
import type { GeneCollection, GeneId, PlayerRoundAction, ResolveRoundInput, RoundEventDefinition, RoundResolution } from './types.ts'

function cloneGenes(genes: GeneCollection): GeneCollection { return Object.fromEntries(Object.entries(genes).map(([gene, state]) => [gene, { ...state, level: Math.min(state.level, MAX_TRAIT_LEVEL) }])) as GeneCollection }
export function isGeneUsable(genes: GeneCollection, gene: GeneId): boolean { return genes[gene].cooldown === 0 }
export function isGeneEvolvable(genes: GeneCollection, gene: GeneId): boolean { return genes[gene].level < MAX_TRAIT_LEVEL }
export function getRoundPoints(roundNumber: number): number { return roundNumber >= 1 && roundNumber <= TOTAL_ROUNDS ? ROUND_WIN_POINTS : 0 }
export function getTraitRoundValue(roundEvent: RoundEventDefinition, genes: GeneCollection, gene: GeneId): number { return getValidatedGeneUseBreakdown(roundEvent, genes, gene).total }

function resolvePlayerAction(input: ResolveRoundInput, genes: GeneCollection, action: PlayerRoundAction) {
    const breakdown = getValidatedActionBreakdown(input.roundEvent, genes, action.trait, action.actionType)
    const nextGenes = cloneGenes(genes)
    for (const state of Object.values(nextGenes)) state.cooldown = Math.max(0, state.cooldown - 1)
    if (action.actionType === 'EVOLVE') {
        if (!isGeneEvolvable(genes, action.trait)) throw new Error(`Gene ${action.trait} is already at the maximum level and cannot evolve.`)
        nextGenes[action.trait].level += 1
        return { roundValue: 0, breakdown, traits: nextGenes }
    }
    if (!isGeneUsable(genes, action.trait)) throw new Error(`Gene ${action.trait} is on cooldown and cannot be used.`)
    nextGenes[action.trait].cooldown = COOLDOWN_ROUNDS
    return { roundValue: breakdown.total, breakdown, traits: nextGenes }
}

export function resolveRound(input: ResolveRoundInput): RoundResolution {
    if (input.alreadyResolved) throw new Error(`Round ${input.roundNumber} has already been resolved.`)
    const player1 = resolvePlayerAction(input, input.player1Traits, input.player1Action)
    const player2 = resolvePlayerAction(input, input.player2Traits, input.player2Action)
    const awardedPoints = getRoundPoints(input.roundNumber)
    const player1Won = player1.roundValue > player2.roundValue
    const player2Won = player2.roundValue > player1.roundValue
    return {
        roundNumber: input.roundNumber, roundEvent: input.roundEvent,
        player1: { ...input.player1Action, ...player1 }, player2: { ...input.player2Action, ...player2 },
        winnerId: player1Won ? input.player1Id : player2Won ? input.player2Id : null, awardedPoints,
        player1ScoreDelta: player1Won ? awardedPoints : 0, player2ScoreDelta: player2Won ? awardedPoints : 0,
    }
}
