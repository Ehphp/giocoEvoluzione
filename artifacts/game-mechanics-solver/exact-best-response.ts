import {
    EVENT_WEIGHT,
    BASE_USE_VALUE,
    MAX_EFFECTIVE_TRAIT_LEVEL,
    TOTAL_ROUNDS,
    TRAITS,
    createInitialTraits,
} from '../../src/game/config.ts'
import { getLegalBotActions, type BotRoundAction } from '../../src/game/bot.ts'
import { getTraitRoundValue, resolveRound } from '../../src/game/engine.ts'
import {
    ROUND_EVENT_DEFINITIONS,
    getRoundEventById,
} from '../../src/game/round-events.ts'
import { getValidatedRoundEventModifier } from '../../src/game/scoring.ts'
import type {
    PlayerRoundAction,
    TraitCollection,
    TraitType,
} from '../../src/game/types.ts'

export type GreedyMode = 'modifier-plus-two' | 'immediate-value'
export type Outcome = 'WIN' | 'DRAW' | 'LOSS'

export type RoundTrace = {
    roundNumber: number
    eventId: string
    optimizerAction: BotRoundAction
    greedyAction: BotRoundAction
    optimizerValue: number
    greedyValue: number
    optimizerScoreAfter: number
    greedyScoreAfter: number
    optimizerTraitsBefore: TraitCollection
    optimizerTraitsAfter: TraitCollection
    greedyTraitsBefore: TraitCollection
    greedyTraitsAfter: TraitCollection
}

export type SequenceSolution = {
    events: string[]
    outcome: Outcome
    differential: number
    optimizerScore: number
    greedyScore: number
    trace: RoundTrace[]
}

export type AggregateSummary = {
    totalSequences: number
    wins: number
    draws: number
    losses: number
    maximumDifferential: number
    minimumDifferential: number
}

export type TieBreakAudit = {
    decisions: number
    tiedDecisions: number
    maximumTieWidth: number
    catalogAndReverseChooseSameAction: boolean
}

type SearchNode = {
    optimizerScore: number
    greedyScore: number
    action?: BotRoundAction
    greedyAction?: BotRoundAction
}

type SearchState = {
    roundIndex: number
    optimizerTraits: TraitCollection
    greedyTraits: TraitCollection
}

type Fraction = {
    numerator: bigint
    denominator: bigint
}

type LimitedNode = {
    expectedDifferential: Fraction
    expectedOptimizerScore: Fraction
    action?: BotRoundAction
}

const CATALOG_TIE_ORDER = [...TRAITS]
const REVERSE_TIE_ORDER = [...TRAITS].reverse()

function cloneTraits(traits: TraitCollection): TraitCollection {
    return Object.fromEntries(
        TRAITS.map((trait) => [trait, { ...traits[trait] }]),
    ) as TraitCollection
}

function encodeTraits(traits: TraitCollection): string {
    return TRAITS
        .map((trait) => `${traits[trait].level},${traits[trait].cooldown}`)
        .join('|')
}

function actionKey(action: BotRoundAction): string {
    return `${action.actionType}:${action.trait}`
}

function stateKey(sequence: string[], state: SearchState): string {
    return [
        sequence.slice(state.roundIndex).join(','),
        encodeTraits(state.optimizerTraits),
        encodeTraits(state.greedyTraits),
    ].join('#')
}

function outcomeFromDifferential(differential: number): Outcome {
    return differential > 0 ? 'WIN' : differential < 0 ? 'LOSS' : 'DRAW'
}

function toPlayerAction(playerId: string, action: BotRoundAction): PlayerRoundAction {
    return {
        playerId,
        trait: action.trait,
        actionType: action.actionType,
    }
}

function isSameAction(left: BotRoundAction, right: BotRoundAction): boolean {
    return left.trait === right.trait && left.actionType === right.actionType
}

function isLegalAction(traits: TraitCollection, action: BotRoundAction): boolean {
    return getLegalBotActions(traits).some((legalAction) => isSameAction(legalAction, action))
}

function compareSearchNodes(left: SearchNode, right: SearchNode): number {
    const leftDifferential = left.optimizerScore - left.greedyScore
    const rightDifferential = right.optimizerScore - right.greedyScore

    if (leftDifferential !== rightDifferential) {
        return leftDifferential - rightDifferential
    }

    if (left.optimizerScore !== right.optimizerScore) {
        return left.optimizerScore - right.optimizerScore
    }

    if (left.action && right.action) {
        return actionKey(right.action).localeCompare(actionKey(left.action))
    }

    return 0
}

