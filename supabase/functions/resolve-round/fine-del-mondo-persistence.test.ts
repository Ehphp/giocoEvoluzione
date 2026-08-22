import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { RULE_VERSION, buildPersistedRoundResolution, createInitialAdaptations, createInitialCombatMutationState, getRoundEventById, type CombatMutationLoadout } from '../../../shared/game-rules/index.ts'

const migration = readFileSync(resolve('supabase/migrations/202608220001_combat_mutations_fine_del_mondo.sql'), 'utf8')
const fineLoadout: CombatMutationLoadout = ['FINE_DEL_MONDO', 'ADAPTIVE_CORE']
const passiveLoadout: CombatMutationLoadout = ['ELASTIC_LIMBS', 'ADAPTIVE_CORE']

describe('FINE_DEL_MONDO persistence contract', () => {
    it('persists the canonical duration and resolved activation record in the same round result', () => {
        const result = buildPersistedRoundResolution({
            roundNumber: 3, roundEvent: getRoundEventById('HEAT_SPIKE'), player1Id: 'p1', player2Id: 'p2', player1Score: 0, player2Score: 0,
            player1Traits: createInitialAdaptations(), player2Traits: createInitialAdaptations(), ruleVersion: RULE_VERSION,
            player1CombatMutationLoadout: fineLoadout, player2CombatMutationLoadout: passiveLoadout,
            player1CombatMutationState: createInitialCombatMutationState(), player2CombatMutationState: createInitialCombatMutationState(),
            scheduledRounds: 7, fineDelMondoActivations: [],
            player1Action: { playerId: 'p1', actionType: 'ACTIVATE_MUTATION', mutationId: 'FINE_DEL_MONDO' },
            player2Action: { playerId: 'p2', trait: 'SENSES', actionType: 'USE' },
            fineDelMondoActivationOutcomes: [{ ownerPlayerId: 'p1', activatedRound: 3, outcome: 'ERA_PROSPERA' }], priorRoundValues: [], startedAt: null,
        })
        expect(result.resolution_data).toMatchObject({
            scheduledRoundsBefore: 7,
            scheduledRoundsAfter: 10,
            fineDelMondoActivationsAfter: [{ ownerPlayerId: 'p1', activatedRound: 3, outcome: 'ERA_PROSPERA' }],
        })
    })

    it('keeps duration, consumption, action payload, and commit atomic in database ownership', () => {
        expect(migration).toContain('scheduled_rounds integer not null default 7')
        expect(migration).toContain('fine_del_mondo_activations jsonb not null default')
        expect(migration).toContain("mutation_id = 'FINE_DEL_MONDO' and trait is null and target_trait is null")
        expect(migration).toContain('FINE_DEL_MONDO_NOT_EQUIPPED')
        expect(migration).toContain('FINE_DEL_MONDO_ALREADY_CONSUMED')
        expect(migration).toContain('FINE_DEL_MONDO_TOO_LATE')
        expect(migration).toContain('p_scheduled_rounds integer')
        expect(migration).toContain('p_fine_del_mondo_activations jsonb')
        expect(migration).toContain('scheduled_rounds=p_scheduled_rounds,fine_del_mondo_activations=p_fine_del_mondo_activations')
        expect(migration).toContain('generate_series(1, 10)')
    })
})
