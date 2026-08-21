import { describe, expect, it } from 'vitest'
import { ADAPTATION_IDS, BASE_USE_VALUE, BOT_COMBAT_MUTATION_LOADOUT, EVOLVE_ROUND_VALUE, LEVEL_BONUS, ROUND_EVENT_DEFINITIONS, RULE_VERSION, TOTAL_ROUNDS, buildPersistedRoundResolution, createInitialAdaptations, createInitialCombatMutationState, getNaturalAdvantageBonus, getRoundEventById, getValidatedActionBreakdown, normalizeAdaptationCollection, resolveMatchOutcome, resolveRound } from './index.ts'
import { getValidatedTraitUseBreakdown } from '../../src/game/scoring.ts'

const crisis = getRoundEventById('HEAT_SPIKE')
const action = (playerId: string, trait: (typeof ADAPTATION_IDS)[number], actionType: 'USE' | 'EVOLVE') => ({ playerId, trait, actionType })
const round = (overrides: Partial<Parameters<typeof resolveRound>[0]> = {}) => resolveRound({ roundNumber: 1, roundEvent: crisis, player1Id: 'p1', player2Id: 'p2', player1Traits: createInitialAdaptations(), player2Traits: createInitialAdaptations(), ruleVersion: RULE_VERSION, player1CombatMutationState: createInitialCombatMutationState(), player2CombatMutationState: createInitialCombatMutationState(), player1CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT, player2CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT, player1Action: action('p1', 'FEROCITY', 'USE'), player2Action: action('p2', 'ARMOR', 'USE'), ...overrides })

