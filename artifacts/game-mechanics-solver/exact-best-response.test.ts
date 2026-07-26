import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  createInitialTraits,
  TRAITS,
} from '../../src/game/config'
import { getLegalBotActions, type BotRoundAction } from '../../src/game/bot'
import { resolveRound } from '../../src/game/engine'
import { ROUND_EVENT_DEFINITIONS } from '../../src/game/round-events'
import type { TraitCollection, TraitType } from '../../src/game/types'
import {
  CurrentAndNextBestResponseSolver,
  ExactBestResponseSolver,
  auditGreedyTieBreaks,
  chooseGreedyAction,
  generateAllEventPermutations,
  getSolverRulesMetadata,
  solveCurrentEventMirrorPolicy,
  summarizeSolutions,
  type GreedyMode,
  type SequenceSolution,
} from './exact-best-response'

const artifactDirectory = dirname(fileURLToPath(import.meta.url))
const resultsPath = resolve(artifactDirectory, 'results.json')
const enabledDescribe =
  process.env.RUN_GAME_MECHANICS_SOLVER === '1' ? describe : describe.skip

let permutations: string[][] = []
let fullKnowledgeSolutions: SequenceSolution[] = []
let currentAndNextSolutions: SequenceSolution[] = []
let modifierPlusTwoSolutions: SequenceSolution[] = []
let fullKnowledgeSolver: ExactBestResponseSolver
let fullKnowledgeSummary: ReturnType<typeof summarizeSolutions>
let currentAndNextSummary: ReturnType<typeof summarizeSolutions>
let modifierPlusTwoSummary: ReturnType<typeof summarizeSolutions>
let immediateTieAudit: ReturnType<typeof auditGreedyTieBreaks>
let modifierTieAudit: ReturnType<typeof auditGreedyTieBreaks>
let catalogSnapshot = ''
let generatedResults: Record<string, unknown>

type OverlapGroup =
  | 'heat_then_nutrient_consecutive'
  | 'nutrient_then_heat_consecutive'
  | 'non_consecutive'

function overlapGroup(sequence: string[]): OverlapGroup {
  const heatIndex = sequence.indexOf('HEAT_SPIKE')
  const nutrientIndex = sequence.indexOf('NUTRIENT_COLLAPSE')

  if (nutrientIndex === heatIndex + 1) {
    return 'heat_then_nutrient_consecutive'
  }
  if (heatIndex === nutrientIndex + 1) {
    return 'nutrient_then_heat_consecutive'
  }
  return 'non_consecutive'
}

function summarizeByOverlapGroup(solutions: SequenceSolution[]) {
  return Object.fromEntries(
    (
      [
        'heat_then_nutrient_consecutive',
        'nutrient_then_heat_consecutive',
        'non_consecutive',
      ] as const
    ).map((group) => [
      group,
      summarizeSolutions(
        solutions.filter((solution) => overlapGroup(solution.events) === group),
      ),
    ]),
  )
}

function sameAction(left: BotRoundAction, right: BotRoundAction): boolean {
  return (
    left.trait === right.trait && left.actionType === right.actionType
  )
}

function actionSignature(solution: SequenceSolution, side: 'optimizer' | 'greedy') {
  return solution.trace
    .map((round) => {
      const action =
        side === 'optimizer' ? round.optimizerAction : round.greedyAction
      return `${action.actionType}:${action.trait}`
    })
    .join('|')
}

function tieOrder(...priorities: TraitType[]): TraitType[] {
  return [
    ...priorities,
    ...TRAITS.filter((trait) => !priorities.includes(trait)),
  ]
}

function cloneTraits(traits: TraitCollection): TraitCollection {
  return Object.fromEntries(
    TRAITS.map((trait) => [trait, { ...traits[trait] }]),
  ) as TraitCollection
}

function actionIsLegal(
  action: BotRoundAction,
  traits: TraitCollection,
): boolean {
  return getLegalBotActions(traits).some(
    (legalAction) =>
      legalAction.trait === action.trait &&
      legalAction.actionType === action.actionType,
  )
}

