import { describe, expect, it } from 'vitest'

import { RULE_VERSION, buildPersistedRoundResolution, createInitialAdaptations, createInitialCombatMutationState, getRoundEventById, resolveMatchOutcome, type CombatMutationLoadout, type FineDelMondoActivation } from './index.ts'

const event = getRoundEventById('HEAT_SPIKE')
const fineLoadout: CombatMutationLoadout = ['FINE_DEL_MONDO', 'ADAPTIVE_CORE']
const passiveLoadout: CombatMutationLoadout = ['ELASTIC_LIMBS', 'ADAPTIVE_CORE']
const fine = (ownerPlayerId: string, activatedRound: number, outcome: FineDelMondoActivation['outcome']): FineDelMondoActivation => ({ ownerPlayerId, activatedRound, outcome })

function resolve(overrides: Partial<Parameters<typeof buildPersistedRoundResolution>[0]> = {}) {
    return buildPersistedRoundResolution({
        roundNumber: 3, roundEvent: event, player1Id: 'p1', player2Id: 'p2', player1Score: 0, player2Score: 0,
        player1Traits: createInitialAdaptations(), player2Traits: createInitialAdaptations(), ruleVersion: RULE_VERSION,
        player1CombatMutationLoadout: fineLoadout, player2CombatMutationLoadout: passiveLoadout,
        player1CombatMutationState: createInitialCombatMutationState(), player2CombatMutationState: createInitialCombatMutationState(),
        scheduledRounds: 7, fineDelMondoActivations: [],
        player1Action: { playerId: 'p1', actionType: 'ACTIVATE_MUTATION', mutationId: 'FINE_DEL_MONDO' },
        player2Action: { playerId: 'p2', trait: 'ARMOR', actionType: 'EVOLVE' },
        fineDelMondoActivationOutcomes: [fine('p1', 3, 'FINE_DEL_MONDO')], priorRoundValues: [], startedAt: null,
        ...overrides,
    })
}

describe('FINE_DEL_MONDO', () => {
    it('activates from round 3 as a zero-value action without changing genes', () => {
        const result = resolve()
        expect(result.player_1_value).toBe(0)
        expect(result.resolution_data.player1TraitsAfter).toEqual(createInitialAdaptations())
        expect(result.resolution_data).toMatchObject({ scheduledRoundsBefore: 7, scheduledRoundsAfter: 5, fineDelMondoActivationsAfter: [fine('p1', 3, 'FINE_DEL_MONDO')] })
    })

    it('rejects activation before round 3, when unequipped, and after consumption', () => {
        expect(() => resolve({ roundNumber: 2, fineDelMondoActivationOutcomes: [fine('p1', 2, 'FINE_DEL_MONDO')] })).toThrow('before round 3')
        expect(() => resolve({ player1CombatMutationLoadout: passiveLoadout })).toThrow('not equipped')
        expect(() => resolve({ fineDelMondoActivations: [fine('p1', 3, 'ERA_PROSPERA')] })).toThrow('already been activated')
    })

    it('applies prosperity, simultaneous outcomes, and clamps dynamically', () => {
        expect(resolve({ fineDelMondoActivationOutcomes: [fine('p1', 3, 'ERA_PROSPERA')] }).resolution_data.scheduledRoundsAfter).toBe(10)
        const simultaneous = resolve({
            player2CombatMutationLoadout: fineLoadout,
            player2Action: { playerId: 'p2', actionType: 'ACTIVATE_MUTATION', mutationId: 'FINE_DEL_MONDO' },
            fineDelMondoActivationOutcomes: [fine('p1', 3, 'FINE_DEL_MONDO'), fine('p2', 3, 'ERA_PROSPERA')],
        })
        expect(simultaneous.resolution_data.scheduledRoundsAfter).toBe(8)
        expect(simultaneous.resolution_data.fineDelMondoActivationsAfter).toHaveLength(2)
        expect(resolve({ scheduledRounds: 5, roundNumber: 3, fineDelMondoActivationOutcomes: [fine('p1', 3, 'FINE_DEL_MONDO')] }).resolution_data.scheduledRoundsAfter).toBe(5)
        expect(resolve({ scheduledRounds: 10, roundNumber: 3, fineDelMondoActivationOutcomes: [fine('p1', 3, 'ERA_PROSPERA')] }).resolution_data.scheduledRoundsAfter).toBe(10)
    })

    it('uses dynamic clinch and resolves tiebreaks at the scheduled deadline', () => {
        expect(resolveMatchOutcome({ player1Id: 'p1', player2Id: 'p2', player1Score: 4, player2Score: 0, resolvedRoundNumber: 4, scheduledRounds: 10, storedRoundValues: [] }).finished).toBe(false)
        expect(resolveMatchOutcome({ player1Id: 'p1', player2Id: 'p2', player1Score: 3, player2Score: 0, resolvedRoundNumber: 3, scheduledRounds: 5, storedRoundValues: [] })).toMatchObject({ finished: true, reason: 'CLINCH', winnerId: 'p1' })
        expect(resolveMatchOutcome({ player1Id: 'p1', player2Id: 'p2', player1Score: 3, player2Score: 2, resolvedRoundNumber: 5, scheduledRounds: 5, storedRoundValues: [] })).toMatchObject({ finished: true, reason: 'SCORE', winnerId: 'p1' })
        expect(resolveMatchOutcome({ player1Id: 'p1', player2Id: 'p2', player1Score: 2, player2Score: 2, resolvedRoundNumber: 5, scheduledRounds: 5, storedRoundValues: [{ player1Value: 1, player2Value: 0 }] })).toMatchObject({ finished: true, reason: 'ROUND_VALUE_TIEBREAK', winnerId: 'p1' })
    })

    it('rejects a duration change that would put the scheduled deadline in the past', () => {
        expect(() => resolve({ scheduledRounds: 7, roundNumber: 6, fineDelMondoActivationOutcomes: [fine('p1', 6, 'FINE_DEL_MONDO')] })).toThrow('cannot move the deadline')
    })
})