function greedyUseScore(
    mode: GreedyMode,
    eventId: string,
    traits: TraitCollection,
    action: BotRoundAction,
): number {
    const event = getRoundEventById(eventId)

    if (mode === 'modifier-plus-two') {
        return getValidatedRoundEventModifier(event, action.trait).modifierTotal
    }

    return getTraitRoundValue(event, traits, action.trait)
}

export function getGreedyCandidates(
    mode: GreedyMode,
    eventId: string,
    traits: TraitCollection,
): BotRoundAction[] {
    const legalUses = getLegalBotActions(traits)
        .filter((action) => action.actionType === 'USE')

    if (legalUses.length === 0) {
        throw new Error('GREEDY has no legal USE action.')
    }

    if (mode === 'modifier-plus-two') {
        const plusTwo = legalUses.filter((action) => (
            greedyUseScore(mode, eventId, traits, action) === 2
        ))

        if (plusTwo.length > 0) {
            return plusTwo
        }
    }

    const maximum = Math.max(
        ...legalUses.map((action) => greedyUseScore(mode, eventId, traits, action)),
    )

    return legalUses.filter((action) => (
        greedyUseScore(mode, eventId, traits, action) === maximum
    ))
}

export function chooseGreedyAction(
    mode: GreedyMode,
    eventId: string,
    traits: TraitCollection,
    tieOrder: readonly TraitType[] = CATALOG_TIE_ORDER,
): BotRoundAction {
    const candidates = getGreedyCandidates(mode, eventId, traits)

    return candidates.reduce((best, candidate) => (
        tieOrder.indexOf(candidate.trait) < tieOrder.indexOf(best.trait)
            ? candidate
            : best
    ))
}

function resolveTransition(
    eventId: string,
    roundNumber: number,
    optimizerTraits: TraitCollection,
    greedyTraits: TraitCollection,
    optimizerAction: BotRoundAction,
    greedyAction: BotRoundAction,
) {
    if (!isLegalAction(optimizerTraits, optimizerAction)) {
        throw new Error(`Solver generated illegal optimizer action ${actionKey(optimizerAction)}.`)
    }

    if (!isLegalAction(greedyTraits, greedyAction)) {
        throw new Error(`Solver generated illegal GREEDY action ${actionKey(greedyAction)}.`)
    }

    return resolveRound({
        roundNumber,
        roundEvent: getRoundEventById(eventId),
        player1Id: 'optimizer',
        player2Id: 'greedy',
        player1Traits: optimizerTraits,
        player2Traits: greedyTraits,
        player1Action: toPlayerAction('optimizer', optimizerAction),
        player2Action: toPlayerAction('greedy', greedyAction),
    })
}

export function generateAllEventPermutations(): string[][] {
    const eventIds = ROUND_EVENT_DEFINITIONS.map((event) => event.id)
    const permutations: string[][] = []

    function visit(prefix: string[], remaining: string[]) {
        if (remaining.length === 0) {
            permutations.push(prefix)
            return
        }

        for (let index = 0; index < remaining.length; index += 1) {
            visit(
                [...prefix, remaining[index]],
                [...remaining.slice(0, index), ...remaining.slice(index + 1)],
            )
        }
    }

    visit([], eventIds)
    return permutations
}

export class ExactBestResponseSolver {
    private readonly memo = new Map<string, SearchNode>()
    private readonly relaxedMemo = new Map<string, number>()

    public readonly mode: GreedyMode
    public readonly tieOrder: readonly TraitType[]
    public exploredStates = 0
    public legalActionsConsidered = 0
    public dominatedActionsPruned = 0
    public relaxedStatesExplored = 0
    public relaxedActionsConsidered = 0
    public certifiedSequences = 0
    public fallbackSequences = 0
    public upperBoundPrunedActions = 0

    constructor(
        mode: GreedyMode = 'immediate-value',
        tieOrder: readonly TraitType[] = CATALOG_TIE_ORDER,
    ) {
        this.mode = mode
        this.tieOrder = tieOrder
    }

    public get memoizedStateCount(): number {
        return this.memo.size
    }