function replaySolution(
  solution: SequenceSolution,
  greedyMode: GreedyMode,
): void {
  let optimizerTraits = createInitialTraits()
  let greedyTraits = createInitialTraits()
  let optimizerScore = 0
  let greedyScore = 0

  expect(solution.trace).toHaveLength(6)

  solution.trace.forEach((roundTrace, roundIndex) => {
    const event = ROUND_EVENT_DEFINITIONS.find(
      (candidate) => candidate.id === solution.events[roundIndex],
    )
    expect(event).toBeDefined()
    if (!event) return

    expect(roundTrace.roundNumber).toBe(roundIndex + 1)
    expect(roundTrace.eventId).toBe(event.id)
    expect(roundTrace.optimizerTraitsBefore).toEqual(optimizerTraits)
    expect(roundTrace.greedyTraitsBefore).toEqual(greedyTraits)
    expect(actionIsLegal(roundTrace.optimizerAction, optimizerTraits)).toBe(true)

    const expectedGreedyAction = chooseGreedyAction(
      greedyMode,
      event.id,
      greedyTraits,
      TRAITS,
    )
    expect(roundTrace.greedyAction).toEqual(expectedGreedyAction)
    expect(actionIsLegal(roundTrace.greedyAction, greedyTraits)).toBe(true)

    const resolution = resolveRound({
      roundNumber: roundIndex + 1,
      roundEvent: event,
      player1Id: 'optimizer',
      player2Id: 'greedy',
      player1Traits: cloneTraits(optimizerTraits),
      player2Traits: cloneTraits(greedyTraits),
      player1Action: {
        playerId: 'optimizer',
        ...roundTrace.optimizerAction,
      },
      player2Action: {
        playerId: 'greedy',
        ...roundTrace.greedyAction,
      },
    })

    optimizerTraits = resolution.player1.traits
    greedyTraits = resolution.player2.traits
    optimizerScore += resolution.player1ScoreDelta
    greedyScore += resolution.player2ScoreDelta

    expect(roundTrace.optimizerValue).toBe(resolution.player1.roundValue)
    expect(roundTrace.greedyValue).toBe(resolution.player2.roundValue)
    expect(roundTrace.optimizerScoreAfter).toBe(optimizerScore)
    expect(roundTrace.greedyScoreAfter).toBe(greedyScore)
    expect(roundTrace.optimizerTraitsAfter).toEqual(optimizerTraits)
    expect(roundTrace.greedyTraitsAfter).toEqual(greedyTraits)
  })

  expect(solution.optimizerScore).toBe(optimizerScore)
  expect(solution.greedyScore).toBe(greedyScore)
  expect(solution.differential).toBe(optimizerScore - greedyScore)
}

