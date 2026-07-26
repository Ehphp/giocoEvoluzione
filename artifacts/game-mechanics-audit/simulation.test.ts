import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
    EVENT_WEIGHT,
    FINAL_ROUND_NUMBER,
    MAX_EFFECTIVE_TRAIT_LEVEL,
    TOTAL_ROUNDS,
    TRAITS,
    createInitialTraits,
} from '../../src/game/config'
import { getRoundPoints, isTraitEvolvable, resolveRound } from '../../src/game/engine'
import {
    generateRoundEventSequence,
    getRoundEventById,
    getRoundEventEffectsForTrait,
} from '../../src/game/round-events'
import type {
    ActionType,
    RoundEventDefinition,
    TraitCollection,
    TraitType,
} from '../../src/game/types'

type Rng = () => number

type SimAction = {
    trait: TraitType
    actionType: ActionType
}

function actionKeyForAudit(action: SimAction): string {
    return `${action.actionType}:${action.trait}`
}

type StrategyContext = {
    roundNumber: number
    sequence: RoundEventDefinition[]
    selfTraits: TraitCollection
    opponentTraits: TraitCollection
    random: Rng
}

type Strategy = {
    id: string
    label: string
    choose: (context: StrategyContext) => SimAction
}

type PlayerGameStats = {
    strategyId: string
    score: number
    actions: SimAction[]
    values: number[]
    cooldownBlockedBest: boolean[]
    levelsAfter: TraitCollection
}

type SimulatedGame = {
    player1: PlayerGameStats
    player2: PlayerGameStats
    roundWinners: Array<1 | 2 | 0>
    pointDeltas: Array<[number, number]>
}

type Aggregate = {
    games: number
    wins: number
    losses: number
    draws: number
    scoreFor: number
    scoreAgainst: number
    uses: number
    evolves: number
    matchRoundTies: number
    cooldownBlockedBest: number
    valuesByRound: number[]
    decisivePointsByRound: number[]
    pivotalRounds: number[]
    traitSelections: Record<TraitType, number>
    winningActionSignatures: Record<string, number>
}

const auditDescribe = process.env.RUN_GAME_MECHANICS_AUDIT === '1' ? describe : describe.skip

function makeRng(seed: number): Rng {
    let state = seed >>> 0

    return () => {
        state = (1664525 * state + 1013904223) >>> 0
        return state / 0x100000000
    }
}

function hashText(text: string): number {
    let hash = 2166136261

    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }

    return hash >>> 0
}

function cloneTraits(traits: TraitCollection): TraitCollection {
    return Object.fromEntries(
        Object.entries(traits).map(([trait, state]) => [trait, { ...state }]),
    ) as TraitCollection
}

function eventContribution(event: RoundEventDefinition, trait: TraitType): number {
    return getRoundEventEffectsForTrait(event, trait)
        .reduce((sum, effect) => sum + effect.modifier * EVENT_WEIGHT, 0)
}

function actionValue(event: RoundEventDefinition, traits: TraitCollection, action: SimAction): number {
    if (action.actionType === 'EVOLVE') {
        return 0
    }

    return eventContribution(event, action.trait)
        + Math.min(MAX_EFFECTIVE_TRAIT_LEVEL, traits[action.trait].level)
}

function legalActions(traits: TraitCollection): SimAction[] {
    const actions: SimAction[] = []

    for (const trait of TRAITS) {
        if (isTraitEvolvable(traits, trait)) {
            actions.push({ trait, actionType: 'EVOLVE' })
        }

        if (traits[trait].cooldown === 0) {
            actions.push({ trait, actionType: 'USE' })
        }
    }

    return actions
}

function legalUses(traits: TraitCollection, excludedTraits: TraitType[] = []): SimAction[] {
    return TRAITS
        .filter((trait) => traits[trait].cooldown === 0 && !excludedTraits.includes(trait))
        .map((trait) => ({ trait, actionType: 'USE' as const }))
}

function chooseBestUse(
    event: RoundEventDefinition,
    traits: TraitCollection,
    excludedTraits: TraitType[] = [],
): SimAction {
    const candidates = legalUses(traits, excludedTraits)
    const usableCandidates = candidates.length > 0 ? candidates : legalUses(traits)

    return usableCandidates.reduce((best, action) => {
        const value = actionValue(event, traits, action)
        const bestValue = actionValue(event, traits, best)

        if (value !== bestValue) {
            return value > bestValue ? action : best
        }

        const actionLevel = traits[action.trait].level
        const bestLevel = traits[best.trait].level

        if (actionLevel !== bestLevel) {
            return actionLevel > bestLevel ? action : best
        }

        return TRAITS.indexOf(action.trait) < TRAITS.indexOf(best.trait) ? action : best
    })
}

