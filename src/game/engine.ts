import {
    DEFAULT_ROUND_POINTS,
    FINAL_ROUND_NUMBER,
    FINAL_ROUND_POINTS,
} from './config'
import { getValidatedActionBreakdown, getValidatedTraitRoundValue, getValidatedTraitState } from './scoring'
import type {
    PlayerRoundAction,
    ResolveRoundInput,
    RoundResolution,
    TraitCollection,
    TraitType,
} from './types'

function cloneTraits(traits: TraitCollection): TraitCollection {
    return Object.fromEntries(
        Object.entries(traits).map(([trait, state]) => [trait, { ...state }]),
    ) as TraitCollection
}

export function getRoundPoints(roundNumber: number): number {
    return roundNumber === FINAL_ROUND_NUMBER ? FINAL_ROUND_POINTS : DEFAULT_ROUND_POINTS
}

export function isTraitUsable(traits: TraitCollection, trait: TraitType): boolean {
    return traits[trait].cooldown === 0
}

export function getTraitRoundValue(
    environment: ResolveRoundInput['environment'],
    traits: TraitCollection,
    trait: TraitType,
): number {
    return getValidatedTraitRoundValue(environment, traits, trait)
}

function tickCooldowns(traits: TraitCollection): TraitCollection {
    const nextTraits = cloneTraits(traits)

    for (const state of Object.values(nextTraits)) {
        state.cooldown = Math.max(0, state.cooldown - 1)
    }

    return nextTraits
}

function resolvePlayerAction(
    environment: ResolveRoundInput['environment'],
    traits: TraitCollection,
    action: PlayerRoundAction,
) {
    getValidatedTraitState(traits, action.trait)
    const breakdown = getValidatedActionBreakdown(environment, traits, action.trait, action.actionType)
    const nextTraits = tickCooldowns(traits)

    if (action.actionType === 'EVOLVE') {
        nextTraits[action.trait].level += 1

        return {
            roundValue: 0,
            breakdown,
            traits: nextTraits,
        }
    }

    if (!isTraitUsable(traits, action.trait)) {
        throw new Error(`Trait ${action.trait} is on cooldown and cannot be used.`)
    }

    nextTraits[action.trait].cooldown = 1

    return {
        roundValue: getTraitRoundValue(environment, traits, action.trait),
        breakdown,
        traits: nextTraits,
    }
}

export function resolveRound(input: ResolveRoundInput): RoundResolution {
    if (input.alreadyResolved) {
        throw new Error(`Round ${input.roundNumber} has already been resolved.`)
    }

    const player1 = resolvePlayerAction(input.environment, input.player1Traits, input.player1Action)
    const player2 = resolvePlayerAction(input.environment, input.player2Traits, input.player2Action)

    const awardedPoints = getRoundPoints(input.roundNumber)

    if (player1.roundValue === player2.roundValue) {
        return {
            roundNumber: input.roundNumber,
            environment: input.environment,
            player1: {
                ...input.player1Action,
                roundValue: player1.roundValue,
                breakdown: player1.breakdown,
                traits: player1.traits,
            },
            player2: {
                ...input.player2Action,
                roundValue: player2.roundValue,
                breakdown: player2.breakdown,
                traits: player2.traits,
            },
            winnerId: null,
            awardedPoints,
            player1ScoreDelta: 0,
            player2ScoreDelta: 0,
        }
    }

    const player1Won = player1.roundValue > player2.roundValue

    return {
        roundNumber: input.roundNumber,
        environment: input.environment,
        player1: {
            ...input.player1Action,
            roundValue: player1.roundValue,
            breakdown: player1.breakdown,
            traits: player1.traits,
        },
        player2: {
            ...input.player2Action,
            roundValue: player2.roundValue,
            breakdown: player2.breakdown,
            traits: player2.traits,
        },
        winnerId: player1Won ? input.player1Id : input.player2Id,
        awardedPoints,
        player1ScoreDelta: player1Won ? awardedPoints : 0,
        player2ScoreDelta: player1Won ? 0 : awardedPoints,
    }
}