    private relaxedUpperBound(
        sequence: string[],
        legalWitness: SequenceSolution,
        roundIndex: number,
        optimizerTraits: TraitCollection,
    ): number {
        if (roundIndex >= sequence.length) {
            return 0
        }

        const relaxedTraits = cloneTraits(optimizerTraits)
        for (const trait of TRAITS) {
            relaxedTraits[trait].cooldown = 0
        }
        const witnessRound = legalWitness.trace[roundIndex]
        const key = [
            sequence.slice(roundIndex).join(','),
            TRAITS.map((trait) => relaxedTraits[trait].level).join(','),
            encodeTraits(witnessRound.greedyTraitsBefore),
            actionKey(witnessRound.greedyAction),
        ].join('#')
        const cached = this.relaxedMemo.get(key)

        if (cached !== undefined) {
            return cached
        }

        this.relaxedStatesExplored += 1
        let best = Number.NEGATIVE_INFINITY

        for (const optimizerAction of getLegalBotActions(relaxedTraits)) {
            this.relaxedActionsConsidered += 1
            const resolution = resolveTransition(
                sequence[roundIndex],
                roundIndex + 1,
                relaxedTraits,
                witnessRound.greedyTraitsBefore,
                optimizerAction,
                witnessRound.greedyAction,
            )
            const candidate =
                resolution.player1ScoreDelta
                - resolution.player2ScoreDelta
                + this.relaxedUpperBound(
                    sequence,
                    legalWitness,
                    roundIndex + 1,
                    resolution.player1.traits,
                )
            best = Math.max(best, candidate)
        }

        this.relaxedMemo.set(key, best)
        return best
    }

    private getRelaxedUpperBound(
        sequence: string[],
        legalWitness: SequenceSolution,
    ): number {
        return this.relaxedUpperBound(
            sequence,
            legalWitness,
            0,
            createInitialTraits(),
        )
    }

    private search(
        sequence: string[],
        legalWitness: SequenceSolution,
        state: SearchState,
    ): SearchNode {
        if (state.roundIndex >= sequence.length) {
            return {
                optimizerScore: 0,
                greedyScore: 0,
            }
        }

        const key = stateKey(sequence, state)
        const cached = this.memo.get(key)

        if (cached) {
            return cached
        }

        this.exploredStates += 1
        const eventId = sequence[state.roundIndex]
        const roundNumber = state.roundIndex + 1
        const greedyAction = chooseGreedyAction(
            this.mode,
            eventId,
            state.greedyTraits,
            this.tieOrder,
        )
        let best: SearchNode | null = null
        const legalActions = getLegalBotActions(state.optimizerTraits)
        const hasLegalEvolution = legalActions.some(
            (action) => action.actionType === 'EVOLVE',
        )
        const greedyValue = getTraitRoundValue(
            getRoundEventById(eventId),
            state.greedyTraits,
            greedyAction.trait,
        )
        const orderedActions = [...legalActions].sort((left, right) => {
            const value = (action: BotRoundAction) => (
                action.actionType === 'EVOLVE'
                    ? 0
                    : getTraitRoundValue(
                        getRoundEventById(eventId),
                        state.optimizerTraits,
                        action.trait,
                    )
            )
            const leftValue = value(left)
            const rightValue = value(right)

            return rightValue - leftValue
                || actionKey(left).localeCompare(actionKey(right))
        })

        for (const optimizerAction of orderedActions) {
            this.legalActionsConsidered += 1

            // A losing USE and any legal EVOLVE both lose exactly one point now.
            // EVOLVE ticks the same existing cooldowns, adds a level, and does
            // not set a new cooldown; its successor state therefore weakly
            // dominates the losing USE state for every possible suffix.
            if (
                optimizerAction.actionType === 'USE'
                && hasLegalEvolution
                && getTraitRoundValue(
                    getRoundEventById(eventId),
                    state.optimizerTraits,
                    optimizerAction.trait,
                ) < greedyValue
            ) {
                this.dominatedActionsPruned += 1
                continue
            }

            const resolution = resolveTransition(
                eventId,
                roundNumber,
                state.optimizerTraits,
                state.greedyTraits,
                optimizerAction,
                greedyAction,
            )
            const immediateDifferential =
                resolution.player1ScoreDelta - resolution.player2ScoreDelta
            const candidateUpperBound =
                immediateDifferential
                + this.relaxedUpperBound(
                    sequence,
                    legalWitness,
                    state.roundIndex + 1,
                    resolution.player1.traits,
                )
            const bestDifferential = best
                ? best.optimizerScore - best.greedyScore
                : Number.NEGATIVE_INFINITY

            if (best && candidateUpperBound <= bestDifferential) {
                this.upperBoundPrunedActions += 1
                continue
            }

            const child = this.search(sequence, legalWitness, {
                roundIndex: state.roundIndex + 1,
                optimizerTraits: resolution.player1.traits,
                greedyTraits: resolution.player2.traits,
            })
            const candidate: SearchNode = {
                optimizerScore:
                    resolution.player1ScoreDelta + child.optimizerScore,
                greedyScore:
                    resolution.player2ScoreDelta + child.greedyScore,
                action: optimizerAction,
                greedyAction,
            }

            if (!best || compareSearchNodes(candidate, best) > 0) {
                best = candidate
            }
        }

        if (!best) {
            throw new Error('Solver reached a state without legal optimizer actions.')
        }

        this.memo.set(key, best)
        return best
    }