function cooldownBlocksBestUse(
    event: RoundEventDefinition,
    traits: TraitCollection,
): boolean {
    const unrestrictedMaximum = Math.max(
        ...TRAITS.map((trait) => actionValue(
            event,
            traits,
            { trait, actionType: 'USE' },
        )),
    )
    const legalMaximum = Math.max(
        ...legalUses(traits).map((action) => actionValue(event, traits, action)),
    )

    return legalMaximum < unrestrictedMaximum
}

function topTraitsForEvent(event: RoundEventDefinition): TraitType[] {
    const maximum = Math.max(...TRAITS.map((trait) => eventContribution(event, trait)))

    return TRAITS.filter((trait) => eventContribution(event, trait) === maximum)
}

function finalInvestmentTrait(sequence: RoundEventDefinition[]): TraitType {
    const finalEvent = sequence[FINAL_ROUND_NUMBER - 1]
    const top = topTraitsForEvent(finalEvent)

    return top.reduce((best, trait) => {
        const traitEarlierPositiveRounds = sequence
            .slice(0, FINAL_ROUND_NUMBER - 1)
            .filter((event) => eventContribution(event, trait) > 0)
            .length
        const bestEarlierPositiveRounds = sequence
            .slice(0, FINAL_ROUND_NUMBER - 1)
            .filter((event) => eventContribution(event, best) > 0)
            .length

        return traitEarlierPositiveRounds < bestEarlierPositiveRounds ? trait : best
    })
}

function weightedRemainingAffinity(
    sequence: RoundEventDefinition[],
    roundNumber: number,
    trait: TraitType,
): number {
    return sequence.slice(roundNumber).reduce((sum, event, offset) => {
        const futureRound = roundNumber + offset + 1
        const pointWeight = getRoundPoints(futureRound)
        return sum + Math.max(0, eventContribution(event, trait)) * pointWeight
    }, 0)
}

function preserveFinalTraitIfNeeded(context: StrategyContext, trait: TraitType): TraitType[] {
    return context.roundNumber === FINAL_ROUND_NUMBER - 1 ? [trait] : []
}

const randomStrategy: Strategy = {
    id: 'random',
    label: 'Casuale uniforme tra azioni legali',
    choose(context) {
        const actions = legalActions(context.selfTraits)
        return actions[Math.floor(context.random() * actions.length)] ?? actions[0]
    },
}

const immediateGreedy: Strategy = {
    id: 'immediate_greedy',
    label: 'USE col valore immediato massimo',
    choose(context) {
        return chooseBestUse(context.sequence[context.roundNumber - 1], context.selfTraits)
    },
}

const principalGeneGreedy: Strategy = {
    id: 'principal_gene_greedy',
    label: 'Prova il gene +2; se in cooldown usa il migliore USE alternativo',
    choose(context) {
        const event = context.sequence[context.roundNumber - 1]
        const principal = TRAITS.find(
            (trait) =>
                eventContribution(event, trait) === 2
                && context.selfTraits[trait].cooldown === 0,
        )

        return principal
            ? { trait: principal, actionType: 'USE' }
            : chooseBestUse(event, context.selfTraits)
    },
}

const oneEventLookaheadGreedy: Strategy = {
    id: 'one_event_lookahead',
    label: 'Massimizza valore corrente più il migliore USE del prossimo evento',
    choose(context) {
        const currentEvent = context.sequence[context.roundNumber - 1]
        const nextEvent = context.sequence[context.roundNumber]
        const actions = legalActions(context.selfTraits)

        return actions.reduce((best, action) => {
            const score = (candidate: SimAction) => {
                const nextTraits = simulateOwnTransition(
                    context.selfTraits,
                    candidate,
                )
                const future = nextEvent
                    ? actionValue(
                        nextEvent,
                        nextTraits,
                        chooseBestUse(nextEvent, nextTraits),
                    )
                    : 0
                return actionValue(currentEvent, context.selfTraits, candidate)
                    + future
            }
            const candidateScore = score(action)
            const bestScore = score(best)

            return candidateScore > bestScore
                ? action
                : candidateScore < bestScore
                    ? best
                    : actionKeyForAudit(action).localeCompare(
                        actionKeyForAudit(best),
                    ) < 0
                        ? action
                        : best
        })
    },
}

