import { describe, expect, it } from 'vitest'

import {
    ADAPTATION_IDS,
    buildPersistedRoundResolution,
    createInitialAdaptations,
    resolveMatchOutcome,
    resolveRound,
    type AdaptationCollection,
    type AdaptationId,
    type AdaptationLevel,
    type EnvironmentalCrisisDefinition,
    type PlayerRoundAction,
    type ResolveRoundInput,
    type StoredRoundValue,
} from './index.ts'

function eventWith(modifiers: Partial<Record<AdaptationId, 0 | 1 | 2>> = {}): EnvironmentalCrisisDefinition {
    const valueFor = (trait: AdaptationId): 0 | 1 | 2 => modifiers[trait] ?? 0
    return {
        id: 'TRANSITION_AUDIT',
        title: 'Transition audit',
        shortDescription: 'Deterministic transition oracle.',
        category: 'ECOLOGICAL',
        artKey: 'audit',
        tags: [],
        modifiers: {
            FEROCITY: valueFor('FEROCITY'),
            ARMOR: valueFor('ARMOR'),
            AGILITY: valueFor('AGILITY'),
            SENSES: valueFor('SENSES'),
            CAMOUFLAGE: valueFor('CAMOUFLAGE'),
        },
        effects: ADAPTATION_IDS.map((trait) => ({
            trait,
            modifier: valueFor(trait),
            reason: 'Transition audit.',
        })),
    }
}

const action = (playerId: string, trait: AdaptationId, actionType: 'USE' | 'EVOLVE'): PlayerRoundAction => ({ playerId, trait, actionType })

function resolve(overrides: Partial<ResolveRoundInput> = {}) {
    return resolveRound({
        roundNumber: 1,
        roundEvent: eventWith(),
        player1Id: 'p1',
        player2Id: 'p2',
        player1Traits: createInitialAdaptations(),
        player2Traits: createInitialAdaptations(),
        player1Action: action('p1', 'FEROCITY', 'USE'),
        player2Action: action('p2', 'AGILITY', 'EVOLVE'),
        ...overrides,
    })
}

function withState(trait: AdaptationId, level: AdaptationLevel, exhausted: boolean): AdaptationCollection {
    const adaptations = createInitialAdaptations()
    adaptations[trait] = { level, exhausted }
    return adaptations
}

