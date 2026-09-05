import { describe, expect, it } from 'vitest'

import { ROUND_EVENT_BY_ID } from '../../../../shared/game-rules/catalog'
import { createInitialAdaptations, getRoundEventById } from '../../../../shared/game-rules/index'
import type { GameSnapshot } from '../../../lib/game-api'
import { getWorldById } from '../../../game/worlds'
import { buildGeneSelectionV2ViewModel, buildRoundEventEffects } from './build-gene-selection-v2-view-model'

describe('buildRoundEventEffects', () => {
    it('shows all five affinities using only the 0-1-2 scale', () => {
        const flashFlood = ROUND_EVENT_BY_ID.FLASH_FLOOD!

        expect(buildRoundEventEffects(flashFlood, true).map((effect) => effect.modifier)).toEqual([2, 1, 1, 0, 0])
        expect(buildRoundEventEffects(flashFlood, true).map((effect) => effect.value)).toEqual(expect.arrayContaining(['Ideale · Mimetismo', 'Adatto · Agilita', 'Sfavorevole · Ferocia']))
    })
    it('uses the match snapshot for Armored Memory and a qualifying Recovery Surge', () => {
        const traits = createInitialAdaptations()
        traits.ARMOR.exhausted = true
        traits.SENSES.level = 2
        traits.SENSES.exhausted = true
        traits.CAMOUFLAGE.level = 2
        const me = {
            id: 'me', game_id: 'game', nickname: 'Tu', slot: 1 as const, player_type: 'HUMAN' as const, traits,
            combat_mutation_state: { elasticLimbsUsed: false, adaptiveCoreStatus: 'DORMANT' as const, armoredMemoryUsed: false, recoverySurgeUsed: false },
            combat_mutation_loadout: ['ARMORED_MEMORY', 'RECOVERY_SURGE'] as const,
            connected: true, evolution_draft_options: [], chosen_evolution_target_id: null, created_at: '2026-08-20T00:00:00.000Z',
        }
        const opponent = {
            id: 'opponent', game_id: 'game', nickname: 'Bot', slot: 2 as const, player_type: 'BOT' as const, traits: createInitialAdaptations(),
            combat_mutation_state: { elasticLimbsUsed: false, adaptiveCoreStatus: 'DORMANT' as const, armoredMemoryUsed: false, recoverySurgeUsed: false },
            combat_mutation_loadout: ['ELASTIC_LIMBS', 'ADAPTIVE_CORE'] as const,
            connected: true, evolution_draft_options: [], chosen_evolution_target_id: null, created_at: '2026-08-20T00:00:00.000Z',
        }
        const snapshot = {
            game: { id: 'game', game_mode: 'VS_BOT', current_round: 1, round_event_sequence: ['HEAT_SPIKE'] },
            players: [me, opponent], me, opponent, world: getWorldById('AURELIA_PRIME'), currentRoundEvent: getRoundEventById('HEAT_SPIKE'), nextRoundEvent: null,
            actionsSubmitted: 0, myCurrentAction: null, currentRoundResult: null, roundResults: [], stateRevision: 0,
        } as unknown as GameSnapshot

        const model = buildGeneSelectionV2ViewModel({ snapshot, myScore: 0, opponentScore: 0, selectedGeneId: 'ARMOR', selectedAction: null, isSubmitting: false, submitErrorMessage: null, hasLocalSubmittedAction: false, localSubmittedAction: null })

        expect(model.selectedGene?.mutationHints).toBeUndefined()
        expect(model.selectedGene?.evolvePrediction).toEqual({ score: 2, mutationBonus: 1 })
        expect(model.selectedGene?.evolveMutationHints).toEqual(['+1 Impulso di recupero'])
        expect(model.genes.find((gene) => gene.id === 'SENSES')?.evolvable).toBe(true)
        expect(model.genes.find((gene) => gene.id === 'CAMOUFLAGE')?.evolvable).toBe(false)
        expect(model.player.combatMutations).toEqual([
            expect.objectContaining({ id: 'ARMORED_MEMORY', label: 'Memoria corazzata', status: 'available' }),
            expect.objectContaining({ id: 'RECOVERY_SURGE', label: 'Impulso di recupero', status: 'available' }),
        ])
    })
})

describe('Combat Mutation battle preview', () => {
    it('uses the shared mutation preview for an armed Core and Elastic Limbs', () => {
        const traits = createInitialAdaptations()
        const me = {
            id: 'me', game_id: 'game', nickname: 'Tu', slot: 1 as const, player_type: 'HUMAN' as const, traits,
            combat_mutation_state: { elasticLimbsUsed: false, adaptiveCoreStatus: 'ARMED' as const, armoredMemoryUsed: false, recoverySurgeUsed: false },
            combat_mutation_loadout: ['ELASTIC_LIMBS', 'ADAPTIVE_CORE'] as const, connected: true,
            evolution_draft_options: [], chosen_evolution_target_id: null, created_at: '2026-08-20T00:00:00.000Z',
        }
        const opponent = {
            id: 'opponent', game_id: 'game', nickname: 'Bot', slot: 2 as const, player_type: 'BOT' as const, traits: createInitialAdaptations(),
            combat_mutation_state: { elasticLimbsUsed: false, adaptiveCoreStatus: 'DORMANT' as const, armoredMemoryUsed: false, recoverySurgeUsed: false },
            combat_mutation_loadout: ['ELASTIC_LIMBS', 'ADAPTIVE_CORE'] as const, connected: true,
            evolution_draft_options: [], chosen_evolution_target_id: null, created_at: '2026-08-20T00:00:00.000Z',
        }
        const snapshot = {
            game: { id: 'game', game_mode: 'VS_BOT', current_round: 1, round_event_sequence: ['HEAT_SPIKE'] },
            players: [me, opponent], me, opponent, world: getWorldById('AURELIA_PRIME'), currentRoundEvent: getRoundEventById('HEAT_SPIKE'), nextRoundEvent: null,
            actionsSubmitted: 0, myCurrentAction: null, currentRoundResult: null, roundResults: [], stateRevision: 0,
    } as unknown as GameSnapshot

        const model = buildGeneSelectionV2ViewModel({ snapshot, myScore: 0, opponentScore: 0, selectedGeneId: 'AGILITY', selectedAction: null, isSubmitting: false, submitErrorMessage: null, hasLocalSubmittedAction: false, localSubmittedAction: null })

        expect(model.selectedGene?.prediction).toMatchObject({ mutationBonus: 1, useScore: 4 })
        expect(model.selectedGene?.mutationHints).toEqual([
            'Agilità resta disponibile',
            '+1 Nucleo adattivo',
        ])
        expect(model.player.combatMutations).toEqual([
            expect.objectContaining({ id: 'ELASTIC_LIMBS', status: 'available' }),
            expect.objectContaining({ id: 'ADAPTIVE_CORE', status: 'armed' }),
        ])
    })
})