const conserveMetabolism: Strategy = {
    id: 'conserve_metabolism',
    label: 'Conserva METABOLISM quando HEAT e NUTRIENT sono consecutivi',
    choose(context) {
        const currentEvent = context.sequence[context.roundNumber - 1]
        const nextEvent = context.sequence[context.roundNumber]
        const pairIsConsecutive =
            (
                currentEvent.id === 'HEAT_SPIKE'
                && nextEvent?.id === 'NUTRIENT_COLLAPSE'
            )
            || (
                currentEvent.id === 'NUTRIENT_COLLAPSE'
                && nextEvent?.id === 'HEAT_SPIKE'
            )

        return chooseBestUse(
            currentEvent,
            context.selfTraits,
            pairIsConsecutive ? ['METABOLISM'] : [],
        )
    },
}

const evolveNutrientAlternative: Strategy = {
    id: 'evolve_nutrient_alternative',
    label: 'Evolve FAT_RESERVES o ADAPTATION come alternativa nutritiva',
    choose(context) {
        const nutrientIndex = context.sequence.findIndex(
            (event) => event.id === 'NUTRIENT_COLLAPSE',
        )
        const currentIndex = context.roundNumber - 1
        const candidates: TraitType[] = ['FAT_RESERVES', 'ADAPTATION']
        const alreadyInvested = candidates.some(
            (trait) => context.selfTraits[trait].level > 0,
        )

        if (
            !alreadyInvested
            && currentIndex < nutrientIndex
            && nutrientIndex - currentIndex <= 2
        ) {
            const trait = candidates.find(
                (candidate) => isTraitEvolvable(context.selfTraits, candidate),
            )
            if (trait) {
                return { trait, actionType: 'EVOLVE' }
            }
        }

        return chooseBestUse(
            context.sequence[currentIndex],
            context.selfTraits,
        )
    },
}

function createFinalInvestmentStrategy(evolutions: number): Strategy {
    return {
        id: `final_gene_evolve_${evolutions}`,
        label: `Evolve il gene finale nei primi ${evolutions} round, poi USE`,
        choose(context) {
            const finalTrait = finalInvestmentTrait(context.sequence)

            if (context.roundNumber <= evolutions) {
                return { trait: finalTrait, actionType: 'EVOLVE' }
            }

            return chooseBestUse(
                context.sequence[context.roundNumber - 1],
                context.selfTraits,
                preserveFinalTraitIfNeeded(context, finalTrait),
            )
        },
    }
}

const futureFavorite: Strategy = {
    id: 'future_favorite',
    label: 'Una evoluzione sul gene con più affinità futura',
    choose(context) {
        const hasInvested = TRAITS.some((trait) => context.selfTraits[trait].level > 0)

        if (!hasInvested && context.roundNumber < FINAL_ROUND_NUMBER) {
            const trait = TRAITS.reduce((best, candidate) => (
                weightedRemainingAffinity(context.sequence, context.roundNumber, candidate)
                    > weightedRemainingAffinity(context.sequence, context.roundNumber, best)
                    ? candidate
                    : best
            ))

            if (weightedRemainingAffinity(context.sequence, context.roundNumber, trait) > 0) {
                return { trait, actionType: 'EVOLVE' }
            }
        }

        return chooseBestUse(context.sequence[context.roundNumber - 1], context.selfTraits)
    },
}

const nextEventEvolver: Strategy = {
    id: 'next_event_evolver',
    label: 'Nei round dispari evolve un gene principale del prossimo evento',
    choose(context) {
        if (context.roundNumber < FINAL_ROUND_NUMBER && context.roundNumber % 2 === 1) {
            const nextEvent = context.sequence[context.roundNumber]
            const trait = topTraitsForEvent(nextEvent)
                .find((candidate) => isTraitEvolvable(context.selfTraits, candidate))

            if (trait) {
                return { trait, actionType: 'EVOLVE' }
            }
        }

        return chooseBestUse(context.sequence[context.roundNumber - 1], context.selfTraits)
    },
}

const avoidPenalties: Strategy = {
    id: 'avoid_penalties',
    label: 'Evita sempre valori negativi, scelta casuale tra USE non negativi',
    choose(context) {
        const event = context.sequence[context.roundNumber - 1]
        const safe = legalUses(context.selfTraits)
            .filter((action) => actionValue(event, context.selfTraits, action) >= 0)

        if (safe.length === 0) {
            const trait = TRAITS[Math.floor(context.random() * TRAITS.length)] ?? TRAITS[0]
            return { trait, actionType: 'EVOLVE' }
        }

        return safe[Math.floor(context.random() * safe.length)] ?? safe[0]
    },
}