describe('adaptation transition matrix', () => {
    it.each([0, 1, 2] as const)('USE preserves level %s, exhausts only the selected gene, and never mutates its input', (level) => {
        const input = withState('FEROCITY', level, false)
        const before = structuredClone(input)
        const result = resolve({ player1Traits: input })

        expect(input).toEqual(before)
        expect(result.player1.traits.FEROCITY).toEqual({ level, exhausted: true })
        for (const trait of ADAPTATION_IDS.filter((candidate) => candidate !== 'FEROCITY')) {
            expect(result.player1.traits[trait]).toEqual(before[trait])
        }
    })

    it('rejects exhausted USE without mutating either input or exposing a partial resolution', () => {
        const player1Traits = withState('FEROCITY', 1, true)
        const player2Traits = createInitialAdaptations()
        const player1Before = structuredClone(player1Traits)
        const player2Before = structuredClone(player2Traits)

        expect(() => resolve({ player1Traits, player2Traits })).toThrow('exhausted')
        expect(player1Traits).toEqual(player1Before)
        expect(player2Traits).toEqual(player2Before)
    })

    it('does not recover unrelated exhausted genes automatically', () => {
        const input = withState('ARMOR', 1, true)
        const result = resolve({ player1Traits: input })

        expect(result.player1.traits.ARMOR).toEqual({ level: 1, exhausted: true })
    })

    it.each(
        ([0, 1] as const).flatMap((level) => [false, true].map((exhausted) => ({ level, exhausted }))),
    )('EVOLVE increments and makes available from level $level/exhausted=$exhausted', ({ level, exhausted }) => {
        const input = withState('FEROCITY', level, exhausted)
        const before = structuredClone(input)
        const result = resolve({
            player1Traits: input,
            player1Action: action('p1', 'FEROCITY', 'EVOLVE'),
        })

        expect(input).toEqual(before)
        expect(result.player1.roundValue).toBe(1)
        expect(result.player1.breakdown).toMatchObject({
            total: 1,
            baseContribution: 1,
            levelContribution: 0,
            eventModifier: 0,
            matchupBonus: 0,
        })
        expect(result.player1.traits.FEROCITY).toEqual({ level: level + 1, exhausted: false })
    })

    it('EVOLVE recovers an exhausted max-level gene without increasing its level', () => {
        const result = resolve({
            player1Traits: withState('FEROCITY', 2, true),
            player1Action: action('p1', 'FEROCITY', 'EVOLVE'),
        })

        expect(result.player1.roundValue).toBe(1)
        expect(result.player1.traits.FEROCITY).toEqual({ level: 2, exhausted: false })
    })

    it('rejects EVOLVE on an available max-level gene without mutation', () => {
        const input = withState('FEROCITY', 2, false)
        const before = structuredClone(input)

        expect(() => resolve({
            player1Traits: input,
            player1Action: action('p1', 'FEROCITY', 'EVOLVE'),
        })).toThrow('no transition')
        expect(input).toEqual(before)
    })

    it.each(
        ([1, 7] as const).flatMap((roundNumber) =>
            ([0, 1, 2] as const).flatMap((affinity) =>
                ([0, 1, 2] as const).map((level) => ({ roundNumber, affinity, level })),
            ),
        ),
    )('keeps EVOLVE at one for round $roundNumber, affinity $affinity, and level $level', ({ roundNumber, affinity, level }) => {
        const result = resolve({
            roundNumber,
            roundEvent: eventWith({ FEROCITY: affinity }),
            player1Traits: withState('FEROCITY', level, level === 2),
            player1Action: action('p1', 'FEROCITY', 'EVOLVE'),
            player2Action: action('p2', 'ARMOR', roundNumber === 1 ? 'USE' : 'EVOLVE'),
        })

        expect(result.player1.roundValue).toBe(1)
        expect(result.player1.breakdown.total).toBe(
            result.player1.breakdown.baseContribution
            + result.player1.breakdown.eventModifier
            + result.player1.breakdown.levelContribution
            + result.player1.breakdown.matchupBonus,
        )
    })
})