    public solve(sequence: string[]): SequenceSolution {
        if (sequence.length !== TOTAL_ROUNDS) {
            throw new Error(`Expected ${TOTAL_ROUNDS} events, received ${sequence.length}.`)
        }

        const legalWitness = solveCurrentEventMirrorPolicy(
            sequence,
            this.mode,
            this.tieOrder,
        )
        const relaxedUpperBound = this.getRelaxedUpperBound(
            sequence,
            legalWitness,
        )

        if (relaxedUpperBound === legalWitness.differential) {
            this.certifiedSequences += 1
            return legalWitness
        }

        this.fallbackSequences += 1
        // A sequence-local memo avoids retaining mutually incompatible suffix
        // state spaces across all 720 permutations. This changes memory use only:
        // every legal action for the current sequence is still considered.
        this.memo.clear()
        let state: SearchState = {
            roundIndex: 0,
            optimizerTraits: createInitialTraits(),
            greedyTraits: createInitialTraits(),
        }
        const root = this.search(sequence, legalWitness, state)
        const trace: RoundTrace[] = []
        let optimizerScore = 0
        let greedyScore = 0

        while (state.roundIndex < sequence.length) {
            const key = stateKey(sequence, state)
            const node = this.memo.get(key)

            if (!node?.action || !node.greedyAction) {
                throw new Error(`Missing memoized choice at round ${state.roundIndex + 1}.`)
            }

            const eventId = sequence[state.roundIndex]
            const resolution = resolveTransition(
                eventId,
                state.roundIndex + 1,
                state.optimizerTraits,
                state.greedyTraits,
                node.action,
                node.greedyAction,
            )
            optimizerScore += resolution.player1ScoreDelta
            greedyScore += resolution.player2ScoreDelta

            trace.push({
                roundNumber: state.roundIndex + 1,
                eventId,
                optimizerAction: node.action,
                greedyAction: node.greedyAction,
                optimizerValue: resolution.player1.roundValue,
                greedyValue: resolution.player2.roundValue,
                optimizerScoreAfter: optimizerScore,
                greedyScoreAfter: greedyScore,
                optimizerTraitsBefore: cloneTraits(state.optimizerTraits),
                optimizerTraitsAfter: cloneTraits(resolution.player1.traits),
                greedyTraitsBefore: cloneTraits(state.greedyTraits),
                greedyTraitsAfter: cloneTraits(resolution.player2.traits),
            })

            state = {
                roundIndex: state.roundIndex + 1,
                optimizerTraits: resolution.player1.traits,
                greedyTraits: resolution.player2.traits,
            }
        }

        const differential = root.optimizerScore - root.greedyScore

        return {
            events: [...sequence],
            outcome: outcomeFromDifferential(differential),
            differential,
            optimizerScore: root.optimizerScore,
            greedyScore: root.greedyScore,
            trace,
        }
    }