function simulateOwnTransition(traits: TraitCollection, action: SimAction): TraitCollection {
    const next = cloneTraits(traits)

    for (const trait of TRAITS) {
        next[trait].cooldown = Math.max(0, next[trait].cooldown - 1)
    }

    if (action.actionType === 'EVOLVE') {
        next[action.trait].level = Math.min(
            MAX_EFFECTIVE_TRAIT_LEVEL,
            next[action.trait].level + 1,
        )
    } else {
        next[action.trait].cooldown = 1
    }

    return next
}

function stateKey(roundIndex: number, traits: TraitCollection): string {
    return `${roundIndex}|${TRAITS.map((trait) => `${traits[trait].level},${traits[trait].cooldown}`).join('|')}`
}

const fullForesightMemo = new Map<string, { utility: number; action: SimAction }>()

function chooseFullForesightAction(context: StrategyContext): SimAction {
    const sequenceKey = context.sequence.map((event) => event.id).join(',')

    function search(roundIndex: number, traits: TraitCollection): { utility: number; action: SimAction } {
        const key = `${sequenceKey}|${stateKey(roundIndex, traits)}`
        const cached = fullForesightMemo.get(key)

        if (cached) {
            return cached
        }

        const event = context.sequence[roundIndex]
        const roundNumber = roundIndex + 1
        const pointWeight = getRoundPoints(roundNumber)
        // This strategy is deliberately the requested "full-sequence greedy":
        // it optimizes the complete weighted USE schedule and cooldown rotation,
        // but does not model the opponent or invest with EVOLVE.
        const actions = legalUses(traits)
        let bestAction = actions[0]
        let bestUtility = Number.NEGATIVE_INFINITY

        for (const action of actions) {
            const immediate = actionValue(event, traits, action) * pointWeight
            const future = roundIndex + 1 < TOTAL_ROUNDS
                ? search(roundIndex + 1, simulateOwnTransition(traits, action)).utility
                : 0
            const utility = immediate + future

            if (
                utility > bestUtility
                || (
                    utility === bestUtility
                    && action.actionType === 'USE'
                    && bestAction.actionType === 'EVOLVE'
                )
            ) {
                bestUtility = utility
                bestAction = action
            }
        }

        const result = { utility: bestUtility, action: bestAction }
        fullForesightMemo.set(key, result)
        return result
    }

    return search(context.roundNumber - 1, context.selfTraits).action
}

const fullForesightGreedy: Strategy = {
    id: 'full_foresight_value',
    label: 'Massimizza con DP il valore pesato conoscendo tutta la sequenza',
    choose: chooseFullForesightAction,
}

const responseAware: Strategy = {
    id: 'response_aware',
    label: 'Massimizza l’esito atteso contro tutte le risposte legali',
    choose(context) {
        const event = context.sequence[context.roundNumber - 1]
        const points = getRoundPoints(context.roundNumber)
        const ownActions = legalActions(context.selfTraits)
        const opponentActions = legalActions(context.opponentTraits)
        let bestAction = ownActions[0]
        let bestScore = Number.NEGATIVE_INFINITY

        for (const ownAction of ownActions) {
            const ownValue = actionValue(event, context.selfTraits, ownAction)
            const payoffs = opponentActions.map((opponentAction) => {
                const opponentValue = actionValue(event, context.opponentTraits, opponentAction)
                return ownValue === opponentValue ? 0 : ownValue > opponentValue ? points : -points
            })
            const mean = payoffs.reduce((sum, payoff) => sum + payoff, 0) / payoffs.length
            const worst = Math.min(...payoffs)
            const futureEvolutionValue = ownAction.actionType === 'EVOLVE'
                ? weightedRemainingAffinity(context.sequence, context.roundNumber, ownAction.trait) * 0.02
                : 0
            const score = mean + worst * 0.15 + futureEvolutionValue

            if (score > bestScore) {
                bestScore = score
                bestAction = ownAction
            }
        }

        return bestAction
    },
}

let exactBestResponseActions:
    | Map<string, SimAction[]>
    | null = null