describe('round resolution matrix', () => {
    it.each([
        {
            name: 'USE/USE',
            player1Action: action('p1', 'FEROCITY', 'USE'),
            player2Action: action('p2', 'ARMOR', 'USE'),
            expected: [4, 2, 'p1', 1, 0],
        },
        {
            name: 'USE/EVOLVE',
            player1Action: action('p1', 'FEROCITY', 'USE'),
            player2Action: action('p2', 'ARMOR', 'EVOLVE'),
            expected: [2, 1, 'p1', 1, 0],
        },
        {
            name: 'EVOLVE/USE',
            player1Action: action('p1', 'FEROCITY', 'EVOLVE'),
            player2Action: action('p2', 'ARMOR', 'USE'),
            expected: [1, 2, 'p2', 0, 1],
        },
        {
            name: 'EVOLVE/EVOLVE',
            player1Action: action('p1', 'FEROCITY', 'EVOLVE'),
            player2Action: action('p2', 'ARMOR', 'EVOLVE'),
            expected: [1, 1, null, 0, 0],
        },
    ])('resolves $name with coherent winner and score deltas', ({ player1Action, player2Action, expected }) => {
        const result = resolve({ player1Action, player2Action })

        expect([
            result.player1.roundValue,
            result.player2.roundValue,
            result.winnerId,
            result.player1ScoreDelta,
            result.player2ScoreDelta,
        ]).toEqual(expected)
        expect(result.awardedPoints).toBe(result.winnerId ? 1 : 0)
    })

    it('ties equal totals produced by different USE contributions', () => {
        const result = resolve({
            roundEvent: eventWith({ AGILITY: 1 }),
            player1Traits: withState('FEROCITY', 1, false),
            player1Action: action('p1', 'FEROCITY', 'USE'),
            player2Action: action('p2', 'AGILITY', 'USE'),
        })

        expect(result.player1.breakdown).toMatchObject({ levelContribution: 1, eventModifier: 0, total: 3 })
        expect(result.player2.breakdown).toMatchObject({ levelContribution: 0, eventModifier: 1, total: 3 })
        expect([result.winnerId, result.awardedPoints, result.player1ScoreDelta, result.player2ScoreDelta]).toEqual([null, 0, 0, 0])
    })

    it.each([
        { name: 'overturns the environmental leader', armorAffinity: 1 as const, armorLevel: 0 as const, expected: [4, 3, 'p1'] },
        { name: 'creates a tie', armorAffinity: 2 as const, armorLevel: 0 as const, expected: [4, 4, null] },
        { name: 'does not change the environmental leader', armorAffinity: 2 as const, armorLevel: 1 as const, expected: [4, 5, 'p2'] },
    ])('$name through the natural matchup exactly once', ({ armorAffinity, armorLevel, expected }) => {
        const result = resolve({
            roundEvent: eventWith({ ARMOR: armorAffinity }),
            player2Traits: withState('ARMOR', armorLevel, false),
            player2Action: action('p2', 'ARMOR', 'USE'),
        })

        expect([result.player1.roundValue, result.player2.roundValue, result.winnerId]).toEqual(expected)
        expect(result.player1.breakdown.matchupBonus).toBe(2)
        expect(result.player2.breakdown.matchupBonus).toBe(0)
    })

    it('is symmetric when player positions and actions are inverted', () => {
        const forward = resolve({
            player1Action: action('p1', 'FEROCITY', 'USE'),
            player2Action: action('p2', 'ARMOR', 'USE'),
        })
        const inverted = resolve({
            player1Action: action('p1', 'ARMOR', 'USE'),
            player2Action: action('p2', 'FEROCITY', 'USE'),
        })

        expect([forward.player1.roundValue, forward.player2.roundValue, forward.winnerId]).toEqual([4, 2, 'p1'])
        expect([inverted.player1.roundValue, inverted.player2.roundValue, inverted.winnerId]).toEqual([2, 4, 'p2'])
    })

    it.each([1, 2, 3, 4, 5, 6, 7])('awards exactly one point for a winner in round %s', (roundNumber) => {
        const result = resolve({ roundNumber })
        expect([result.awardedPoints, result.player1ScoreDelta, result.player2ScoreDelta]).toEqual([1, 1, 0])
    })
})