    public findOptimalTraces(sequence: string[], limit = 3): SequenceSolution[] {
        this.memo.clear()
        const initialState: SearchState = {
            roundIndex: 0,
            optimizerTraits: createInitialTraits(),
            greedyTraits: createInitialTraits(),
        }
        const legalWitness = solveCurrentEventMirrorPolicy(
            sequence,
            this.mode,
            this.tieOrder,
        )
        const target = this.search(sequence, legalWitness, initialState)
        const targetDifferential = target.optimizerScore - target.greedyScore
        const solutions: SequenceSolution[] = []

        const visit = (
            state: SearchState,
            optimizerScore: number,
            greedyScore: number,
            trace: RoundTrace[],
        ) => {
            if (solutions.length >= limit) {
                return
            }

            if (state.roundIndex >= sequence.length) {
                const differential = optimizerScore - greedyScore

                if (differential === targetDifferential) {
                    solutions.push({
                        events: [...sequence],
                        outcome: outcomeFromDifferential(differential),
                        differential,
                        optimizerScore,
                        greedyScore,
                        trace,
                    })
                }

                return
            }

            const eventId = sequence[state.roundIndex]
            const stateTarget = this.search(sequence, legalWitness, state)
            const stateTargetDifferential =
                stateTarget.optimizerScore - stateTarget.greedyScore
            const greedyAction = chooseGreedyAction(
                this.mode,
                eventId,
                state.greedyTraits,
                this.tieOrder,
            )

            for (const optimizerAction of getLegalBotActions(state.optimizerTraits)) {
                const resolution = resolveTransition(
                    eventId,
                    state.roundIndex + 1,
                    state.optimizerTraits,
                    state.greedyTraits,
                    optimizerAction,
                    greedyAction,
                )
                const nextState: SearchState = {
                    roundIndex: state.roundIndex + 1,
                    optimizerTraits: resolution.player1.traits,
                    greedyTraits: resolution.player2.traits,
                }
                const child = this.search(sequence, legalWitness, nextState)
                const candidateDifferential =
                    resolution.player1ScoreDelta
                    - resolution.player2ScoreDelta
                    + child.optimizerScore
                    - child.greedyScore

                if (candidateDifferential !== stateTargetDifferential) {
                    continue
                }

                const nextOptimizerScore =
                    optimizerScore + resolution.player1ScoreDelta
                const nextGreedyScore =
                    greedyScore + resolution.player2ScoreDelta

                visit(
                    nextState,
                    nextOptimizerScore,
                    nextGreedyScore,
                    [
                        ...trace,
                        {
                            roundNumber: state.roundIndex + 1,
                            eventId,
                            optimizerAction,
                            greedyAction,
                            optimizerValue: resolution.player1.roundValue,
                            greedyValue: resolution.player2.roundValue,
                            optimizerScoreAfter: nextOptimizerScore,
                            greedyScoreAfter: nextGreedyScore,
                            optimizerTraitsBefore: cloneTraits(state.optimizerTraits),
                            optimizerTraitsAfter: cloneTraits(resolution.player1.traits),
                            greedyTraitsBefore: cloneTraits(state.greedyTraits),
                            greedyTraitsAfter: cloneTraits(resolution.player2.traits),
                        },
                    ],
                )

                if (solutions.length >= limit) {
                    break
                }
            }
        }

        visit(initialState, 0, 0, [])
        return solutions
    }
}

export function solveCurrentEventMirrorPolicy(
    sequence: string[],
    mode: GreedyMode = 'immediate-value',
    tieOrder: readonly TraitType[] = CATALOG_TIE_ORDER,
): SequenceSolution {
    let optimizerTraits = createInitialTraits()
    let greedyTraits = createInitialTraits()
    let optimizerScore = 0
    let greedyScore = 0
    const trace: RoundTrace[] = []

    for (let roundIndex = 0; roundIndex < sequence.length; roundIndex += 1) {
        const eventId = sequence[roundIndex]
        const optimizerAction = chooseGreedyAction(
            mode,
            eventId,
            optimizerTraits,
            tieOrder,
        )
        const greedyAction = chooseGreedyAction(
            mode,
            eventId,
            greedyTraits,
            tieOrder,
        )
        const resolution = resolveTransition(
            eventId,
            roundIndex + 1,
            optimizerTraits,
            greedyTraits,
            optimizerAction,
            greedyAction,
        )

        optimizerScore += resolution.player1ScoreDelta
        greedyScore += resolution.player2ScoreDelta
        trace.push({
            roundNumber: roundIndex + 1,
            eventId,
            optimizerAction,
            greedyAction,
            optimizerValue: resolution.player1.roundValue,
            greedyValue: resolution.player2.roundValue,
            optimizerScoreAfter: optimizerScore,
            greedyScoreAfter: greedyScore,
            optimizerTraitsBefore: cloneTraits(optimizerTraits),
            optimizerTraitsAfter: cloneTraits(resolution.player1.traits),
            greedyTraitsBefore: cloneTraits(greedyTraits),
            greedyTraitsAfter: cloneTraits(resolution.player2.traits),
        })
        optimizerTraits = resolution.player1.traits
        greedyTraits = resolution.player2.traits
    }

    const differential = optimizerScore - greedyScore

    return {
        events: [...sequence],
        outcome: outcomeFromDifferential(differential),
        differential,
        optimizerScore,
        greedyScore,
        trace,
    }
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
    let a = left < 0n ? -left : left
    let b = right < 0n ? -right : right

    while (b !== 0n) {
        const remainder = a % b
        a = b
        b = remainder
    }

    return a === 0n ? 1n : a
}