describe('exhaustion best-of-seven rules', () => {
    it('starts every adaptation available at level zero and normalizes JSONB safely', () => {
        const initial = createInitialAdaptations()
        expect(Object.values(initial)).toEqual(Array.from({ length: 5 }, () => ({ level: 0, exhausted: false })))
        expect(normalizeAdaptationCollection({ FEROCITY: { level: 99, exhausted: true }, ARMOR: { level: -3, exhausted: false } })).toMatchObject({ FEROCITY: { level: 2, exhausted: true }, ARMOR: { level: 0, exhausted: false } })
        expect(normalizeAdaptationCollection(JSON.parse(JSON.stringify({ FEROCITY: { level: 1, exhausted: true } })))).toMatchObject({ FEROCITY: { level: 1, exhausted: true } })
    })
    it('USE uses the linear formula and exhausts only the selected adaptation', () => {
        const result = round({ player2Action: action('p2', 'AGILITY', 'EVOLVE') })
        expect(result.player1.breakdown).toMatchObject({ total: 2, baseContribution: BASE_USE_VALUE, levelContribution: 0, eventModifier: 0, matchupBonus: 0 })
        expect(result.player1.traits.FEROCITY).toEqual({ level: 0, exhausted: true })
        expect(result.player1.traits.ARMOR).toEqual({ level: 0, exhausted: false })
        expect(LEVEL_BONUS).toEqual([0, 1, 2])
    })
    it('rejects USE on an exhausted adaptation and never recovers it automatically', () => {
        const adaptations = createInitialAdaptations(); adaptations.FEROCITY.exhausted = true
        const otherRound = round({ player1Traits: adaptations, player1Action: action('p1', 'ARMOR', 'USE'), player2Action: action('p2', 'AGILITY', 'EVOLVE') })
        expect(otherRound.player1.traits.FEROCITY.exhausted).toBe(true)
        expect(() => round({ player1Traits: adaptations })).toThrow('exhausted')
    })
    it('EVOLVE always yields one, increments below max and recovers available or exhausted adaptations', () => {
        expect(EVOLVE_ROUND_VALUE).toBe(1)
        for (const exhausted of [false, true]) {
            const adaptations = createInitialAdaptations(); adaptations.FEROCITY.exhausted = exhausted
            const result = round({ player1Traits: adaptations, player1Action: action('p1', 'FEROCITY', 'EVOLVE'), player2Action: action('p2', 'ARMOR', 'EVOLVE') })
            expect(result.player1.roundValue).toBe(1); expect(result.player1.traits.FEROCITY).toEqual({ level: 1, exhausted: false })
        }
    })
    it('EVOLVE recovers an exhausted max-level adaptation and rejects a no-op', () => {
        const exhausted = createInitialAdaptations(); exhausted.FEROCITY.level = 2; exhausted.FEROCITY.exhausted = true
        expect(round({ player1Traits: exhausted, player1Action: action('p1', 'FEROCITY', 'EVOLVE'), player2Action: action('p2', 'ARMOR', 'EVOLVE') }).player1.traits.FEROCITY).toEqual({ level: 2, exhausted: false })
        exhausted.FEROCITY.exhausted = false
        expect(() => round({ player1Traits: exhausted, player1Action: action('p1', 'FEROCITY', 'EVOLVE') })).toThrow('no transition')
    })
    it('applies +2 natural advantage only to the correct double-USE side', () => {
        expect(getNaturalAdvantageBonus(action('p1', 'FEROCITY', 'USE'), action('p2', 'ARMOR', 'USE'))).toBe(2)
        expect(getNaturalAdvantageBonus(action('p1', 'ARMOR', 'USE'), action('p2', 'FEROCITY', 'USE'))).toBe(0)
        expect(getNaturalAdvantageBonus(action('p1', 'FEROCITY', 'USE'), action('p2', 'AGILITY', 'USE'))).toBe(0)
        expect(getNaturalAdvantageBonus(action('p1', 'FEROCITY', 'USE'), action('p2', 'ARMOR', 'EVOLVE'))).toBe(0)
        const result = round(); expect(result.player1.breakdown.matchupBonus).toBe(2); expect(result.player2.breakdown.matchupBonus).toBe(0)
    })
    it('keeps matchup and event out of EVOLVE and ties double EVOLVE at 1-1', () => {
        const breakdown = getValidatedActionBreakdown(crisis, createInitialAdaptations(), 'FEROCITY', 'EVOLVE', 2)
        expect(breakdown).toMatchObject({ total: 1, baseContribution: 1, levelContribution: 0, eventModifier: 0, matchupBonus: 0 })
        const both = round({ player1Action: action('p1', 'FEROCITY', 'EVOLVE'), player2Action: action('p2', 'ARMOR', 'EVOLVE') })
        expect([both.player1.roundValue, both.player2.roundValue, both.winnerId]).toEqual([1, 1, null])
    })
    it('keeps the frontend environmental preview equal to the real breakdown before hidden matchup', () => {
        const adaptations = createInitialAdaptations(); adaptations.FEROCITY.level = 1
        const preview = getValidatedTraitUseBreakdown(crisis, adaptations, 'FEROCITY')
        const resolved = round({ player1Traits: adaptations, player1Action: action('p1', 'FEROCITY', 'USE'), player2Action: action('p2', 'ARMOR', 'USE') })
        expect(preview.total).toBe(resolved.player1.roundValue - resolved.player1.breakdown.matchupBonus)
        expect(preview.matchupBonus).toBe(0)
    })
    it('is idempotent at the resolution boundary and preserves exhausted state in persisted mapping', () => {
        expect(() => round({ alreadyResolved: true })).toThrow('already been resolved')
        const params = { roundNumber: 1, roundEvent: crisis, player1Id: 'p1', player2Id: 'p2', player1Score: 0, player2Score: 0, player1Traits: createInitialAdaptations(), player2Traits: createInitialAdaptations(), ruleVersion: RULE_VERSION, player1CombatMutationState: createInitialCombatMutationState(), player2CombatMutationState: createInitialCombatMutationState(), player1CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT, player2CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT, player1Action: action('p1', 'FEROCITY', 'USE'), player2Action: action('p2', 'ARMOR', 'EVOLVE'), priorRoundValues: [], startedAt: null, now: () => '2026-07-30T00:00:00.000Z' }
        const first = buildPersistedRoundResolution(params); const replay = buildPersistedRoundResolution(params)
        expect(replay).toEqual(first); expect(first.resolution_data.player1TraitsAfter.FEROCITY.exhausted).toBe(true)
    })
    it('limits every event affinity to 0, 1 or 2', () => { for (const event of ROUND_EVENT_DEFINITIONS) for (const modifier of Object.values(event.modifiers)) expect([0, 1, 2]).toContain(modifier) })
    it('ends immediately at four wins and preserves round-seven stored-value tiebreaks', () => {
        const result = buildPersistedRoundResolution({ roundNumber: 4, roundEvent: crisis, player1Id: 'p1', player2Id: 'p2', player1Score: 3, player2Score: 0, player1Traits: createInitialAdaptations(), player2Traits: createInitialAdaptations(), ruleVersion: RULE_VERSION, player1CombatMutationState: createInitialCombatMutationState(), player2CombatMutationState: createInitialCombatMutationState(), player1CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT, player2CombatMutationLoadout: BOT_COMBAT_MUTATION_LOADOUT, player1Action: action('p1', 'SENSES', 'USE'), player2Action: action('p2', 'FEROCITY', 'EVOLVE'), priorRoundValues: [], startedAt: null })
        expect(result.resolution_data).toMatchObject({ statusAfter: 'FINISHED', winnerIdAfter: 'p1', matchEndReason: 'CLINCH' })
        expect(TOTAL_ROUNDS).toBe(7)
        expect(resolveMatchOutcome({ player1Id: 'p1', player2Id: 'p2', player1Score: 3, player2Score: 3, resolvedRoundNumber: 7, storedRoundValues: [{ player1Value: 2, player2Value: 1 }] })).toMatchObject({ finished: true, winnerId: 'p1', reason: 'ROUND_VALUE_TIEBREAK' })
    })
})