describe('match completion matrix', () => {
    it.each([
        [4, 0],
        [4, 1],
        [4, 2],
    ])('clinches immediately at %s-%s', (player1Score, player2Score) => {
        expect(resolveMatchOutcome({
            player1Id: 'p1',
            player2Id: 'p2',
            player1Score,
            player2Score,
            resolvedRoundNumber: player1Score + player2Score,
            storedRoundValues: [],
        })).toMatchObject({ finished: true, winnerId: 'p1', reason: 'CLINCH' })
    })

    it('persists a newly clinched match with coherent terminal metadata', () => {
        const result = buildPersistedRoundResolution({
            roundNumber: 6,
            roundEvent: eventWith(),
            player1Id: 'p1',
            player2Id: 'p2',
            player1Score: 3,
            player2Score: 2,
            player1Traits: createInitialAdaptations(),
            player2Traits: createInitialAdaptations(),
            player1Action: action('p1', 'FEROCITY', 'USE'),
            player2Action: action('p2', 'ARMOR', 'EVOLVE'),
            priorRoundValues: [
                { player1Value: 2, player2Value: 3 },
                { player1Value: 4, player2Value: 1 },
            ],
            startedAt: '2026-07-30T10:00:00.000Z',
            now: () => '2026-07-30T10:00:05.000Z',
        })

        expect(result.resolution_data).toMatchObject({
            statusAfter: 'FINISHED',
            winnerIdAfter: 'p1',
            matchEndReason: 'CLINCH',
            finishedAt: '2026-07-30T10:00:05.000Z',
            durationMs: 5000,
            player1ScoreAfter: 4,
            player2ScoreAfter: 2,
            player1RoundValueTotal: 8,
            player2RoundValueTotal: 5,
        })
    })

    it('keeps non-terminal persistence metadata coherent', () => {
        const result = buildPersistedRoundResolution({
            roundNumber: 1,
            roundEvent: eventWith(),
            player1Id: 'p1',
            player2Id: 'p2',
            player1Score: 0,
            player2Score: 0,
            player1Traits: createInitialAdaptations(),
            player2Traits: createInitialAdaptations(),
            player1Action: action('p1', 'FEROCITY', 'EVOLVE'),
            player2Action: action('p2', 'ARMOR', 'EVOLVE'),
            startedAt: '2026-07-30T10:00:00.000Z',
        })

        expect(result.resolution_data).toMatchObject({
            statusAfter: 'REVEALING',
            winnerIdAfter: null,
            matchEndReason: null,
            finishedAt: null,
            durationMs: null,
        })
    })

    it('includes the seventh round exactly once in a stored-value tiebreak', () => {
        const result = buildPersistedRoundResolution({
            roundNumber: 7,
            roundEvent: eventWith(),
            player1Id: 'p1',
            player2Id: 'p2',
            player1Score: 3,
            player2Score: 3,
            player1Traits: createInitialAdaptations(),
            player2Traits: createInitialAdaptations(),
            player1Action: action('p1', 'FEROCITY', 'EVOLVE'),
            player2Action: action('p2', 'ARMOR', 'EVOLVE'),
            priorRoundValues: [
                { player1Value: 4, player2Value: 3 },
                { player1Value: 6, player2Value: 6 },
            ],
            startedAt: null,
            now: () => '2026-07-30T10:00:05.000Z',
        })

        expect(result.resolution_data).toMatchObject({
            statusAfter: 'FINISHED',
            winnerIdAfter: 'p1',
            matchEndReason: 'ROUND_VALUE_TIEBREAK',
            player1RoundValueTotal: 11,
            player2RoundValueTotal: 10,
        })
    })

    it('makes stored-value ordering irrelevant and draws when both totals tie', () => {
        const values: StoredRoundValue[] = [
            { player1Value: 5, player2Value: 2 },
            { player1Value: 1, player2Value: 4 },
        ]
        const first = resolveMatchOutcome({
            player1Id: 'p1',
            player2Id: 'p2',
            player1Score: 3,
            player2Score: 3,
            resolvedRoundNumber: 7,
            storedRoundValues: values,
        })
        const reversed = resolveMatchOutcome({
            player1Id: 'p1',
            player2Id: 'p2',
            player1Score: 3,
            player2Score: 3,
            resolvedRoundNumber: 7,
            storedRoundValues: [...values].reverse(),
        })

        expect(first).toEqual(reversed)
        expect(first).toMatchObject({ finished: true, winnerId: null, reason: 'DRAW' })
    })

    it('rejects stored values with a missing field', () => {
        const incomplete: StoredRoundValue = { player1Value: 2, player2Value: 1 }
        Reflect.deleteProperty(incomplete, 'player1Value')

        expect(() => resolveMatchOutcome({
            player1Id: 'p1',
            player2Id: 'p2',
            player1Score: 3,
            player2Score: 3,
            resolvedRoundNumber: 7,
            storedRoundValues: [incomplete],
        })).toThrow('stored round value')
    })
})