function getExactBestResponseActions(): Map<string, SimAction[]> {
    if (exactBestResponseActions) {
        return exactBestResponseActions
    }

    const solverResultsPath = fileURLToPath(
        new URL('../game-mechanics-solver/results.json', import.meta.url),
    )
    const parsed = JSON.parse(
        readFileSync(solverResultsPath, 'utf8'),
    ) as {
        fullKnowledge: {
            sequences: Array<{
                events: string[]
                trace: Array<{ optimizerAction: SimAction }>
            }>
        }
    }
    exactBestResponseActions = new Map(
        parsed.fullKnowledge.sequences.map((solution) => [
            solution.events.join('|'),
            solution.trace.map((round) => ({ ...round.optimizerAction })),
        ]),
    )
    return exactBestResponseActions
}

const exactBestResponseReplay: Strategy = {
    id: 'exact_best_response_vs_greedy',
    label: 'Best response esatta contro GREEDY immediata (percorso rigiocato)',
    choose(context) {
        const key = context.sequence.map((event) => event.id).join('|')
        const action = getExactBestResponseActions()
            .get(key)
            ?.[context.roundNumber - 1]

        if (!action) {
            throw new Error(`Missing exact best response action for ${key}.`)
        }

        return action
    },
}

const benchmarkStrategies: Strategy[] = [
    randomStrategy,
    immediateGreedy,
    principalGeneGreedy,
    oneEventLookaheadGreedy,
    conserveMetabolism,
    evolveNutrientAlternative,
    createFinalInvestmentStrategy(1),
    createFinalInvestmentStrategy(2),
    createFinalInvestmentStrategy(3),
    futureFavorite,
    nextEventEvolver,
    avoidPenalties,
    fullForesightGreedy,
    responseAware,
    exactBestResponseReplay,
]

function simulateGame(
    player1Strategy: Strategy,
    player2Strategy: Strategy,
    sequenceIds: string[],
    player1Seed: number,
    player2Seed: number,
): SimulatedGame {
    const sequence = sequenceIds.map(getRoundEventById)
    const random1 = makeRng(player1Seed)
    const random2 = makeRng(player2Seed)
    let player1Traits = createInitialTraits()
    let player2Traits = createInitialTraits()
    let player1Score = 0
    let player2Score = 0
    const player1Actions: SimAction[] = []
    const player2Actions: SimAction[] = []
    const player1Values: number[] = []
    const player2Values: number[] = []
    const player1CooldownBlockedBest: boolean[] = []
    const player2CooldownBlockedBest: boolean[] = []
    const roundWinners: Array<1 | 2 | 0> = []
    const pointDeltas: Array<[number, number]> = []

    for (let roundNumber = 1; roundNumber <= TOTAL_ROUNDS; roundNumber += 1) {
        const roundEvent = sequence[roundNumber - 1]
        player1CooldownBlockedBest.push(
            cooldownBlocksBestUse(roundEvent, player1Traits),
        )
        player2CooldownBlockedBest.push(
            cooldownBlocksBestUse(roundEvent, player2Traits),
        )
        const player1Action = player1Strategy.choose({
            roundNumber,
            sequence,
            selfTraits: player1Traits,
            opponentTraits: player2Traits,
            random: random1,
        })
        const player2Action = player2Strategy.choose({
            roundNumber,
            sequence,
            selfTraits: player2Traits,
            opponentTraits: player1Traits,
            random: random2,
        })

        const resolution = resolveRound({
            roundNumber,
            roundEvent: sequence[roundNumber - 1],
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits,
            player2Traits,
            player1Action: {
                playerId: 'p1',
                trait: player1Action.trait,
                actionType: player1Action.actionType,
            },
            player2Action: {
                playerId: 'p2',
                trait: player2Action.trait,
                actionType: player2Action.actionType,
            },
        })

        player1Traits = resolution.player1.traits
        player2Traits = resolution.player2.traits
        player1Score += resolution.player1ScoreDelta
        player2Score += resolution.player2ScoreDelta
        player1Actions.push(player1Action)
        player2Actions.push(player2Action)
        player1Values.push(resolution.player1.roundValue)
        player2Values.push(resolution.player2.roundValue)
        roundWinners.push(resolution.winnerId === null ? 0 : resolution.winnerId === 'p1' ? 1 : 2)
        pointDeltas.push([resolution.player1ScoreDelta, resolution.player2ScoreDelta])
    }

    return {
        player1: {
            strategyId: player1Strategy.id,
            score: player1Score,
            actions: player1Actions,
            values: player1Values,
            cooldownBlockedBest: player1CooldownBlockedBest,
            levelsAfter: player1Traits,
        },
        player2: {
            strategyId: player2Strategy.id,
            score: player2Score,
            actions: player2Actions,
            values: player2Values,
            cooldownBlockedBest: player2CooldownBlockedBest,
            levelsAfter: player2Traits,
        },
        roundWinners,
        pointDeltas,
    }
}