function fraction(numerator: bigint, denominator = 1n): Fraction {
    if (denominator === 0n) {
        throw new Error('Fraction denominator cannot be zero.')
    }

    const sign = denominator < 0n ? -1n : 1n
    const divisor = greatestCommonDivisor(numerator, denominator)

    return {
        numerator: numerator / divisor * sign,
        denominator: denominator / divisor * sign,
    }
}

function addFractions(left: Fraction, right: Fraction): Fraction {
    return fraction(
        left.numerator * right.denominator + right.numerator * left.denominator,
        left.denominator * right.denominator,
    )
}

function divideFraction(value: Fraction, divisor: number): Fraction {
    return fraction(value.numerator, value.denominator * BigInt(divisor))
}

function compareFractions(left: Fraction, right: Fraction): number {
    const difference = left.numerator * right.denominator - right.numerator * left.denominator
    return difference > 0n ? 1 : difference < 0n ? -1 : 0
}

function fractionToNumber(value: Fraction): number {
    return Number(value.numerator) / Number(value.denominator)
}

function limitedStateKey(input: {
    roundIndex: number
    currentEventId: string
    nextEventId: string | null
    remainingEventIds: string[]
    optimizerTraits: TraitCollection
    greedyTraits: TraitCollection
}): string {
    return [
        input.roundIndex,
        input.currentEventId,
        input.nextEventId ?? '-',
        [...input.remainingEventIds].sort().join(','),
        encodeTraits(input.optimizerTraits),
        encodeTraits(input.greedyTraits),
    ].join('#')
}

export class CurrentAndNextBestResponseSolver {
    private readonly memo = new Map<string, LimitedNode>()

    public exploredInformationStates = 0
    public legalActionsConsidered = 0
    public dominatedActionsPruned = 0

    public get memoizedStateCount(): number {
        return this.memo.size
    }

