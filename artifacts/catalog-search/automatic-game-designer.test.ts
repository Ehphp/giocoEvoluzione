import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { ROUND_EVENT_DEFINITIONS } from '../../src/game/round-events'
import { BASE_USE_VALUE, EVENT_WEIGHT } from '../../src/game/config'
import { TRAITS, type TraitType } from '../../src/game/types'

type Matrix = number[][]
type Action = number
type Rng = () => number

type ExactSequenceResult = {
  differential: number
  optimizerScore: number
  greedyScore: number
  optimizerActions: Action[]
  greedyActions: Action[]
}

type ExactSummary = {
  wins: number
  draws: number
  losses: number
  maximumDifferential: number
  minimumDifferential: number
  evolveRate: number
  winningWithEvolveRate: number
  evolveRequiredWinRate: number
  cooldownBlockedRate: number
  cooldownExploitedRate: number
  lookaheadChangeRate: number
  optimizerPickRate: number[]
}

type PolicySummary = {
  wins: number
  draws: number
  losses: number
  averageScore: number
  averageUse: number
  averageEvolve: number
  tieRate: number
  cooldownBlockedRate: number
  pickRate: number[]
}

type AuditSummary = {
  benchmark: Record<string, PolicySummary>
  matchups: Record<string, Record<string, {
    winRate: number
    drawRate: number
    lossRate: number
  }>>
  maximumUniversalWinFloor: number
  strategyVariety: number
}

type FitnessBreakdown = {
  total: number
  strategicDepth: number
  cooldown: number
  evolve: number
  lookahead: number
  pickBalance: number
  drawControl: number
  variety: number
  dominancePenalty: number
  concentrationPenalty: number
  mandatoryEvolvePenalty: number
}

type Evaluation = {
  id: string
  generation: number
  matrix: Matrix
  effects: ReturnType<typeof serializeEffects>
  fitness: FitnessBreakdown
  solver: ExactSummary
  audit: AuditSummary
  rationale: string[]
}

type PolicyContext = {
  matrix: Matrix
  sequence: number[]
  round: number
  levels: number[]
  cooldown: number
  opponentLevels: number[]
  opponentCooldown: number
  exactActions?: Action[]
  random: Rng
}

type Policy = {
  id: string
  choose: (context: PolicyContext) => Action
}

const enabledDescribe =
  process.env.RUN_CATALOG_SEARCH === '1' ? describe : describe.skip
const OUTPUT_DIRECTORY = fileURLToPath(new URL('./', import.meta.url))
const EVENT_IDS = ROUND_EVENT_DEFINITIONS.map((event) => event.id)
const EVENT_INDEX = Object.fromEntries(
  EVENT_IDS.map((eventId, index) => [eventId, index]),
) as Record<string, number>
const TRAIT_INDEX = Object.fromEntries(
  TRAITS.map((trait, index) => [trait, index]),
) as Record<TraitType, number>
const TRAIT_COUNT = TRAITS.length
const EVENT_COUNT = EVENT_IDS.length
const USE = 0
const EVOLVE = TRAIT_COUNT
const POW4 = Array.from({ length: TRAIT_COUNT }, (_, index) => 4 ** index)
const SEARCH_SEED = 0x51a7c0de
const EVALUATION_VERSION = 1
const SMOKE_MODE = process.env.CATALOG_SEARCH_SMOKE === '1'
const POPULATION_SIZE = SMOKE_MODE ? 1 : 12
const GENERATIONS = SMOKE_MODE ? 0 : 9
const ELITE_COUNT = 4
const TOP_COUNT = 10
const TARGET_EVALUATIONS = SMOKE_MODE
  ? 1
  : POPULATION_SIZE * (GENERATIONS + 1) * 2
const RESUME_SEARCH = process.env.CATALOG_SEARCH_RESUME === '1'

const BIOLOGY: Record<string, {
  primary: TraitType[]
  positive: TraitType[]
  negative: TraitType[]
}> = {
  VOLCANIC_ASH_WAVE: {
    primary: ['RESISTANCE', 'FAT_RESERVES'],
    positive: ['RESISTANCE', 'FAT_RESERVES', 'METABOLISM', 'GRIP_CLAWS'],
    negative: ['PERCEPTION', 'WEBBED_LIMBS', 'AGILITY'],
  },
  PROLONGED_ECLIPSE: {
    primary: ['PERCEPTION', 'CAMOUFLAGE', 'ADAPTATION'],
    positive: ['PERCEPTION', 'CAMOUFLAGE', 'ADAPTATION', 'GRIP_CLAWS'],
    negative: ['METABOLISM', 'WEBBED_LIMBS', 'RESISTANCE'],
  },
  PREDATOR_PACK_MIGRATION: {
    primary: ['AGILITY', 'CAMOUFLAGE', 'STRENGTH'],
    positive: ['AGILITY', 'CAMOUFLAGE', 'STRENGTH', 'PERCEPTION'],
    negative: ['FAT_RESERVES', 'WEBBED_LIMBS', 'METABOLISM'],
  },
  HEAT_SPIKE: {
    primary: ['METABOLISM', 'WEBBED_LIMBS', 'ADAPTATION'],
    positive: ['METABOLISM', 'WEBBED_LIMBS', 'ADAPTATION', 'RESISTANCE'],
    negative: ['FAT_RESERVES', 'STRENGTH', 'CAMOUFLAGE'],
  },
  NUTRIENT_COLLAPSE: {
    primary: ['METABOLISM', 'FAT_RESERVES', 'ADAPTATION'],
    positive: ['METABOLISM', 'FAT_RESERVES', 'ADAPTATION', 'PERCEPTION'],
    negative: ['STRENGTH', 'AGILITY', 'WEBBED_LIMBS'],
  },
  FLASH_FLOOD: {
    primary: ['WEBBED_LIMBS', 'GRIP_CLAWS', 'STRENGTH'],
    positive: ['WEBBED_LIMBS', 'GRIP_CLAWS', 'STRENGTH', 'RESISTANCE'],
    negative: ['AGILITY', 'FAT_RESERVES', 'CAMOUFLAGE'],
  },
}

const NARRATIVE_CONTEXT: Record<string, string> = {
  VOLCANIC_ASH_WAVE: 'alle ceneri abrasive e alla visibilità ridotta',
  PROLONGED_ECLIPSE: 'all’oscurità prolungata e all’orientamento instabile',
  PREDATOR_PACK_MIGRATION: 'alla pressione dei predatori e agli inseguimenti',
  HEAT_SPIKE: 'allo stress termico e al consumo energetico',
  NUTRIENT_COLLAPSE: 'alla scarsità nutritiva e al cambio di dieta',
  FLASH_FLOOD: 'alla corrente rapida e al terreno allagato',
}

const TRAIT_NARRATIVE: Record<TraitType, string> = {
  STRENGTH: 'la forza muscolare',
  RESISTANCE: 'la tolleranza fisiologica',
  AGILITY: 'la rapidità di manovra',
  PERCEPTION: 'i sensi amplificati',
  METABOLISM: 'la regolazione metabolica',
  ADAPTATION: 'la plasticità fenotipica',
  GRIP_CLAWS: 'la presa su superfici instabili',
  CAMOUFLAGE: 'il mimetismo',
  WEBBED_LIMBS: 'la propulsione e la termoregolazione degli arti palmati',
  FAT_RESERVES: 'le riserve energetiche durante periodi senza alimentazione',
}