function emptyAggregate(): Aggregate {
    return {
        games: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        uses: 0,
        evolves: 0,
        matchRoundTies: 0,
        cooldownBlockedBest: 0,
        valuesByRound: Array(TOTAL_ROUNDS).fill(0),
        decisivePointsByRound: Array(TOTAL_ROUNDS).fill(0),
        pivotalRounds: Array(TOTAL_ROUNDS).fill(0),
        traitSelections: Object.fromEntries(TRAITS.map((trait) => [trait, 0])) as Record<TraitType, number>,
        winningActionSignatures: {},
    }
}

function outcome(scoreFor: number, scoreAgainst: number): -1 | 0 | 1 {
    return scoreFor === scoreAgainst ? 0 : scoreFor > scoreAgainst ? 1 : -1
}

function addGameToAggregate(
    aggregate: Aggregate,
    game: SimulatedGame,
    perspective: 1 | 2,
) {
    const self = perspective === 1 ? game.player1 : game.player2
    const opponent = perspective === 1 ? game.player2 : game.player1
    const result = outcome(self.score, opponent.score)
    aggregate.games += 1
    aggregate.wins += result === 1 ? 1 : 0
    aggregate.losses += result === -1 ? 1 : 0
    aggregate.draws += result === 0 ? 1 : 0
    aggregate.scoreFor += self.score
    aggregate.scoreAgainst += opponent.score

    self.actions.forEach((action, roundIndex) => {
        aggregate.uses += action.actionType === 'USE' ? 1 : 0
        aggregate.evolves += action.actionType === 'EVOLVE' ? 1 : 0
        aggregate.traitSelections[action.trait] += 1
        aggregate.valuesByRound[roundIndex] += self.values[roundIndex]
        aggregate.cooldownBlockedBest += self.cooldownBlockedBest[roundIndex]
            ? 1
            : 0

        if (game.roundWinners[roundIndex] === 0) {
            aggregate.matchRoundTies += 1
        }

        const [player1Delta, player2Delta] = game.pointDeltas[roundIndex]
        aggregate.decisivePointsByRound[roundIndex] += player1Delta + player2Delta

        const selfDelta = perspective === 1 ? player1Delta : player2Delta
        const opponentDelta = perspective === 1 ? player2Delta : player1Delta
        const withoutRound = outcome(self.score - selfDelta, opponent.score - opponentDelta)

        if (withoutRound !== result) {
            aggregate.pivotalRounds[roundIndex] += 1
        }
    })

    if (result === 1) {
        const signature = self.actions.map((action) => `${action.actionType[0]}:${action.trait}`).join('>')
        aggregate.winningActionSignatures[signature] = (aggregate.winningActionSignatures[signature] ?? 0) + 1
    }
}

function roundNumber(value: number, digits = 3): number {
    return Number(value.toFixed(digits))
}

function summarize(aggregate: Aggregate) {
    const totalActions = aggregate.games * TOTAL_ROUNDS
    const totalDecisivePoints = aggregate.decisivePointsByRound.reduce((sum, value) => sum + value, 0)
    const selectedTraits = Object.fromEntries(
        Object.entries(aggregate.traitSelections)
            .sort((left, right) => right[1] - left[1])
            .map(([trait, count]) => [trait, roundNumber(count / totalActions * 100, 2)]),
    )
    const winningPatterns = Object.entries(aggregate.winningActionSignatures)
        .sort((left, right) => right[1] - left[1])
    const winningPatternTotal = winningPatterns.reduce((sum, [, count]) => sum + count, 0)
    const winningPatternEntropy = winningPatternTotal === 0
        ? 0
        : -winningPatterns.reduce((sum, [, count]) => {
            const probability = count / winningPatternTotal
            return sum + probability * Math.log2(probability)
        }, 0)

    return {
        games: aggregate.games,
        winPct: roundNumber(aggregate.wins / aggregate.games * 100),
        lossPct: roundNumber(aggregate.losses / aggregate.games * 100),
        drawPct: roundNumber(aggregate.draws / aggregate.games * 100),
        avgScoreFor: roundNumber(aggregate.scoreFor / aggregate.games),
        avgScoreAgainst: roundNumber(aggregate.scoreAgainst / aggregate.games),
        avgUse: roundNumber(aggregate.uses / aggregate.games),
        avgEvolve: roundNumber(aggregate.evolves / aggregate.games),
        cooldownBlockedBestPct: roundNumber(
            aggregate.cooldownBlockedBest / totalActions * 100,
        ),
        avgRoundValue: aggregate.valuesByRound.map((value) => roundNumber(value / aggregate.games)),
        roundTiePct: roundNumber(aggregate.matchRoundTies / totalActions * 100),
        traitSelectionPct: selectedTraits,
        decisivePointSharePct: aggregate.decisivePointsByRound.map((value) => (
            roundNumber(totalDecisivePoints === 0 ? 0 : value / totalDecisivePoints * 100)
        )),
        pivotalRoundPct: aggregate.pivotalRounds.map((value) => roundNumber(value / aggregate.games * 100)),
        distinctWinningActionPatterns: winningPatterns.length,
        winningPatternEntropyBits: roundNumber(winningPatternEntropy),
        topWinningActionPatterns: winningPatterns.slice(0, 5).map(([signature, count]) => ({
            signature,
            pctOfWins: roundNumber(count / winningPatternTotal * 100),
        })),
    }
}