    private search(input: {
        roundIndex: number
        currentEventId: string
        nextEventId: string | null
        remainingEventIds: string[]
        optimizerTraits: TraitCollection
        greedyTraits: TraitCollection
    }): LimitedNode {
        const key = limitedStateKey(input)
        const cached = this.memo.get(key)

        if (cached) {
            return cached
        }

        this.exploredInformationStates += 1
        const greedyAction = chooseGreedyAction(
            'immediate-value',
            input.currentEventId,
            input.greedyTraits,
            CATALOG_TIE_ORDER,
        )
        let best: LimitedNode | null = null
        const legalActions = getLegalBotActions(input.optimizerTraits)
        const hasLegalEvolution = legalActions.some(
            (action) => action.actionType === 'EVOLVE',
        )
        const currentEvent = getRoundEventById(input.currentEventId)
        const greedyValue = getTraitRoundValue(
            currentEvent,
            input.greedyTraits,
            greedyAction.trait,
        )
        const orderedActions = [...legalActions].sort((left, right) => {
            const value = (action: BotRoundAction) => (
                action.actionType === 'EVOLVE'
                    ? 0
                    : getTraitRoundValue(
                        currentEvent,
                        input.optimizerTraits,
                        action.trait,
                    )
            )

            return value(right) - value(left)
                || actionKey(left).localeCompare(actionKey(right))
        })

        for (const optimizerAction of orderedActions) {
            this.legalActionsConsidered += 1

            if (
                optimizerAction.actionType === 'USE'
                && hasLegalEvolution
                && getTraitRoundValue(
                    currentEvent,
                    input.optimizerTraits,
                    optimizerAction.trait,
                ) < greedyValue
            ) {
                this.dominatedActionsPruned += 1
                continue
            }

            const resolution = resolveTransition(
                input.currentEventId,
                input.roundIndex + 1,
                input.optimizerTraits,
                input.greedyTraits,
                optimizerAction,
                greedyAction,
            )
            const roundDifferential =
                resolution.player1ScoreDelta - resolution.player2ScoreDelta
            const roundOptimizerScore = resolution.player1ScoreDelta
            let candidate: LimitedNode

            if (input.roundIndex + 1 >= TOTAL_ROUNDS) {
                candidate = {
                    expectedDifferential: fraction(BigInt(roundDifferential)),
                    expectedOptimizerScore: fraction(BigInt(roundOptimizerScore)),
                    action: optimizerAction,
                }
            } else if (input.nextEventId === null) {
                throw new Error('Missing next event before the final round.')
            } else {
                const possibleReveals = input.remainingEventIds.length > 0
                    ? input.remainingEventIds
                    : [null]
                let expectedDifferential = fraction(0n)
                let expectedOptimizerScore = fraction(0n)

                for (const revealedEventId of possibleReveals) {
                    const child = this.search({
                        roundIndex: input.roundIndex + 1,
                        currentEventId: input.nextEventId,
                        nextEventId: revealedEventId,
                        remainingEventIds: revealedEventId === null
                            ? []
                            : input.remainingEventIds.filter((eventId) => eventId !== revealedEventId),
                        optimizerTraits: resolution.player1.traits,
                        greedyTraits: resolution.player2.traits,
                    })
                    expectedDifferential = addFractions(
                        expectedDifferential,
                        child.expectedDifferential,
                    )
                    expectedOptimizerScore = addFractions(
                        expectedOptimizerScore,
                        child.expectedOptimizerScore,
                    )
                }

                candidate = {
                    expectedDifferential: addFractions(
                        fraction(BigInt(roundDifferential)),
                        divideFraction(
                            expectedDifferential,
                            possibleReveals.length,
                        ),
                    ),
                    expectedOptimizerScore: addFractions(
                        fraction(BigInt(roundOptimizerScore)),
                        divideFraction(
                            expectedOptimizerScore,
                            possibleReveals.length,
                        ),
                    ),
                    action: optimizerAction,
                }
            }

            const differentialComparison = best
                ? compareFractions(candidate.expectedDifferential, best.expectedDifferential)
                : 1
            const scoreComparison = best && differentialComparison === 0
                ? compareFractions(candidate.expectedOptimizerScore, best.expectedOptimizerScore)
                : differentialComparison

            if (
                !best
                || differentialComparison > 0
                || (
                    differentialComparison === 0
                    && (
                        scoreComparison > 0
                        || (
                            scoreComparison === 0
                            && candidate.action
                            && best.action
                            && actionKey(candidate.action).localeCompare(actionKey(best.action)) < 0
                        )
                    )
                )
            ) {
                best = candidate
            }
        }

        if (!best) {
            throw new Error('Limited-information solver found no legal action.')
        }

        this.memo.set(key, best)
        return best
    }