function makeRng(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function cloneMatrix(matrix: Matrix): Matrix {
  return matrix.map((row) => [...row])
}

function matrixKey(matrix: Matrix): string {
  return matrix.map((row) => row.join(',')).join('|')
}

function roundNumber(value: number, digits = 4): number {
  return Number(value.toFixed(digits))
}

function currentMatrix(): Matrix {
  return ROUND_EVENT_DEFINITIONS.map((event) =>
    TRAITS.map((trait) =>
      event.effects
        .filter((effect) => effect.trait === trait)
        .reduce((sum, effect) => sum + effect.modifier, 0),
    ),
  )
}

function permutations(values: number[]): number[][] {
  const result: number[][] = []
  const visit = (prefix: number[], remaining: number[]) => {
    if (remaining.length === 0) {
      result.push(prefix)
      return
    }
    remaining.forEach((value, index) => {
      visit(
        [...prefix, value],
        [...remaining.slice(0, index), ...remaining.slice(index + 1)],
      )
    })
  }
  visit([], values)
  return result
}

const ALL_SEQUENCES = permutations(
  Array.from({ length: EVENT_COUNT }, (_, index) => index),
)

function traitLevel(levelCode: number, trait: number): number {
  return Math.floor(levelCode / POW4[trait]) % 4
}

function decodeLevels(levelCode: number): number[] {
  return POW4.map((_, trait) => traitLevel(levelCode, trait))
}

function actionType(action: Action): number {
  return action >= EVOLVE ? EVOLVE : USE
}

function actionTrait(action: Action): number {
  return action % TRAIT_COUNT
}

function actionKey(action: Action): string {
  return `${actionType(action) === USE ? 'USE' : 'EVOLVE'}:${TRAITS[actionTrait(action)]}`
}

function legalActions(levelCode: number, cooldown: number): Action[] {
  const actions: Action[] = []
  for (let trait = 0; trait < TRAIT_COUNT; trait += 1) {
    if (trait !== cooldown) actions.push(trait)
    if (traitLevel(levelCode, trait) < 3) actions.push(EVOLVE + trait)
  }
  return actions
}

function transition(
  levelCode: number,
  action: Action,
): { levelCode: number; cooldown: number } {
  const trait = actionTrait(action)
  if (actionType(action) === EVOLVE) {
    return {
      levelCode: levelCode + POW4[trait],
      cooldown: -1,
    }
  }
  return { levelCode, cooldown: trait }
}

function actionValue(
  matrix: Matrix,
  event: number,
  levelCode: number,
  action: Action,
): number {
  return actionType(action) === EVOLVE
    ? 0
    : BASE_USE_VALUE +
        traitLevel(levelCode, actionTrait(action)) +
        matrix[event][actionTrait(action)] * EVENT_WEIGHT
}

function roundDifferential(leftValue: number, rightValue: number): number {
  return leftValue === rightValue ? 0 : leftValue > rightValue ? 1 : -1
}

function bestUse(
  matrix: Matrix,
  event: number,
  levelCode: number,
  cooldown: number,
  excluded: number[] = [],
): Action {
  const candidates = Array.from(
    { length: TRAIT_COUNT },
    (_, trait) => trait,
  ).filter((trait) => trait !== cooldown && !excluded.includes(trait))
  const usable = candidates.length > 0
    ? candidates
    : Array.from({ length: TRAIT_COUNT }, (_, trait) => trait).filter(
        (trait) => trait !== cooldown,
      )
  return usable.reduce((best, candidate) => {
    const value = actionValue(matrix, event, levelCode, candidate)
    const bestValue = actionValue(matrix, event, levelCode, best)
    return value > bestValue ? candidate : best
  })
}

function greedyActions(matrix: Matrix, sequence: number[]): Action[] {
  let cooldown = -1
  return sequence.map((event) => {
    const action = bestUse(matrix, event, 0, cooldown)
    cooldown = action
    return action
  })
}

function solveSequenceExact(
  matrix: Matrix,
  sequence: number[],
  relaxedMemo: Map<string, number>,
): ExactSequenceResult {
  const greedy = greedyActions(matrix, sequence)
  const memo = new Map<number, { differential: number; action: Action }>()

  const relaxedUpper = (round: number, levelCode: number): number => {
    if (round >= EVENT_COUNT) return 0
    const suffix = sequence.slice(round).join('')
    const key = `${suffix}|${levelCode}|${greedy[round]}`
    const cached = relaxedMemo.get(key)
    if (cached !== undefined) return cached

    const event = sequence[round]
    const greedyValue = actionValue(matrix, event, 0, greedy[round])
    const actions = Array.from(
      { length: TRAIT_COUNT },
      (_, trait) => trait,
    )
    for (let trait = 0; trait < TRAIT_COUNT; trait += 1) {
      if (traitLevel(levelCode, trait) < 3) actions.push(EVOLVE + trait)
    }
    let best = Number.NEGATIVE_INFINITY
    for (const action of actions) {
      const nextLevelCode =
        actionType(action) === EVOLVE
          ? levelCode + POW4[actionTrait(action)]
          : levelCode
      const candidate =
        roundDifferential(
          actionValue(matrix, event, levelCode, action),
          greedyValue,
        ) +
        relaxedUpper(round + 1, nextLevelCode)
      if (candidate > best) best = candidate
    }
    relaxedMemo.set(key, best)
    return best
  }

  const search = (
    round: number,
    levelCode: number,
    cooldown: number,
  ): number => {
    if (round >= EVENT_COUNT) return 0
    const key =
      round +
      EVENT_COUNT *
        (cooldown + 1 + (TRAIT_COUNT + 1) * levelCode)
    const cached = memo.get(key)
    if (cached) return cached.differential

    const event = sequence[round]
    const greedyValue = actionValue(matrix, event, 0, greedy[round])
    const actions = legalActions(levelCode, cooldown)
    const hasEvolution = actions.some((action) => actionType(action) === EVOLVE)
    let bestDifferential = Number.NEGATIVE_INFINITY
    let bestAction = actions[0]

    const ordered = [...actions].sort((left, right) => {
      const delta =
        actionValue(matrix, event, levelCode, right) -
        actionValue(matrix, event, levelCode, left)
      return delta || actionKey(left).localeCompare(actionKey(right))
    })

    for (const action of ordered) {
      const value = actionValue(matrix, event, levelCode, action)
      if (
        actionType(action) === USE &&
        hasEvolution &&
        value < greedyValue &&
        traitLevel(levelCode, actionTrait(action)) < 3
      ) {
        continue
      }
      const next = transition(levelCode, action)
      const immediate = roundDifferential(value, greedyValue)
      const candidateUpper =
        immediate + relaxedUpper(round + 1, next.levelCode)
      if (
        bestDifferential !== Number.NEGATIVE_INFINITY &&
        candidateUpper <= bestDifferential
      ) {
        continue
      }
      const differential =
        immediate + search(round + 1, next.levelCode, next.cooldown)
      if (differential > bestDifferential) {
        bestDifferential = differential
        bestAction = action
      }
    }

    memo.set(key, { differential: bestDifferential, action: bestAction })
    return bestDifferential
  }

  const rootUpper = relaxedUpper(0, 0)
  if (rootUpper === 0) {
    return {
      differential: 0,
      optimizerScore: 0,
      greedyScore: 0,
      optimizerActions: [...greedy],
      greedyActions: greedy,
    }
  }

  const differential = search(0, 0, -1)
  const optimizerActions: Action[] = []
  let levelCode = 0
  let cooldown = -1
  let optimizerScore = 0
  let greedyScore = 0

  for (let round = 0; round < EVENT_COUNT; round += 1) {
    const key =
      round +
      EVENT_COUNT *
        (cooldown + 1 + (TRAIT_COUNT + 1) * levelCode)
    const action = memo.get(key)?.action
    if (action === undefined) {
      throw new Error('Missing exact action during reconstruction.')
    }
    optimizerActions.push(action)
    const optimizerValue = actionValue(
      matrix,
      sequence[round],
      levelCode,
      action,
    )
    const greedyValue = actionValue(
      matrix,
      sequence[round],
      0,
      greedy[round],
    )
    if (optimizerValue > greedyValue) optimizerScore += 1
    if (optimizerValue < greedyValue) greedyScore += 1
    const next = transition(levelCode, action)
    levelCode = next.levelCode
    cooldown = next.cooldown
  }

  return {
    differential,
    optimizerScore,
    greedyScore,
    optimizerActions,
    greedyActions: greedy,
  }
}

function bestUseOnlyDifferential(
  matrix: Matrix,
  sequence: number[],
  greedy: Action[],
): number {
  const memo = new Map<number, number>()
  const search = (round: number, cooldown: number): number => {
    if (round >= EVENT_COUNT) return 0
    const key = round + EVENT_COUNT * (cooldown + 1)
    const cached = memo.get(key)
    if (cached !== undefined) return cached
    const event = sequence[round]
    const greedyValue = actionValue(matrix, event, 0, greedy[round])
    let best = Number.NEGATIVE_INFINITY
    for (let trait = 0; trait < TRAIT_COUNT; trait += 1) {
      if (trait === cooldown) continue
      best = Math.max(
        best,
        roundDifferential(
          actionValue(matrix, event, 0, trait),
          greedyValue,
        ) + search(round + 1, trait),
      )
    }
    memo.set(key, best)
    return best
  }
  return search(0, -1)
}

function cooldownBlocksBest(
  matrix: Matrix,
  event: number,
  levelCode: number,
  cooldown: number,
): boolean {
  if (cooldown < 0) return false
  const unrestricted = Math.max(
    ...Array.from({ length: TRAIT_COUNT }, (_, trait) =>
      actionValue(matrix, event, levelCode, trait),
    ),
  )
  const legal = actionValue(
    matrix,
    event,
    levelCode,
    bestUse(matrix, event, levelCode, cooldown),
  )
  return legal < unrestricted
}

function immediatePolicy(context: PolicyContext): Action {
  return bestUse(
    context.matrix,
    context.sequence[context.round],
    encodeLevels(context.levels),
    context.cooldown,
  )
}

function principalPolicy(context: PolicyContext): Action {
  const event = context.sequence[context.round]
  const principal = context.matrix[event].findIndex(
    (modifier, trait) => modifier === 2 && trait !== context.cooldown,
  )
  return principal >= 0 ? principal : immediatePolicy(context)
}

function lookaheadPolicy(context: PolicyContext): Action {
  const levelCode = encodeLevels(context.levels)
  const event = context.sequence[context.round]
  const nextEvent = context.sequence[context.round + 1]
  return legalActions(levelCode, context.cooldown).reduce((best, action) => {
    const score = (candidate: Action) => {
      const next = transition(levelCode, candidate)
      const nextValue = nextEvent === undefined
        ? 0
        : actionValue(
            context.matrix,
            nextEvent,
            next.levelCode,
            bestUse(
              context.matrix,
              nextEvent,
              next.levelCode,
              next.cooldown,
            ),
          )
      return actionValue(context.matrix, event, levelCode, candidate) + nextValue
    }
    const candidateScore = score(action)
    const bestScore = score(best)
    return candidateScore > bestScore
      ? action
      : candidateScore < bestScore
        ? best
        : actionKey(action).localeCompare(actionKey(best)) < 0
          ? action
          : best
  })
}

function conservePolicy(context: PolicyContext): Action {
  const event = context.sequence[context.round]
  const next = context.sequence[context.round + 1]
  const heat = EVENT_INDEX.HEAT_SPIKE
  const nutrient = EVENT_INDEX.NUTRIENT_COLLAPSE
  const metabolism = TRAIT_INDEX.METABOLISM
  const pair =
    (event === heat && next === nutrient) ||
    (event === nutrient && next === heat)
  return bestUse(
    context.matrix,
    event,
    encodeLevels(context.levels),
    context.cooldown,
    pair ? [metabolism] : [],
  )
}

function alternativePolicy(context: PolicyContext): Action {
  const nutrientRound = context.sequence.indexOf(
    EVENT_INDEX.NUTRIENT_COLLAPSE,
  )
  const fat = TRAIT_INDEX.FAT_RESERVES
  const adaptation = TRAIT_INDEX.ADAPTATION
  if (
    context.round < nutrientRound &&
    nutrientRound - context.round <= 2 &&
    context.levels[fat] === 0 &&
    context.levels[adaptation] === 0
  ) {
    return EVOLVE + fat
  }
  return immediatePolicy(context)
}

function encodeLevels(levels: number[]): number {
  return levels.reduce(
    (code, level, trait) => code + level * POW4[trait],
    0,
  )
}

function finalEvolvePolicy(count: number): Policy {
  return {
    id: `E${count}`,
    choose(context) {
      const finalEvent = context.sequence[EVENT_COUNT - 1]
      const target = context.matrix[finalEvent].indexOf(2)
      if (context.round < count && context.levels[target] < 3) {
        return EVOLVE + target
      }
      return immediatePolicy(context)
    },
  }
}

const POLICIES: Policy[] = [
  {
    id: 'random',
    choose(context) {
      const actions = legalActions(
        encodeLevels(context.levels),
        context.cooldown,
      )
      return actions[Math.floor(context.random() * actions.length)]
    },
  },
  { id: 'immediate', choose: immediatePolicy },
  { id: 'principal', choose: principalPolicy },
  { id: 'lookahead1', choose: lookaheadPolicy },
  { id: 'conserve_metabolism', choose: conservePolicy },
  { id: 'evolve_alternative', choose: alternativePolicy },
  finalEvolvePolicy(1),
  finalEvolvePolicy(2),
  finalEvolvePolicy(3),
  { id: 'response_aware', choose: immediatePolicy },
  {
    id: 'exact_best_response',
    choose(context) {
      const action = context.exactActions?.[context.round]
      if (action === undefined) throw new Error('Missing exact policy action.')
      return action
    },
  },
]

function simulateGame(
  matrix: Matrix,
  sequence: number[],
  leftPolicy: Policy,
  rightPolicy: Policy,
  seed: number,
  exactActions?: Action[],
): {
  leftScore: number
  rightScore: number
  leftActions: Action[]
  rightActions: Action[]
  ties: number
  leftCooldownBlocks: number
} {
  const randomLeft = makeRng(seed ^ 0x13579bdf)
  const randomRight = makeRng(seed ^ 0x2468ace0)
  let leftLevels = Array(TRAIT_COUNT).fill(0)
  let rightLevels = Array(TRAIT_COUNT).fill(0)
  let leftCooldown = -1
  let rightCooldown = -1
  let leftScore = 0
  let rightScore = 0
  let ties = 0
  let leftCooldownBlocks = 0
  const leftActions: Action[] = []
  const rightActions: Action[] = []

  for (let round = 0; round < EVENT_COUNT; round += 1) {
    const event = sequence[round]
    const leftCode = encodeLevels(leftLevels)
    const rightCode = encodeLevels(rightLevels)
    if (cooldownBlocksBest(matrix, event, leftCode, leftCooldown)) {
      leftCooldownBlocks += 1
    }
    const leftAction = leftPolicy.choose({
      matrix,
      sequence,
      round,
      levels: leftLevels,
      cooldown: leftCooldown,
      opponentLevels: rightLevels,
      opponentCooldown: rightCooldown,
      exactActions,
      random: randomLeft,
    })
    const rightAction = rightPolicy.choose({
      matrix,
      sequence,
      round,
      levels: rightLevels,
      cooldown: rightCooldown,
      opponentLevels: leftLevels,
      opponentCooldown: leftCooldown,
      exactActions,
      random: randomRight,
    })
    if (!legalActions(leftCode, leftCooldown).includes(leftAction)) {
      throw new Error(
        `Illegal ${leftPolicy.id} action ${actionKey(leftAction)} in round ${round}.`,
      )
    }
    if (!legalActions(rightCode, rightCooldown).includes(rightAction)) {
      throw new Error(
        `Illegal ${rightPolicy.id} action ${actionKey(rightAction)} in round ${round}.`,
      )
    }
    const leftValue = actionValue(matrix, event, leftCode, leftAction)
    const rightValue = actionValue(matrix, event, rightCode, rightAction)
    if (leftValue > rightValue) leftScore += 1
    else if (leftValue < rightValue) rightScore += 1
    else ties += 1
    leftActions.push(leftAction)
    rightActions.push(rightAction)
    const nextLeft = transition(leftCode, leftAction)
    const nextRight = transition(rightCode, rightAction)
    leftLevels = decodeLevels(nextLeft.levelCode)
    rightLevels = decodeLevels(nextRight.levelCode)
    leftCooldown = nextLeft.cooldown
    rightCooldown = nextRight.cooldown
  }

  return {
    leftScore,
    rightScore,
    leftActions,
    rightActions,
    ties,
    leftCooldownBlocks,
  }
}

function emptyPolicyAccumulator() {
  return {
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    score: 0,
    uses: 0,
    evolves: 0,
    ties: 0,
    cooldownBlocks: 0,
    picks: Array(TRAIT_COUNT).fill(0),
  }
}

function summarizeAccumulator(accumulator: ReturnType<typeof emptyPolicyAccumulator>): PolicySummary {
  const actions = accumulator.games * EVENT_COUNT
  return {
    wins: roundNumber(accumulator.wins / accumulator.games * 100),
    draws: roundNumber(accumulator.draws / accumulator.games * 100),
    losses: roundNumber(accumulator.losses / accumulator.games * 100),
    averageScore: roundNumber(accumulator.score / accumulator.games),
    averageUse: roundNumber(accumulator.uses / accumulator.games),
    averageEvolve: roundNumber(accumulator.evolves / accumulator.games),
    tieRate: roundNumber(accumulator.ties / actions * 100),
    cooldownBlockedRate: roundNumber(
      accumulator.cooldownBlocks / actions * 100,
    ),
    pickRate: accumulator.picks.map((count) =>
      roundNumber(count / actions * 100),
    ),
  }
}

function addGame(
  accumulator: ReturnType<typeof emptyPolicyAccumulator>,
  game: ReturnType<typeof simulateGame>,
) {
  accumulator.games += 1
  accumulator.wins += game.leftScore > game.rightScore ? 1 : 0
  accumulator.draws += game.leftScore === game.rightScore ? 1 : 0
  accumulator.losses += game.leftScore < game.rightScore ? 1 : 0
  accumulator.score += game.leftScore
  accumulator.ties += game.ties
  accumulator.cooldownBlocks += game.leftCooldownBlocks
  game.leftActions.forEach((action) => {
    accumulator.uses += actionType(action) === USE ? 1 : 0
    accumulator.evolves += actionType(action) === EVOLVE ? 1 : 0
    accumulator.picks[actionTrait(action)] += 1
  })
}

function exactEvaluation(matrix: Matrix): {
  summary: ExactSummary
  sequences: ExactSequenceResult[]
} {
  const relaxedMemo = new Map<string, number>()
  const results = ALL_SEQUENCES.map((sequence) =>
    solveSequenceExact(matrix, sequence, relaxedMemo),
  )
  results.forEach((result, sequenceIndex) => {
    if (
      result.optimizerActions.length !== EVENT_COUNT ||
      result.greedyActions.length !== EVENT_COUNT ||
      result.optimizerScore - result.greedyScore !== result.differential
    ) {
      throw new Error(`Invalid exact reconstruction for sequence ${sequenceIndex}.`)
    }
    let optimizerCode = 0
    let optimizerCooldown = -1
    let greedyCooldown = -1
    result.optimizerActions.forEach((action, round) => {
      if (!legalActions(optimizerCode, optimizerCooldown).includes(action)) {
        throw new Error(
          `Illegal exact action ${actionKey(action)} in sequence ${sequenceIndex}, round ${round}.`,
        )
      }
      const greedyAction = result.greedyActions[round]
      if (!legalActions(0, greedyCooldown).includes(greedyAction)) {
        throw new Error(
          `Illegal GREEDY action in sequence ${sequenceIndex}, round ${round}.`,
        )
      }
      const next = transition(optimizerCode, action)
      optimizerCode = next.levelCode
      optimizerCooldown = next.cooldown
      greedyCooldown = greedyAction
    })
  })
  const picks = Array(TRAIT_COUNT).fill(0)
  let evolves = 0
  let winningWithEvolve = 0
  let evolveRequiredWins = 0
  let cooldownBlocked = 0
  let cooldownExploited = 0
  let lookaheadChanges = 0

  results.forEach((result, sequenceIndex) => {
    const sequence = ALL_SEQUENCES[sequenceIndex]
    let optimizerCode = 0
    let optimizerCooldown = -1
    let greedyCooldown = -1
    let hasEvolve = false
    result.optimizerActions.forEach((action, round) => {
      const event = sequence[round]
      const greedyAction = result.greedyActions[round]
      const immediate = bestUse(
        matrix,
        event,
        optimizerCode,
        optimizerCooldown,
      )
      if (action !== immediate) lookaheadChanges += 1
      if (cooldownBlocksBest(matrix, event, 0, greedyCooldown)) {
        cooldownBlocked += 1
        if (
          actionValue(matrix, event, optimizerCode, action) >
          actionValue(matrix, event, 0, greedyAction)
        ) {
          cooldownExploited += 1
        }
      }
      hasEvolve ||= actionType(action) === EVOLVE
      evolves += actionType(action) === EVOLVE ? 1 : 0
      picks[actionTrait(action)] += 1
      const optimizerNext = transition(optimizerCode, action)
      optimizerCode = optimizerNext.levelCode
      optimizerCooldown = optimizerNext.cooldown
      greedyCooldown = greedyAction
    })
    if (result.differential > 0 && hasEvolve) winningWithEvolve += 1
    if (
      result.differential > 0 &&
      bestUseOnlyDifferential(matrix, sequence, result.greedyActions) <
        result.differential
    ) {
      evolveRequiredWins += 1
    }
  })

  const differentials = results.map((result) => result.differential)
  const wins = differentials.filter((value) => value > 0).length
  const draws = differentials.filter((value) => value === 0).length
  const losses = differentials.filter((value) => value < 0).length
  const totalActions = ALL_SEQUENCES.length * EVENT_COUNT
  return {
    summary: {
      wins,
      draws,
      losses,
      maximumDifferential: Math.max(...differentials),
      minimumDifferential: Math.min(...differentials),
      evolveRate: roundNumber(evolves / totalActions * 100),
      winningWithEvolveRate: roundNumber(
        wins === 0 ? 0 : winningWithEvolve / wins * 100,
      ),
      evolveRequiredWinRate: roundNumber(
        wins === 0 ? 0 : evolveRequiredWins / wins * 100,
      ),
      cooldownBlockedRate: roundNumber(
        cooldownBlocked / totalActions * 100,
      ),
      cooldownExploitedRate: roundNumber(
        cooldownBlocked === 0 ? 0 : cooldownExploited / cooldownBlocked * 100,
      ),
      lookaheadChangeRate: roundNumber(
        lookaheadChanges / totalActions * 100,
      ),
      optimizerPickRate: picks.map((count) =>
        roundNumber(count / totalActions * 100),
      ),
    },
    sequences: results,
  }
}

function auditEvaluation(
  matrix: Matrix,
  exactSequences: ExactSequenceResult[],
): AuditSummary {
  const random = POLICIES[0]
  const benchmark: Record<string, PolicySummary> = {}
  for (const policy of POLICIES) {
    const accumulator = emptyPolicyAccumulator()
    ALL_SEQUENCES.forEach((sequence, index) => {
      const game = simulateGame(
        matrix,
        sequence,
        policy,
        random,
        SEARCH_SEED ^ index,
        exactSequences[index].optimizerActions,
      )
      addGame(accumulator, game)
    })
    benchmark[policy.id] = summarizeAccumulator(accumulator)
  }

  const nonRandom = POLICIES.filter((policy) => policy.id !== 'random')
  const matchups: AuditSummary['matchups'] = Object.fromEntries(
    nonRandom.map((policy) => [policy.id, {}]),
  )
  const actionSignatures = new Set<string>()

  nonRandom.forEach((left, leftIndex) => {
    nonRandom.slice(leftIndex).forEach((right) => {
      const leftAccumulator = emptyPolicyAccumulator()
      const rightAccumulator = emptyPolicyAccumulator()
      ALL_SEQUENCES.forEach((sequence, index) => {
        const exactActions = exactSequences[index].optimizerActions
        const first = simulateGame(
          matrix,
          sequence,
          left,
          right,
          SEARCH_SEED ^ (index * 17 + leftIndex),
          exactActions,
        )
        const second = simulateGame(
          matrix,
          sequence,
          right,
          left,
          SEARCH_SEED ^ (index * 31 + leftIndex),
          exactActions,
        )
        addGame(leftAccumulator, first)
        addGame(rightAccumulator, {
          ...first,
          leftScore: first.rightScore,
          rightScore: first.leftScore,
          leftActions: first.rightActions,
          rightActions: first.leftActions,
        })
        addGame(rightAccumulator, second)
        addGame(leftAccumulator, {
          ...second,
          leftScore: second.rightScore,
          rightScore: second.leftScore,
          leftActions: second.rightActions,
          rightActions: second.leftActions,
        })
        actionSignatures.add(
          `${left.id}:${first.leftActions.map(actionKey).join('>')}`,
        )
      })
      const leftSummary = summarizeAccumulator(leftAccumulator)
      const rightSummary = summarizeAccumulator(rightAccumulator)
      matchups[left.id][right.id] = {
        winRate: leftSummary.wins,
        drawRate: leftSummary.draws,
        lossRate: leftSummary.losses,
      }
      matchups[right.id][left.id] = {
        winRate: rightSummary.wins,
        drawRate: rightSummary.draws,
        lossRate: rightSummary.losses,
      }
    })
  })

  const universalFloors = nonRandom.map((policy) =>
    Math.min(
      ...nonRandom
        .filter((opponent) => opponent.id !== policy.id)
        .map((opponent) => matchups[policy.id][opponent.id].winRate),
    ),
  )

  return {
    benchmark,
    matchups,
    maximumUniversalWinFloor: roundNumber(Math.max(...universalFloors)),
    strategyVariety: roundNumber(
      actionSignatures.size /
        (ALL_SEQUENCES.length * nonRandom.length) *
        100,
    ),
  }
}

function entropyPercent(rates: number[]): number {
  const probabilities = rates
    .map((rate) => rate / 100)
    .filter((probability) => probability > 0)
  const entropy = -probabilities.reduce(
    (sum, probability) => sum + probability * Math.log2(probability),
    0,
  )
  return entropy / Math.log2(TRAIT_COUNT) * 100
}

function triangular(value: number, ideal: number, radius: number): number {
  return Math.max(0, 1 - Math.abs(value - ideal) / radius)
}

function fitness(
  solver: ExactSummary,
  audit: AuditSummary,
): FitnessBreakdown {
  const winRate = solver.wins / ALL_SEQUENCES.length * 100
  const drawRate = solver.draws / ALL_SEQUENCES.length * 100
  const maximumPick = Math.max(...solver.optimizerPickRate)
  const strategicDepth = 18 * triangular(winRate, 48, 42)
  const cooldown = 14 * triangular(solver.cooldownBlockedRate, 8, 10)
  const evolve = 14 * triangular(solver.evolveRate, 14, 14)
  const lookahead = 12 * triangular(solver.lookaheadChangeRate, 28, 28)
  const pickBalance = 12 * entropyPercent(solver.optimizerPickRate) / 100
  const drawControl = 8 * triangular(drawRate, 28, 28)
  const variety = 10 * Math.min(1, audit.strategyVariety / 45)
  const dominancePenalty = 12 * Math.max(
    0,
    (audit.maximumUniversalWinFloor - 65) / 35,
  )
  const concentrationPenalty = 10 * Math.max(0, (maximumPick - 38) / 32)
  const mandatoryEvolvePenalty = 8 * Math.max(
    0,
    (solver.evolveRequiredWinRate - 60) / 40,
  )
  const total =
    strategicDepth +
    cooldown +
    evolve +
    lookahead +
    pickBalance +
    drawControl +
    variety -
    dominancePenalty -
    concentrationPenalty -
    mandatoryEvolvePenalty

  return {
    total: roundNumber(total),
    strategicDepth: roundNumber(strategicDepth),
    cooldown: roundNumber(cooldown),
    evolve: roundNumber(evolve),
    lookahead: roundNumber(lookahead),
    pickBalance: roundNumber(pickBalance),
    drawControl: roundNumber(drawControl),
    variety: roundNumber(variety),
    dominancePenalty: roundNumber(dominancePenalty),
    concentrationPenalty: roundNumber(concentrationPenalty),
    mandatoryEvolvePenalty: roundNumber(mandatoryEvolvePenalty),
  }
}

function validateMatrix(matrix: Matrix): string[] {
  const violations: string[] = []
  if (matrix.length !== EVENT_COUNT) violations.push('event-count')
  const primaryCounts = Array(TRAIT_COUNT).fill(0)
  const positiveCounts = Array(TRAIT_COUNT).fill(0)

  matrix.forEach((row, event) => {
    if (row.length !== TRAIT_COUNT) violations.push(`trait-count:${event}`)
    if (row.filter((modifier) => modifier === 2).length !== 1) {
      violations.push(`primary-count:${event}`)
    }
    if (row.filter((modifier) => modifier === 1).length < 1) {
      violations.push(`missing-secondary:${event}`)
    }
    if (row.filter((modifier) => modifier === 1).length > 3) {
      violations.push(`too-many-secondary:${event}`)
    }
    if (row.filter((modifier) => modifier === -1).length > 2) {
      violations.push(`too-many-negative:${event}`)
    }
    row.forEach((modifier, trait) => {
      if (![-1, 0, 1, 2].includes(modifier)) {
        violations.push(`invalid-modifier:${event}:${trait}`)
      }
      if (modifier === 2) primaryCounts[trait] += 1
      if (modifier > 0) positiveCounts[trait] += 1
      const biology = BIOLOGY[EVENT_IDS[event]]
      const traitId = TRAITS[trait]
      if (modifier === 2 && !biology.primary.includes(traitId)) {
        violations.push(`implausible-primary:${event}:${trait}`)
      }
      if (modifier === 1 && !biology.positive.includes(traitId)) {
        violations.push(`implausible-positive:${event}:${trait}`)
      }
      if (modifier === -1 && !biology.negative.includes(traitId)) {
        violations.push(`implausible-negative:${event}:${trait}`)
      }
    })
  })
  primaryCounts.forEach((count, trait) => {
    if (count > 2) violations.push(`primary-cap:${trait}`)
  })
  positiveCounts.forEach((count, trait) => {
    if (count === 0) violations.push(`dead-trait:${trait}`)
  })
  return violations
}

function repairMatrix(matrix: Matrix, random: Rng): Matrix {
  const repaired = cloneMatrix(matrix)
  repaired.forEach((row, event) => {
    const biology = BIOLOGY[EVENT_IDS[event]]
    for (let trait = 0; trait < TRAIT_COUNT; trait += 1) {
      const traitId = TRAITS[trait]
      if (row[trait] === 2 && !biology.primary.includes(traitId)) row[trait] = 0
      if (row[trait] === 1 && !biology.positive.includes(traitId)) row[trait] = 0
      if (row[trait] === -1 && !biology.negative.includes(traitId)) row[trait] = 0
    }
    const primaries = row
      .map((modifier, trait) => ({ modifier, trait }))
      .filter(({ modifier }) => modifier === 2)
    if (primaries.length !== 1) {
      primaries.slice(1).forEach(({ trait }) => {
        row[trait] = biology.positive.includes(TRAITS[trait]) ? 1 : 0
      })
      if (primaries.length === 0) {
        const candidates = biology.primary.map((trait) => TRAIT_INDEX[trait])
        row[candidates[Math.floor(random() * candidates.length)]] = 2
      }
    }
    const secondaries = row
      .map((modifier, trait) => ({ modifier, trait }))
      .filter(({ modifier }) => modifier === 1)
    if (secondaries.length === 0) {
      const primary = row.indexOf(2)
      const candidates = biology.positive
        .map((trait) => TRAIT_INDEX[trait])
        .filter((trait) => trait !== primary)
      row[candidates[Math.floor(random() * candidates.length)]] = 1
    }
    secondaries.slice(3).forEach(({ trait }) => {
      row[trait] = 0
    })
    row
      .map((modifier, trait) => ({ modifier, trait }))
      .filter(({ modifier }) => modifier === -1)
      .slice(2)
      .forEach(({ trait }) => {
        row[trait] = 0
      })
  })

  const primaryCounts = Array(TRAIT_COUNT).fill(0)
  repaired.forEach((row) => {
    primaryCounts[row.indexOf(2)] += 1
  })
  primaryCounts.forEach((count, trait) => {
    while (primaryCounts[trait] > 2) {
      const event = repaired.findIndex((row) => row.indexOf(2) === trait)
      const candidates = BIOLOGY[EVENT_IDS[event]].primary
        .map((candidate) => TRAIT_INDEX[candidate])
        .filter((candidate) => primaryCounts[candidate] < 2)
      if (candidates.length === 0) break
      const replacement =
        candidates[Math.floor(random() * candidates.length)]
      repaired[event][trait] =
        BIOLOGY[EVENT_IDS[event]].positive.includes(TRAITS[trait]) ? 1 : 0
      repaired[event][replacement] = 2
      primaryCounts[trait] -= 1
      primaryCounts[replacement] += 1
    }
  })

  const positiveCounts = Array(TRAIT_COUNT).fill(0)
  repaired.forEach((row) =>
    row.forEach((modifier, trait) => {
      if (modifier > 0) positiveCounts[trait] += 1
    }),
  )
  positiveCounts.forEach((count, trait) => {
    if (count > 0) return
    const candidateEvents = EVENT_IDS
      .map((eventId, event) => ({ eventId, event }))
      .filter(({ eventId, event }) =>
        BIOLOGY[eventId].positive.includes(TRAITS[trait]) &&
        repaired[event][trait] === 0 &&
        repaired[event].filter((modifier) => modifier === 1).length < 3,
      )
    if (candidateEvents.length > 0) {
      const selected =
        candidateEvents[Math.floor(random() * candidateEvents.length)]
      repaired[selected.event][trait] = 1
    }
  })
  return repaired
}

function mutate(matrix: Matrix, random: Rng): Matrix {
  const next = cloneMatrix(matrix)
  const mutations = 1 + Math.floor(random() * 3)
  for (let mutation = 0; mutation < mutations; mutation += 1) {
    const event = Math.floor(random() * EVENT_COUNT)
    const biology = BIOLOGY[EVENT_IDS[event]]
    const operation = Math.floor(random() * 4)
    if (operation === 0) {
      const currentPrimary = next[event].indexOf(2)
      const candidates = biology.primary
        .map((trait) => TRAIT_INDEX[trait])
        .filter((trait) => trait !== currentPrimary)
      if (candidates.length > 0) {
        const replacement =
          candidates[Math.floor(random() * candidates.length)]
        next[event][currentPrimary] = biology.positive.includes(
          TRAITS[currentPrimary],
        )
          ? 1
          : 0
        next[event][replacement] = 2
      }
    } else if (operation === 1) {
      const candidates = biology.positive
        .map((trait) => TRAIT_INDEX[trait])
        .filter((trait) => next[event][trait] !== 2)
      const trait = candidates[Math.floor(random() * candidates.length)]
      next[event][trait] = next[event][trait] === 1 ? 0 : 1
    } else if (operation === 2) {
      const candidates = biology.negative.map(
        (trait) => TRAIT_INDEX[trait],
      )
      const trait = candidates[Math.floor(random() * candidates.length)]
      next[event][trait] = next[event][trait] === -1 ? 0 : -1
    } else {
      const other = Math.floor(random() * EVENT_COUNT)
      const leftPrimary = next[event].indexOf(2)
      const rightPrimary = next[other].indexOf(2)
      if (
        BIOLOGY[EVENT_IDS[event]].primary.includes(TRAITS[rightPrimary]) &&
        BIOLOGY[EVENT_IDS[other]].primary.includes(TRAITS[leftPrimary])
      ) {
        next[event][leftPrimary] = 0
        next[other][rightPrimary] = 0
        next[event][rightPrimary] = 2
        next[other][leftPrimary] = 2
      }
    }
  }
  return repairMatrix(next, random)
}

function crossover(left: Matrix, right: Matrix, random: Rng): Matrix {
  return repairMatrix(
    left.map((row, event) =>
      random() < 0.5 ? [...row] : [...right[event]],
    ),
    random,
  )
}

function serializeEffects(matrix: Matrix) {
  return EVENT_IDS.map((eventId, event) => ({
    eventId,
    effects: matrix[event]
      .map((modifier, trait) => ({ modifier, trait }))
      .filter(({ modifier }) => modifier !== 0)
      .sort((left, right) => right.modifier - left.modifier)
      .map(({ modifier, trait }) => ({
        trait: TRAITS[trait],
        modifier,
        reason: narrative(eventId, TRAITS[trait], modifier),
      })),
  }))
}

function narrative(
  eventId: string,
  trait: TraitType,
  modifier: number,
): string {
  const mechanism = TRAIT_NARRATIVE[trait]
  const context = NARRATIVE_CONTEXT[eventId]
  return modifier === 2
    ? `${mechanism} rappresenta la risposta biologica principale ${context}.`
    : modifier === 1
      ? `${mechanism} contribuisce in modo secondario ${context}.`
      : `${mechanism} diventa un costo biologico ${context}.`
}

function rationaleFor(
  matrix: Matrix,
  solver: ExactSummary,
  audit: AuditSummary,
): string[] {
  const duplicatedPrimaries = TRAITS.filter((_, trait) => {
    const count = matrix.filter((row) => row[trait] === 2).length
    return count === 2
  })
  return [
    `Best response: ${solver.wins} vittorie, ${solver.draws} pareggi, ${solver.losses} sconfitte.`,
    `Cooldown blocca il migliore USE nel ${solver.cooldownBlockedRate}% degli stati esatti.`,
    `EVOLVE compare nel ${solver.evolveRate}% delle azioni ottime ed è necessario per l'optimum nel ${solver.evolveRequiredWinRate}% delle sequenze vinte; lookahead cambia il ${solver.lookaheadChangeRate}%.`,
    `Massimo pick-rate ottimo ${Math.max(...solver.optimizerPickRate)}%; floor universale massimo ${audit.maximumUniversalWinFloor}%.`,
    duplicatedPrimaries.length > 0
      ? `Geni principali duplicati: ${duplicatedPrimaries.join(', ')}.`
      : 'Nessun gene principale duplicato.',
  ]
}

function evaluate(
  matrix: Matrix,
  generation: number,
  id: string,
): Evaluation {
  const violations = validateMatrix(matrix)
  if (violations.length > 0) {
    throw new Error(`Invalid candidate ${id}: ${violations.join(', ')}`)
  }
  const exactStartedAt = Date.now()
  const exact = exactEvaluation(matrix)
  const auditStartedAt = Date.now()
  const audit = auditEvaluation(matrix, exact.sequences)
  if (SMOKE_MODE) {
    console.log(
      `timing exact=${auditStartedAt - exactStartedAt}ms audit=${Date.now() - auditStartedAt}ms`,
    )
  }
  const score = fitness(exact.summary, audit)
  return {
    id,
    generation,
    matrix: cloneMatrix(matrix),
    effects: serializeEffects(matrix),
    fitness: score,
    solver: exact.summary,
    audit,
    rationale: rationaleFor(matrix, exact.summary, audit),
  }
}

function compactEvaluation(evaluation: Evaluation) {
  return {
    id: evaluation.id,
    generation: evaluation.generation,
    matrix: evaluation.matrix,
    fitness: evaluation.fitness,
    solver: evaluation.solver,
    audit: {
      benchmark: evaluation.audit.benchmark,
      maximumUniversalWinFloor:
        evaluation.audit.maximumUniversalWinFloor,
      strategyVariety: evaluation.audit.strategyVariety,
    },
  }
}

function matrixMarkdown(matrix: Matrix): string {
  const header = `| Evento | ${TRAITS.join(' | ')} |`
  const divider = `|---|${TRAITS.map(() => '---:').join('|')}|`
  const rows = EVENT_IDS.map(
    (eventId, event) =>
      `| ${eventId} | ${matrix[event]
        .map((modifier) => (modifier > 0 ? `+${modifier}` : `${modifier}`))
        .join(' | ')} |`,
  )
  return [header, divider, ...rows].join('\n')
}

function rankingMarkdown(
  baseline: Evaluation,
  ranking: Evaluation[],
): string {
  const lines = [
    '# Ranking automatico dei cataloghi',
    '',
    `Seed: \`${SEARCH_SEED}\`. Candidati valutati: ${TARGET_EVALUATIONS}.`,
    '',
    '## Fitness',
    '',
    'La fitness (massimo teorico 100 prima delle penalità) usa:',
    '',
    '- profondità strategica / best response non banale: 18;',
    '- cooldown rilevante: 14;',
    '- EVOLVE utile ma non obbligatorio: 14;',
    '- decisioni modificate dal lookahead: 12;',
    '- entropia dei pick: 12;',
    '- controllo dei pareggi: 8;',
    '- varietà delle policy: 10;',
    '- penalità dominanza universale: fino a 12;',
    '- penalità concentrazione di un gene: fino a 10;',
    '- penalità EVOLVE obbligatorio: fino a 8.',
    '',
    '“EVOLVE obbligatorio” è misurato esattamente: per ogni sequenza il DP',
    'confronta l’optimum completo con l’optimum vincolato a sole azioni USE.',
    '',
    'Le componenti premiate sono triangolari attorno a obiettivi intermedi,',
    'quindi la ricerca non massimizza semplicemente le vittorie contro GREEDY.',
    '',
    '## Confronto sintetico',
    '',
    '| # | Catalogo | Score | Solver W/D/L | EVOLVE % | EVOLVE necessario % | Cooldown % | Lookahead % | Pick max % | Dominance floor % |',
    '|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    `| baseline | ${baseline.id} | ${baseline.fitness.total} | ${baseline.solver.wins}/${baseline.solver.draws}/${baseline.solver.losses} | ${baseline.solver.evolveRate} | ${baseline.solver.evolveRequiredWinRate} | ${baseline.solver.cooldownBlockedRate} | ${baseline.solver.lookaheadChangeRate} | ${Math.max(...baseline.solver.optimizerPickRate)} | ${baseline.audit.maximumUniversalWinFloor} |`,
    ...ranking.map(
      (candidate, index) =>
        `| ${index + 1} | ${candidate.id} | ${candidate.fitness.total} | ${candidate.solver.wins}/${candidate.solver.draws}/${candidate.solver.losses} | ${candidate.solver.evolveRate} | ${candidate.solver.evolveRequiredWinRate} | ${candidate.solver.cooldownBlockedRate} | ${candidate.solver.lookaheadChangeRate} | ${Math.max(...candidate.solver.optimizerPickRate)} | ${candidate.audit.maximumUniversalWinFloor} |`,
    ),
    '',
  ]
  ranking.forEach((candidate, index) => {
    lines.push(
      `## ${index + 1}. ${candidate.id}`,
      '',
      ...candidate.rationale.map((reason) => `- ${reason}`),
      '',
      matrixMarkdown(candidate.matrix),
      '',
      'Pick-rate best response:',
      '',
      TRAITS.map(
        (trait, traitIndex) =>
          `- ${trait}: ${candidate.solver.optimizerPickRate[traitIndex]}%`,
      ).join('\n'),
      '',
      'Audit contro random:',
      '',
      '| Policy | W/D/L % | Score | USE | EVOLVE | Cooldown % | Tie % |',
      '|---|---:|---:|---:|---:|---:|---:|',
      ...Object.entries(candidate.audit.benchmark).map(
        ([policy, summary]) =>
          `| ${policy} | ${summary.wins}/${summary.draws}/${summary.losses} | ${summary.averageScore} | ${summary.averageUse} | ${summary.averageEvolve} | ${summary.cooldownBlockedRate} | ${summary.tieRate} |`,
      ),
      '',
    )
  })
  return lines.join('\n')
}

function recommendationMarkdown(
  baseline: Evaluation,
  recommendation: Evaluation,
): string {
  const scoreGain = roundNumber(
    recommendation.fitness.total - baseline.fitness.total,
  )
  const zeroPickTraits = TRAITS.filter(
    (_, trait) => recommendation.solver.optimizerPickRate[trait] === 0,
  )
  return [
    '# Catalogo raccomandato',
    '',
    `**Raccomandazione: ${recommendation.id}.**`,
    '',
    `Fitness ${recommendation.fitness.total}, contro ${baseline.fitness.total} del catalogo produttivo corrente.`,
    '',
    ...recommendation.rationale.map((reason) => `- ${reason}`),
    '',
    '## Perché è la scelta migliore trovata',
    '',
    `- Guadagna ${scoreGain} punti di fitness sul catalogo corrente.`,
    `- Aumenta l'impatto del cooldown da ${baseline.solver.cooldownBlockedRate}% a ${recommendation.solver.cooldownBlockedRate}%.`,
    `- Aumenta le decisioni cambiate dal lookahead da ${baseline.solver.lookaheadChangeRate}% a ${recommendation.solver.lookaheadChangeRate}%.`,
    `- Riduce il picco di concentrazione dei pick da ${Math.max(...baseline.solver.optimizerPickRate)}% a ${Math.max(...recommendation.solver.optimizerPickRate)}%.`,
    `- Non aumenta il floor universale delle policy: resta ${recommendation.audit.maximumUniversalWinFloor}%.`,
    '',
    '## Matrice completa',
    '',
    matrixMarkdown(recommendation.matrix),
    '',
    '## Narrative generate',
    '',
    ...recommendation.effects.flatMap((event) => [
      `### ${event.eventId}`,
      '',
      ...event.effects.map(
        (effect) =>
          `- ${effect.trait} ${effect.modifier > 0 ? '+' : ''}${effect.modifier}: ${effect.reason}`,
      ),
      '',
    ]),
    '## Compromessi',
    '',
    `- Best response W/D/L: ${recommendation.solver.wins}/${recommendation.solver.draws}/${recommendation.solver.losses}.`,
    `- EVOLVE: ${recommendation.solver.evolveRate}% delle azioni ottime; necessario per l'optimum nel ${recommendation.solver.evolveRequiredWinRate}% delle sequenze vinte.`,
    `- Cooldown rilevante: ${recommendation.solver.cooldownBlockedRate}%.`,
    `- Pick massimo: ${Math.max(...recommendation.solver.optimizerPickRate)}%.`,
    `- Floor universale massimo fra le policy: ${recommendation.audit.maximumUniversalWinFloor}%.`,
    '',
    '## Problemi ancora presenti',
    '',
    `- EVOLVE resta necessario per ottenere l'optimum nel ${recommendation.solver.evolveRequiredWinRate}% delle sequenze vinte: la matrice migliora il sistema, ma non elimina questa proprietà strutturale delle regole immutabili.`,
    `- I geni senza pick nel percorso ottimo ricostruito sono: ${zeroPickTraits.join(', ') || 'nessuno'}.`,
    `- GREEDY resta battibile in ${recommendation.solver.wins} sequenze su ${ALL_SEQUENCES.length}; il risultato premia profondità e varietà complessive, non l'imbattibilità di GREEDY.`,
    '',
    'La raccomandazione non è applicata automaticamente al catalogo produttivo:',
    'rimane una proposta riproducibile da approvare con revisione di game design.',
    '',
  ].join('\n')
}

function loadCheckpoint(): Map<string, Evaluation> {
  const cache = new Map<string, Evaluation>()
  const fitnessPath = `${OUTPUT_DIRECTORY}fitness-results.json`
  const bestPath = `${OUTPUT_DIRECTORY}best-catalogs.json`
  if (!RESUME_SEARCH || !existsSync(fitnessPath) || !existsSync(bestPath)) {
    return cache
  }

  const fitnessFile = JSON.parse(
    readFileSync(fitnessPath, 'utf8'),
  ) as {
    metadata: { seed: number; evaluationVersion?: number }
    evaluations: Array<Omit<Evaluation, 'effects' | 'rationale'>>
  }
  if (
    fitnessFile.metadata.seed !== SEARCH_SEED ||
    (fitnessFile.metadata.evaluationVersion ?? 1) !== EVALUATION_VERSION
  ) {
    return cache
  }

  fitnessFile.evaluations.forEach((evaluation) => {
    const hydrated = {
      ...evaluation,
      effects: serializeEffects(evaluation.matrix),
      rationale: rationaleFor(
        evaluation.matrix,
        evaluation.solver,
        evaluation.audit,
      ),
      audit: {
        ...evaluation.audit,
        matchups: evaluation.audit.matchups ?? {},
      },
    } as Evaluation
    cache.set(matrixKey(hydrated.matrix), hydrated)
  })

  const bestFile = JSON.parse(readFileSync(bestPath, 'utf8')) as {
    metadata: { seed: number; evaluationVersion?: number }
    baseline: Evaluation
    catalogs: Evaluation[]
  }
  if (
    bestFile.metadata.seed === SEARCH_SEED &&
    (bestFile.metadata.evaluationVersion ?? 1) === EVALUATION_VERSION
  ) {
    const completeEvaluations = [bestFile.baseline, ...bestFile.catalogs]
    completeEvaluations.forEach((evaluation) => {
      cache.set(matrixKey(evaluation.matrix), {
        ...evaluation,
        effects: serializeEffects(evaluation.matrix),
        rationale: rationaleFor(
          evaluation.matrix,
          evaluation.solver,
          evaluation.audit,
        ),
      })
    })
  }
  return cache
}

enabledDescribe('automatic catalog game designer', () => {
  it('searches biologically plausible catalogs with exact solver and systemic audit', () => {
    const random = makeRng(SEARCH_SEED)
    const cache = loadCheckpoint()
    const checkpointSize = cache.size
    const touchedKeys = new Set<string>()
    let serial = [...cache.values()].reduce((maximum, evaluation) => {
      const parsed = Number(evaluation.id.replace('catalog-', ''))
      return Number.isFinite(parsed) ? Math.max(maximum, parsed) : maximum
    }, 0)
    const evaluateCached = (matrix: Matrix, generation: number) => {
      const key = matrixKey(matrix)
      touchedKeys.add(key)
      const cached = cache.get(key)
      if (cached) return cached
      serial += 1
      const evaluation = evaluate(
        matrix,
        generation,
        `catalog-${String(serial).padStart(4, '0')}`,
      )
      cache.set(key, evaluation)
      if (!SMOKE_MODE && serial % 10 === 0) {
        writeFileSync(
          `${OUTPUT_DIRECTORY}search-progress.json`,
          `${JSON.stringify({
            evaluated: serial,
            target: TARGET_EVALUATIONS,
            generation,
            bestFitness: Math.max(
              ...[...cache.values()].map(
                (candidate) => candidate.fitness.total,
              ),
            ),
          }, null, 2)}\n`,
        )
      }
      return evaluation
    }

    const baseline = evaluateCached(currentMatrix(), -1)
    expect(baseline.solver).toMatchObject({
      wins: 520,
      draws: 200,
      losses: 0,
      maximumDifferential: 4,
      minimumDifferential: 0,
    })
    if (SMOKE_MODE) {
      expect(validateMatrix(baseline.matrix)).toEqual([])
      return
    }

    let population: Matrix[] = [currentMatrix()]
    while (population.length < POPULATION_SIZE) {
      population.push(mutate(currentMatrix(), random))
    }

    for (let generation = 0; generation <= GENERATIONS; generation += 1) {
      const evaluated = population
        .map((matrix) => evaluateCached(matrix, generation))
        .sort((left, right) => right.fitness.total - left.fitness.total)
      const elites = evaluated.slice(0, ELITE_COUNT)
      if (generation === GENERATIONS) break

      const nextPopulation = elites.map((elite) => elite.matrix)
      while (nextPopulation.length < POPULATION_SIZE) {
        const left = elites[Math.floor(random() * elites.length)].matrix
        const right = elites[Math.floor(random() * elites.length)].matrix
        const child = random() < 0.65
          ? crossover(left, right, random)
          : cloneMatrix(left)
        nextPopulation.push(mutate(child, random))
      }
      population = nextPopulation
    }

    while (
      touchedKeys.size < Math.min(checkpointSize, TARGET_EVALUATIONS) ||
      cache.size < TARGET_EVALUATIONS
    ) {
      const ranked = [...touchedKeys]
        .map((key) => cache.get(key))
        .filter((candidate): candidate is Evaluation => candidate !== undefined)
        .sort(
        (left, right) => right.fitness.total - left.fitness.total,
        )
      const parent =
        ranked[Math.floor(random() * Math.min(20, ranked.length))].matrix
      evaluateCached(mutate(parent, random), GENERATIONS + 1)
    }

    const ranking = [...cache.values()]
      .filter((candidate) => candidate.id !== baseline.id)
      .sort((left, right) => right.fitness.total - left.fitness.total)
      .slice(0, TOP_COUNT)
    const recommended = ranking[0]

    const metadata = {
      generatedAt: new Date().toISOString(),
      seed: SEARCH_SEED,
      evaluationVersion: EVALUATION_VERSION,
      algorithm: 'elitist genetic search with mutation, crossover and repair',
      populationSize: POPULATION_SIZE,
      generations: GENERATIONS,
      evaluatedCatalogs: cache.size,
      exactSequencesPerCatalog: ALL_SEQUENCES.length,
      policies: POLICIES.map((policy) => policy.id),
      candidateTests: [
        'six events and ten traits',
        'exactly one +2 per event',
        'one to three +1 per event',
        'at most two -1 per event',
        'at most two +2 occurrences per trait',
        'all traits retain a positive affinity',
        'biological allow-list',
        'all 720 exact best responses are reconstructible',
        'complete deterministic policy audit',
      ],
    }

    writeFileSync(
      `${OUTPUT_DIRECTORY}best-catalogs.json`,
      `${JSON.stringify({ metadata, baseline, catalogs: ranking }, null, 2)}\n`,
    )
    writeFileSync(
      `${OUTPUT_DIRECTORY}fitness-results.json`,
      `${JSON.stringify({
        metadata,
        fitnessDefinition: {
          strategicDepth: 18,
          cooldown: 14,
          evolve: 14,
          lookahead: 12,
          pickBalance: 12,
          drawControl: 8,
          variety: 10,
          dominancePenalty: -12,
          concentrationPenalty: -10,
          mandatoryEvolvePenalty: -8,
        },
        baseline: compactEvaluation(baseline),
        evaluations: [...cache.values()].map(compactEvaluation),
      }, null, 2)}\n`,
    )
    writeFileSync(
      `${OUTPUT_DIRECTORY}catalog-ranking.md`,
      `${rankingMarkdown(baseline, ranking)}\n`,
    )
    writeFileSync(
      `${OUTPUT_DIRECTORY}recommended-catalog.md`,
      `${recommendationMarkdown(baseline, recommended)}\n`,
    )

    if (!SMOKE_MODE) {
      expect(cache.size).toBeGreaterThanOrEqual(TARGET_EVALUATIONS)
      expect(ranking).toHaveLength(10)
      expect(ranking[0].fitness.total).toBeGreaterThan(
        baseline.fitness.total,
      )
    }
    ranking.forEach((candidate) => {
      expect(validateMatrix(candidate.matrix)).toEqual([])
    })
  }, 1_800_000)
})
