import { describe, expect, it } from 'vitest'

import {
    ADAPTATION_IDS,
    BOT_COMBAT_MUTATION_LOADOUT,
    RULE_VERSION,
    NATURAL_ADVANTAGE,
    buildPersistedRoundResolution,
    createInitialAdaptations,
    createInitialCombatMutationState,
    getNaturalAdvantageBonus,
    getValidatedAdaptationUseBreakdown,
    resolveMatchOutcome,
    resolveRound,
    type AdaptationId,
    type EnvironmentalCrisisDefinition,
} from './index.ts'

function auditEvent(affinityByGene: Partial<Record<AdaptationId, 0 | 1 | 2>> = {}): EnvironmentalCrisisDefinition {
    const modifiers = Object.fromEntries(ADAPTATION_IDS.map((gene) => [gene, affinityByGene[gene] ?? 0])) as Record<
        AdaptationId,
        0 | 1 | 2
    >
    return {
        id: 'FORMULA_AUDIT',
        title: 'Formula audit',
        shortDescription: 'Deterministic formula oracle.',
        category: 'ECOLOGICAL',
        artKey: 'audit',
        tags: [],
        modifiers,
        effects: ADAPTATION_IDS.map((trait) => ({ trait, modifier: modifiers[trait], reason: 'Formula audit.' })),
    }
}

const action = (playerId: string, trait: AdaptationId, actionType: 'USE' | 'EVOLVE') => ({
    playerId,
    trait,
    actionType,
})

describe('exhaustion formula audit', () => {
    it.each(
        ([0, 1, 2] as const).flatMap((level) =>
            ([0, 1, 2] as const).flatMap((affinity) =>
                ([0, 2] as const).map((matchup) => ({ level, affinity, matchup })),
            ),
        ),
    )('computes USE=2+level+affinity+matchup for $level/$affinity/$matchup', ({ level, affinity, matchup }) => {
        const adaptations = createInitialAdaptations()
        adaptations.FEROCITY.level = level
        const breakdown = getValidatedAdaptationUseBreakdown(
            auditEvent({ FEROCITY: affinity }),
            adaptations,
            'FEROCITY',
            matchup,
        )

        expect(breakdown.total).toBe(2 + level + affinity + matchup)
        expect(breakdown.total).toBe(
            breakdown.baseContribution + breakdown.levelContribution + breakdown.eventModifier + breakdown.matchupBonus,
        )
    })

    it.each(ADAPTATION_IDS.flatMap((own) => ADAPTATION_IDS.map((opponent) => ({ own, opponent }))))(
        'applies the complete natural-advantage matrix for $own vs $opponent',
        ({ own, opponent }) => {
            const ownBonus = getNaturalAdvantageBonus(action('p1', own, 'USE'), action('p2', opponent, 'USE'))
            const opponentBonus = getNaturalAdvantageBonus(action('p2', opponent, 'USE'), action('p1', own, 'USE'))

            expect(ownBonus).toBe(NATURAL_ADVANTAGE[own] === opponent ? 2 : 0)
            expect(opponentBonus).toBe(NATURAL_ADVANTAGE[opponent] === own ? 2 : 0)
            expect(Boolean(ownBonus && opponentBonus)).toBe(false)
            if (own === opponent) expect([ownBonus, opponentBonus]).toEqual([0, 0])
        },
    )

    it('reports zero awarded points when a round is tied', () => {
        const result = resolveRound({
            roundNumber: 1,
            roundEvent: auditEvent(),
            player1Id: 'p1',
            player2Id: 'p2',
            player1Traits: createInitialAdaptations(),
            player2Traits: createInitialAdaptations(),
            ruleVersion: RULE_VERSION,
            player1CombatMutationState: createInitialCombatMutationState(),
            player2CombatMutationState: createInitialCombatMutationState(),
            player1CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT,
            player2CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT,
            player1Action: action('p1', 'FEROCITY', 'EVOLVE'),
            player2Action: action('p2', 'ARMOR', 'EVOLVE'),
        })

        expect(result.winnerId).toBeNull()
        expect(result.awardedPoints).toBe(0)
        expect([result.player1ScoreDelta, result.player2ScoreDelta]).toEqual([0, 0])
    })

    it('rejects a persisted round after the match was already clinched', () => {
        expect(() =>
            buildPersistedRoundResolution({
                roundNumber: 5,
                roundEvent: auditEvent(),
                player1Id: 'p1',
                player2Id: 'p2',
                player1Score: 4,
                player2Score: 0,
                player1Traits: createInitialAdaptations(),
                player2Traits: createInitialAdaptations(),
                ruleVersion: RULE_VERSION,
                player1CombatMutationState: createInitialCombatMutationState(),
                player2CombatMutationState: createInitialCombatMutationState(),
                player1CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT,
                player2CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT,
                player1Action: action('p1', 'FEROCITY', 'USE'),
                player2Action: action('p2', 'ARMOR', 'EVOLVE'),
                priorRoundValues: [],
                startedAt: null,
            }),
        ).toThrow('already clinched')
    })

    it('rejects malformed stored round values instead of choosing a tiebreak winner', () => {
        expect(() =>
            resolveMatchOutcome({
                player1Id: 'p1',
                player2Id: 'p2',
                player1Score: 3,
                player2Score: 3,
                resolvedRoundNumber: 7,
                storedRoundValues: [{ player1Value: Number.NaN, player2Value: Number.NaN }],
            }),
        ).toThrow('stored round value')
    })

    it('rejects malformed scores and resolved round numbers instead of finishing spuriously', () => {
        expect(() =>
            resolveMatchOutcome({
                player1Id: 'p1',
                player2Id: 'p2',
                player1Score: Number.NaN,
                player2Score: 3,
                resolvedRoundNumber: 7,
                storedRoundValues: [],
            }),
        ).toThrow('match state')
        expect(() =>
            resolveMatchOutcome({
                player1Id: 'p1',
                player2Id: 'p2',
                player1Score: 3,
                player2Score: 3,
                resolvedRoundNumber: Number.NaN,
                storedRoundValues: [],
            }),
        ).toThrow('match state')
    })
})