    public solve(sequence: string[]): SequenceSolution & {
        initialExpectedDifferential: number
        initialExpectedDifferentialFraction: string
    } {
        let optimizerTraits = createInitialTraits()
        let greedyTraits = createInitialTraits()
        let optimizerScore = 0
        let greedyScore = 0
        const trace: RoundTrace[] = []
        let initialNode: LimitedNode | null = null

        for (let roundIndex = 0; roundIndex < sequence.length; roundIndex += 1) {
            const node = this.search({
                roundIndex,
                currentEventId: sequence[roundIndex],
                nextEventId: sequence[roundIndex + 1] ?? null,
                remainingEventIds: sequence.slice(roundIndex + 2).sort(),
                optimizerTraits,
                greedyTraits,
            })

            if (!initialNode) {
                initialNode = node
            }

            if (!node.action) {
                throw new Error(`Limited-information policy has no action at round ${roundIndex + 1}.`)
            }

            const greedyAction = chooseGreedyAction(
                'immediate-value',
                sequence[roundIndex],
                greedyTraits,
                CATALOG_TIE_ORDER,
            )
            const resolution = resolveTransition(
                sequence[roundIndex],
                roundIndex + 1,
                optimizerTraits,
                greedyTraits,
                node.action,
                greedyAction,
            )
            const nextOptimizerScore = optimizerScore + resolution.player1ScoreDelta
            const nextGreedyScore = greedyScore + resolution.player2ScoreDelta

            trace.push({
                roundNumber: roundIndex + 1,
                eventId: sequence[roundIndex],
                optimizerAction: node.action,
                greedyAction,
                optimizerValue: resolution.player1.roundValue,
                greedyValue: resolution.player2.roundValue,
                optimizerScoreAfter: nextOptimizerScore,
                greedyScoreAfter: nextGreedyScore,
                optimizerTraitsBefore: cloneTraits(optimizerTraits),
                optimizerTraitsAfter: cloneTraits(resolution.player1.traits),
                greedyTraitsBefore: cloneTraits(greedyTraits),
                greedyTraitsAfter: cloneTraits(resolution.player2.traits),
            })

            optimizerScore = nextOptimizerScore
            greedyScore = nextGreedyScore
            optimizerTraits = resolution.player1.traits
            greedyTraits = resolution.player2.traits
        }

        if (!initialNode) {
            throw new Error('Cannot solve an empty event sequence.')
        }

        const differential = optimizerScore - greedyScore

        return {
            events: [...sequence],
            outcome: outcomeFromDifferential(differential),
            differential,
            optimizerScore,
            greedyScore,
            trace,
            initialExpectedDifferential: fractionToNumber(initialNode.expectedDifferential),
            initialExpectedDifferentialFraction:
                `${initialNode.expectedDifferential.numerator}/${initialNode.expectedDifferential.denominator}`,
        }
    }
}

export function summarizeSolutions(solutions: SequenceSolution[]): AggregateSummary {
    const differentials = solutions.map((solution) => solution.differential)

    return {
        totalSequences: solutions.length,
        wins: solutions.filter((solution) => solution.outcome === 'WIN').length,
        draws: solutions.filter((solution) => solution.outcome === 'DRAW').length,
        losses: solutions.filter((solution) => solution.outcome === 'LOSS').length,
        maximumDifferential: Math.max(...differentials),
        minimumDifferential: Math.min(...differentials),
    }
}

export function auditGreedyTieBreaks(
    permutations: string[][],
    mode: GreedyMode,
): TieBreakAudit {
    let decisions = 0
    let tiedDecisions = 0
    let maximumTieWidth = 0
    let catalogAndReverseChooseSameAction = true

    for (const sequence of permutations) {
        let greedyTraits = createInitialTraits()

        for (let roundIndex = 0; roundIndex < sequence.length; roundIndex += 1) {
            const eventId = sequence[roundIndex]
            const candidates = getGreedyCandidates(mode, eventId, greedyTraits)
            const catalogAction = chooseGreedyAction(
                mode,
                eventId,
                greedyTraits,
                CATALOG_TIE_ORDER,
            )
            const reverseAction = chooseGreedyAction(
                mode,
                eventId,
                greedyTraits,
                REVERSE_TIE_ORDER,
            )

            decisions += 1
            maximumTieWidth = Math.max(maximumTieWidth, candidates.length)
            tiedDecisions += candidates.length > 1 ? 1 : 0
            catalogAndReverseChooseSameAction = catalogAndReverseChooseSameAction
                && isSameAction(catalogAction, reverseAction)

            const resolution = resolveTransition(
                eventId,
                roundIndex + 1,
                createInitialTraits(),
                greedyTraits,
                { trait: TRAITS[roundIndex % TRAITS.length], actionType: 'EVOLVE' },
                catalogAction,
            )
            greedyTraits = resolution.player2.traits
        }
    }

    return {
        decisions,
        tiedDecisions,
        maximumTieWidth,
        catalogAndReverseChooseSameAction,
    }
}

export const solverRulesMetadata = {
    totalRounds: TOTAL_ROUNDS,
    baseUseValue: BASE_USE_VALUE,
    eventWeight: EVENT_WEIGHT,
    maximumEffectiveTraitLevel: MAX_EFFECTIVE_TRAIT_LEVEL,
    eventIds: ROUND_EVENT_DEFINITIONS.map((event) => event.id),
    traitIds: [...TRAITS],
}

export function getSolverRulesMetadata() {
    return {
        ...solverRulesMetadata,
        eventIds: [...solverRulesMetadata.eventIds],
        traitIds: [...solverRulesMetadata.traitIds],
    }
}