enabledDescribe('exact best response against productive GREEDY', () => {
  beforeAll(() => {
    catalogSnapshot = JSON.stringify(ROUND_EVENT_DEFINITIONS)
    permutations = generateAllEventPermutations()

    fullKnowledgeSolver = new ExactBestResponseSolver('immediate-value', TRAITS)
    fullKnowledgeSolutions = permutations.map((sequence, index) => {
      const solution = fullKnowledgeSolver.solve(sequence)
      if ((index + 1) % 60 === 0) {
        console.log(`full-knowledge progress: ${index + 1}/720`)
      }
      return solution
    })
    fullKnowledgeSummary = summarizeSolutions(fullKnowledgeSolutions)
    console.log(
      `full-knowledge complete: ${fullKnowledgeSolver.exploredStates} states`,
    )

    // GREEDY "principal gene" falls back to the maximum legal USE. Because
    // GREEDY never evolves, its values equal its modifiers in every state:
    // both definitions therefore generate the same productive action stream.
    modifierPlusTwoSolutions = fullKnowledgeSolutions
    modifierPlusTwoSummary = summarizeSolutions(modifierPlusTwoSolutions)

    const currentAndNextSolver = new CurrentAndNextBestResponseSolver()
    currentAndNextSolutions = permutations.map((sequence, index) => {
      const solution = currentAndNextSolver.solve(sequence)
      if ((index + 1) % 60 === 0) {
        console.log(`current-next progress: ${index + 1}/720`)
      }
      return solution
    })
    currentAndNextSummary = summarizeSolutions(currentAndNextSolutions)

    immediateTieAudit = auditGreedyTieBreaks(
      permutations,
      'immediate-value',
    )
    modifierTieAudit = auditGreedyTieBreaks(
      permutations,
      'modifier-plus-two',
    )

    const tieOrders: Record<string, TraitType[]> = {
      adaptation_strength: [...TRAITS],
      adaptation_grip: tieOrder(
        'ADAPTATION',
        'GRIP_CLAWS',
        'STRENGTH',
        'FAT_RESERVES',
      ),
      fat_strength: tieOrder(
        'FAT_RESERVES',
        'STRENGTH',
        'ADAPTATION',
        'GRIP_CLAWS',
      ),
      fat_grip: [...TRAITS].reverse(),
    }
    const tieBreakSolutions = Object.fromEntries(
      Object.entries(tieOrders).map(([id, order]) => {
        if (id === 'adaptation_strength') {
          return [id, fullKnowledgeSolutions]
        }

        const solver = new ExactBestResponseSolver('immediate-value', order)
        const solutions = permutations.map((sequence, index) => {
          const alternateGreedy = solveCurrentEventMirrorPolicy(
            sequence,
            'immediate-value',
            order,
          )
          return actionSignature(alternateGreedy, 'greedy') ===
            actionSignature(fullKnowledgeSolutions[index], 'greedy')
            ? fullKnowledgeSolutions[index]
            : solver.solve(sequence)
        })
        return [id, solutions]
      }),
    ) as Record<string, SequenceSolution[]>
    const tieBreakResults = Object.fromEntries(
      Object.entries(tieBreakSolutions).map(([id, solutions]) => [
        id,
        {
          order: tieOrders[id],
          summary: summarizeSolutions(solutions),
          groups: summarizeByOverlapGroup(solutions),
          sequencesWithDifferentGreedyPath:
            solutions.filter(
              (solution, index) =>
                actionSignature(solution, 'greedy') !==
                actionSignature(fullKnowledgeSolutions[index], 'greedy'),
            ).length,
        },
      ]),
    )

    const fullGroups = summarizeByOverlapGroup(fullKnowledgeSolutions)
    const limitedGroups = summarizeByOverlapGroup(currentAndNextSolutions)
    const counterexamples = (
      [
        'heat_then_nutrient_consecutive',
        'nutrient_then_heat_consecutive',
        'non_consecutive',
      ] as const
    ).map((group) => {
      const solution = fullKnowledgeSolutions.find(
        (candidate) =>
          candidate.outcome === 'WIN' &&
          overlapGroup(candidate.events) === group,
      )
      if (!solution) {
        throw new Error(`Missing winning counterexample for ${group}.`)
      }
      return solution
    })

    let greedyMetabolismCooldownAtSecondEvent = 0
    let bestResponseExploitsCooldown = 0
    let preservesMetabolismForSecondEvent = 0
    let alternativeValueTotal = 0
    const alternativeActions: Record<string, number> = {}

    for (const solution of fullKnowledgeSolutions) {
      const group = overlapGroup(solution.events)
      if (group === 'non_consecutive') continue

      const heatIndex = solution.events.indexOf('HEAT_SPIKE')
      const nutrientIndex = solution.events.indexOf('NUTRIENT_COLLAPSE')
      const firstIndex = Math.min(heatIndex, nutrientIndex)
      const secondIndex = Math.max(heatIndex, nutrientIndex)
      const firstRound = solution.trace[firstIndex]
      const secondRound = solution.trace[secondIndex]

      if (secondRound.greedyTraitsBefore.METABOLISM.cooldown > 0) {
        greedyMetabolismCooldownAtSecondEvent += 1
        const alternativeKey = `${secondRound.eventId}:${secondRound.greedyAction.trait}`
        alternativeActions[alternativeKey] =
          (alternativeActions[alternativeKey] ?? 0) + 1
        alternativeValueTotal += secondRound.greedyValue
      }
      if (secondRound.optimizerValue > secondRound.greedyValue) {
        bestResponseExploitsCooldown += 1
      }
      if (
        !(
          firstRound.optimizerAction.actionType === 'USE' &&
          firstRound.optimizerAction.trait === 'METABOLISM'
        ) &&
        secondRound.optimizerAction.actionType === 'USE' &&
        secondRound.optimizerAction.trait === 'METABOLISM'
      ) {
        preservesMetabolismForSecondEvent += 1
      }
    }

    const currentNextDiffersFromImmediate = currentAndNextSolutions.reduce(
      (count, solution) =>
        count +
        solution.trace.filter((round) => {
          const immediate = chooseGreedyAction(
            'immediate-value',
            round.eventId,
            round.optimizerTraitsBefore,
          )
          return !sameAction(immediate, round.optimizerAction)
        }).length,
      0,
    )
    const fullKnowledgeImprovesOutcome = fullKnowledgeSolutions.filter(
      (solution, index) =>
        solution.differential > currentAndNextSolutions[index].differential,
    ).length
    const limitedMatchesFullOptimum = fullKnowledgeSolutions.length -
      fullKnowledgeImprovesOutcome
    const evolveWinningSequences = fullKnowledgeSolutions.filter(
      (solution) =>
        solution.outcome === 'WIN' &&
        solution.trace.some(
          (round) => round.optimizerAction.actionType === 'EVOLVE',
        ),
    ).length

    generatedResults = {
      generatedAt: new Date().toISOString(),
      methodology: {
        exact: true,
        monteCarlo: false,
        permutationCount: permutations.length,
        expectedPermutationCount: 720,
        dynamicProgramming: true,
        productiveImports: [
          'src/game/config',
          'src/game/bot',
          'src/game/engine',
          'src/game/round-events',
          'src/game/scoring',
        ],
        rules: getSolverRulesMetadata(),
      },
      answer: {
        greedyBeatable: fullKnowledgeSummary.wins > 0,
      },
      fullKnowledge: {
        summary: fullKnowledgeSummary,
        groups: fullGroups,
        exploredStates: fullKnowledgeSolver.exploredStates,
        relaxedStatesExplored: fullKnowledgeSolver.relaxedStatesExplored,
        relaxedActionsConsidered:
          fullKnowledgeSolver.relaxedActionsConsidered,
        certifiedSequences: fullKnowledgeSolver.certifiedSequences,
        fallbackSequences: fullKnowledgeSolver.fallbackSequences,
        legalActionsConsidered: fullKnowledgeSolver.legalActionsConsidered,
        dominatedActionsPruned: fullKnowledgeSolver.dominatedActionsPruned,
        upperBoundPrunedActions: fullKnowledgeSolver.upperBoundPrunedActions,
        lastSequenceMemoizedStates: fullKnowledgeSolver.memoizedStateCount,
        sequences: fullKnowledgeSolutions,
      },
      modifierPlusTwo: {
        summary: modifierPlusTwoSummary,
        actionEquivalentToImmediateValueAcrossAllDecisions: true,
        exactResultsIdenticalToFullKnowledge: true,
      },
      currentAndNextKnowledge: {
        summary: currentAndNextSummary,
        groups: limitedGroups,
        exploredInformationStates:
          currentAndNextSolver.exploredInformationStates,
        legalActionsConsidered: currentAndNextSolver.legalActionsConsidered,
        dominatedActionsPruned: currentAndNextSolver.dominatedActionsPruned,
        fullKnowledgeImprovesOutcome,
        limitedMatchesFullOptimum,
        sequences: currentAndNextSolutions,
      },
      tieBreaks: {
        immediateValue: immediateTieAudit,
        modifierPlusTwo: modifierTieAudit,
        equivalenceClasses: tieBreakResults,
        outcomeDependence:
          new Set(
            Object.values(tieBreakResults).map((result) =>
              JSON.stringify(result.summary),
            ),
          ).size > 1,
      },
      cooldownAnalysis: {
        consecutiveSequences: 240,
        greedyMetabolismCooldownAtSecondEvent,
        alternativeActions,
        averageAlternativeValue:
          alternativeValueTotal / greedyMetabolismCooldownAtSecondEvent,
        bestResponseExploitsCooldown,
        preservesMetabolismForSecondEvent,
        currentNextActionsDifferentFromImmediate:
          currentNextDiffersFromImmediate,
        fullKnowledgeImprovesOutcome,
        limitedMatchesFullOptimum,
        evolveWinningSequences,
      },
      counterexamples,
    }

    writeFileSync(resultsPath, `${JSON.stringify(generatedResults, null, 2)}\n`)
  }, 600_000)

  it('covers each of the 720 permutations exactly once', () => {
    expect(permutations).toHaveLength(720)
    expect(new Set(permutations.map((sequence) => sequence.join('|'))).size).toBe(
      720,
    )

    const expectedEvents = ROUND_EVENT_DEFINITIONS.map((event) => event.id).sort()
    for (const sequence of permutations) {
      expect(sequence).toHaveLength(6)
      expect([...sequence].sort()).toEqual(expectedEvents)
    }
  })

  it('only generates legal actions and replays every optimal path through resolveRound', () => {
    expect(fullKnowledgeSolver.relaxedActionsConsidered).toBeGreaterThan(0)
    expect(
      fullKnowledgeSolver.certifiedSequences +
        fullKnowledgeSolver.fallbackSequences,
    ).toBeGreaterThanOrEqual(720)

    for (const solution of fullKnowledgeSolutions) {
      replaySolution(solution, 'immediate-value')
    }
    for (const solution of modifierPlusTwoSolutions) {
      replaySolution(solution, 'modifier-plus-two')
    }
    for (const solution of currentAndNextSolutions) {
      replaySolution(solution, 'immediate-value')
    }
  })

  it('updates levels, cooldowns, scores, and round values consistently', () => {
    const initialOptimizer = createInitialTraits()
    const initialGreedy = createInitialTraits()
    const firstGreedyAction = chooseGreedyAction(
      'immediate-value',
      ROUND_EVENT_DEFINITIONS[0].id,
      initialGreedy,
    )
    const evolved = resolveRound({
      roundNumber: 1,
      roundEvent: ROUND_EVENT_DEFINITIONS[0],
      player1Id: 'optimizer',
      player2Id: 'greedy',
      player1Traits: initialOptimizer,
      player2Traits: initialGreedy,
      player1Action: {
        playerId: 'optimizer',
        trait: 'RESISTANCE',
        actionType: 'EVOLVE',
      },
      player2Action: {
        playerId: 'greedy',
        ...firstGreedyAction,
      },
    })
    expect(evolved.player1.roundValue).toBe(0)
    expect(evolved.player1.traits.RESISTANCE).toEqual({
      level: 1,
      cooldown: 0,
    })

    const secondGreedyAction = chooseGreedyAction(
      'immediate-value',
      ROUND_EVENT_DEFINITIONS[1].id,
      evolved.player2.traits,
    )
    const used = resolveRound({
      roundNumber: 2,
      roundEvent: ROUND_EVENT_DEFINITIONS[1],
      player1Id: 'optimizer',
      player2Id: 'greedy',
      player1Traits: evolved.player1.traits,
      player2Traits: evolved.player2.traits,
      player1Action: {
        playerId: 'optimizer',
        trait: 'RESISTANCE',
        actionType: 'USE',
      },
      player2Action: {
        playerId: 'greedy',
        ...secondGreedyAction,
      },
    })
    expect(used.player1.traits.RESISTANCE.cooldown).toBe(1)

    const thirdGreedyAction = chooseGreedyAction(
      'immediate-value',
      ROUND_EVENT_DEFINITIONS[2].id,
      used.player2.traits,
    )
    const ticked = resolveRound({
      roundNumber: 3,
      roundEvent: ROUND_EVENT_DEFINITIONS[2],
      player1Id: 'optimizer',
      player2Id: 'greedy',
      player1Traits: used.player1.traits,
      player2Traits: used.player2.traits,
      player1Action: {
        playerId: 'optimizer',
        trait: 'PERCEPTION',
        actionType: 'EVOLVE',
      },
      player2Action: {
        playerId: 'greedy',
        ...thirdGreedyAction,
      },
    })
    expect(ticked.player1.traits.RESISTANCE.cooldown).toBe(0)
    expect(ticked.player1.traits.PERCEPTION.level).toBe(1)

    for (const solution of fullKnowledgeSolutions) {
      for (let index = 1; index < solution.trace.length; index += 1) {
        expect(solution.trace[index].optimizerTraitsBefore).toEqual(
          solution.trace[index - 1].optimizerTraitsAfter,
        )
        expect(solution.trace[index].greedyTraitsBefore).toEqual(
          solution.trace[index - 1].greedyTraitsAfter,
        )
      }
    }
  })

  it('is deterministic and reconstructs three complete winning counterexamples', () => {
    const sequence = permutations[0]
    const first = fullKnowledgeSolver.solve(sequence)
    const second = fullKnowledgeSolver.solve([...sequence])
    expect(second).toEqual(first)

    const alternatives = generatedResults.counterexamples as SequenceSolution[]
    expect(alternatives).toHaveLength(3)
    expect(alternatives.every((solution) => solution.outcome === 'WIN')).toBe(
      true,
    )
    expect(
      new Set(alternatives.map((solution) => overlapGroup(solution.events))).size,
    ).toBe(3)
    alternatives.forEach((solution) =>
      replaySolution(solution, 'immediate-value'),
    )
  })

  it('does not mutate the productive catalog or shared initial state', () => {
    expect(JSON.stringify(ROUND_EVENT_DEFINITIONS)).toBe(catalogSnapshot)

    const initial = createInitialTraits()
    const initialSnapshot = JSON.stringify(initial)
    fullKnowledgeSolver.solve(permutations[1])
    expect(JSON.stringify(initial)).toBe(initialSnapshot)
    expect(createInitialTraits()).toEqual(initial)

    const edgeSource = readFileSync(
      resolve(
        artifactDirectory,
        '../../supabase/functions/resolve-round/index.ts',
      ),
      'utf8',
    )
    expect(edgeSource).toContain(
      "import { getRoundEventById } from '../../../src/game/round-events.ts'",
    )
  })

  it('executes all requested GREEDY and information variants exactly', () => {
    expect(modifierPlusTwoSolutions).toHaveLength(720)
    expect(fullKnowledgeSolutions).toHaveLength(720)
    expect(currentAndNextSolutions).toHaveLength(720)

    expect(modifierPlusTwoSummary).toEqual(fullKnowledgeSummary)
    expect(currentAndNextSummary.wins).toBeLessThanOrEqual(
      fullKnowledgeSummary.wins,
    )

    expect(immediateTieAudit.decisions).toBe(720 * 6)
    expect(modifierTieAudit.decisions).toBe(720 * 6)
    expect(immediateTieAudit.tiedDecisions).toBeGreaterThan(0)
    expect(modifierTieAudit.tiedDecisions).toBeGreaterThan(0)
    expect(immediateTieAudit.catalogAndReverseChooseSameAction).toBe(false)
    expect(modifierTieAudit.catalogAndReverseChooseSameAction).toBe(false)

    const tieBreaks = generatedResults.tieBreaks as {
      outcomeDependence: boolean
      equivalenceClasses: Record<
        string,
        { summary: ReturnType<typeof summarizeSolutions> }
      >
    }
    expect(Object.keys(tieBreaks.equivalenceClasses)).toHaveLength(4)
    expect(tieBreaks.outcomeDependence).toBe(false)
    Object.values(tieBreaks.equivalenceClasses).forEach((result) => {
      expect(result.summary).toEqual(fullKnowledgeSummary)
    })
  })

  it('writes a complete reproducible result artifact', () => {
    expect(generatedResults).toMatchObject({
      methodology: {
        exact: true,
        monteCarlo: false,
        permutationCount: 720,
      },
    })
    expect(fullKnowledgeSummary.totalSequences).toBe(720)
    expect(currentAndNextSummary.totalSequences).toBe(720)
    expect(modifierPlusTwoSummary.totalSequences).toBe(720)
  })
})