function sequenceForGame(index: number): string[] {
    return generateRoundEventSequence(TOTAL_ROUNDS, makeRng(0x9e3779b9 ^ index))
}

function strategySeed(strategy: Strategy, gameIndex: number, stream: number): number {
    return (hashText(strategy.id) ^ Math.imul(gameIndex + 1, 2654435761) ^ stream) >>> 0
}

auditDescribe('game mechanics audit simulation', () => {
    it('runs a deterministic strategy tournament over at least 100,000 games', () => {
        const benchmarkGamesPerOrientation = 2_000
        const tournamentGamesPerOrientation = 400
        const benchmark: Record<string, ReturnType<typeof summarize>> = {}
        const roundRobin: Record<string, Record<string, { winPct: number; drawPct: number; lossPct: number }>> = {}
        let totalGames = 0
        let slot1Wins = 0
        let slot2Wins = 0
        let matchDraws = 0

        for (const strategy of benchmarkStrategies) {
            const aggregate = emptyAggregate()

            for (let index = 0; index < benchmarkGamesPerOrientation; index += 1) {
                const sequence = sequenceForGame(index)
                const strategyRngSeed = strategySeed(strategy, index, 0x12345678)
                const randomRngSeed = strategySeed(randomStrategy, index, 0x87654321)
                const asPlayer1 = simulateGame(strategy, randomStrategy, sequence, strategyRngSeed, randomRngSeed)
                const asPlayer2 = simulateGame(randomStrategy, strategy, sequence, randomRngSeed, strategyRngSeed)

                addGameToAggregate(aggregate, asPlayer1, 1)
                addGameToAggregate(aggregate, asPlayer2, 2)

                for (const game of [asPlayer1, asPlayer2]) {
                    slot1Wins += game.player1.score > game.player2.score ? 1 : 0
                    slot2Wins += game.player2.score > game.player1.score ? 1 : 0
                    matchDraws += game.player1.score === game.player2.score ? 1 : 0
                }
            }

            benchmark[strategy.id] = summarize(aggregate)
            totalGames += aggregate.games
        }

        for (const strategy of benchmarkStrategies) {
            roundRobin[strategy.id] = {}
        }

        for (let leftIndex = 0; leftIndex < benchmarkStrategies.length; leftIndex += 1) {
            for (let rightIndex = leftIndex; rightIndex < benchmarkStrategies.length; rightIndex += 1) {
                const left = benchmarkStrategies[leftIndex]
                const right = benchmarkStrategies[rightIndex]
                const leftAggregate = emptyAggregate()
                const rightAggregate = emptyAggregate()

                for (let index = 0; index < tournamentGamesPerOrientation; index += 1) {
                    const sequence = sequenceForGame(50_000 + index)
                    const leftSeed = strategySeed(left, index, 0xabcdef01)
                    const rightSeed = strategySeed(right, index, 0x10fedcba)
                    const first = simulateGame(left, right, sequence, leftSeed, rightSeed)
                    const second = simulateGame(right, left, sequence, rightSeed, leftSeed)

                    addGameToAggregate(leftAggregate, first, 1)
                    addGameToAggregate(rightAggregate, first, 2)
                    addGameToAggregate(leftAggregate, second, 2)
                    addGameToAggregate(rightAggregate, second, 1)

                    for (const game of [first, second]) {
                        slot1Wins += game.player1.score > game.player2.score ? 1 : 0
                        slot2Wins += game.player2.score > game.player1.score ? 1 : 0
                        matchDraws += game.player1.score === game.player2.score ? 1 : 0
                    }
                }

                const leftSummary = summarize(leftAggregate)
                const rightSummary = summarize(rightAggregate)
                roundRobin[left.id][right.id] = {
                    winPct: leftSummary.winPct,
                    drawPct: leftSummary.drawPct,
                    lossPct: leftSummary.lossPct,
                }
                roundRobin[right.id][left.id] = {
                    winPct: rightSummary.winPct,
                    drawPct: rightSummary.drawPct,
                    lossPct: rightSummary.lossPct,
                }
                totalGames += leftAggregate.games
            }
        }

        const evolutionLadder: Record<string, Record<string, { winPct: number; drawPct: number; lossPct: number }>> = {}
        const ladderStrategies = Array.from(
            { length: MAX_EFFECTIVE_TRAIT_LEVEL + 1 },
            (_, evolutions) => createFinalInvestmentStrategy(evolutions),
        )
        const ladderGamesPerPair = 1_000

        for (const strategy of ladderStrategies) {
            evolutionLadder[strategy.id] = {}
        }

        for (const left of ladderStrategies) {
            for (const right of ladderStrategies) {
                const aggregate = emptyAggregate()

                for (let index = 0; index < ladderGamesPerPair; index += 1) {
                    const game = simulateGame(
                        left,
                        right,
                        sequenceForGame(100_000 + index),
                        strategySeed(left, index, 0x11111111),
                        strategySeed(right, index, 0x22222222),
                    )
                    addGameToAggregate(aggregate, game, 1)
                }

                const summary = summarize(aggregate)
                evolutionLadder[left.id][right.id] = {
                    winPct: summary.winPct,
                    drawPct: summary.drawPct,
                    lossPct: summary.lossPct,
                }
                totalGames += aggregate.games
            }
        }

        const eventGeneTotals = Object.fromEntries(TRAITS.map((trait) => {
            const contributions = benchmarkStrategies.length > 0
                ? [
                    'VOLCANIC_ASH_WAVE',
                    'PROLONGED_ECLIPSE',
                    'PREDATOR_PACK_MIGRATION',
                    'HEAT_SPIKE',
                    'NUTRIENT_COLLAPSE',
                    'FLASH_FLOOD',
                ].map((eventId) => eventContribution(getRoundEventById(eventId), trait))
                : []

            return [trait, {
                eventContributions: contributions,
                total: contributions.reduce((sum, value) => sum + value, 0),
                positiveEvents: contributions.filter((value) => value > 0).length,
                negativeEvents: contributions.filter((value) => value < 0).length,
            }]
        }))

        const decisiveGames = slot1Wins + slot2Wins
        const results = {
            metadata: {
                generatedAt: new Date().toISOString(),
                seedScheme: 'LCG 1664525/1013904223; event seeds derived from fixed game index',
                totalGames,
                benchmarkGames: benchmarkGamesPerOrientation * 2 * benchmarkStrategies.length,
                roundRobinGames: tournamentGamesPerOrientation * 2
                    * (benchmarkStrategies.length * (benchmarkStrategies.length + 1) / 2),
                evolutionLadderGames: ladderGamesPerPair * ladderStrategies.length * ladderStrategies.length,
                productionEngineImported: true,
                normalTestRunSkippedUnless: 'RUN_GAME_MECHANICS_AUDIT=1',
            },
            strategies: Object.fromEntries(benchmarkStrategies.map((strategy) => [strategy.id, strategy.label])),
            benchmarkVsRandom: benchmark,
            roundRobin,
            evolutionLadder,
            slotBalance: {
                slot1Wins,
                slot2Wins,
                matchDraws,
                slot1PctOfDecisive: roundNumber(slot1Wins / decisiveGames * 100),
                slot2PctOfDecisive: roundNumber(slot2Wins / decisiveGames * 100),
            },
            eventGeneTotals,
        }

        const outputPath = fileURLToPath(new URL('./results.json', import.meta.url))
        writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8')

        expect(totalGames).toBeGreaterThanOrEqual(100_000)
        expect(results.metadata.productionEngineImported).toBe(true)
        expect(slot1Wins + slot2Wins + matchDraws).toBeGreaterThan(0)
    }, 120_000)
})
