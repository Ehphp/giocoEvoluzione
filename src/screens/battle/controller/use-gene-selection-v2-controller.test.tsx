import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RULE_VERSION } from '../../../../shared/game-rules/catalog'
import { createInitialAdaptations, getRoundEventById } from '../../../../shared/game-rules/index'
import type { GameSnapshot } from '../../../lib/game-api'
import { getWorldById } from '../../../game/worlds'
import { useGeneSelectionV2Controller } from './use-gene-selection-v2-controller'

type Controller = ReturnType<typeof useGeneSelectionV2Controller>

function createSnapshot(): GameSnapshot {
    const me = {
        id: 'me', game_id: 'game', nickname: 'Tu', slot: 1 as const, player_type: 'HUMAN' as const,
        traits: createInitialAdaptations(),
        combat_mutation_state: { elasticLimbsUsed: false, adaptiveCoreStatus: 'DORMANT' as const, armoredMemoryUsed: false, recoverySurgeUsed: false },
        combat_mutation_loadout: ['ELASTIC_LIMBS', 'ADAPTIVE_CORE'] as const,
        connected: true, evolution_draft_options: [], chosen_evolution_target_id: null, created_at: '2026-08-20T00:00:00.000Z',
    }
    const opponent = {
        id: 'opponent', game_id: 'game', nickname: 'Avversario', slot: 2 as const, player_type: 'HUMAN' as const,
        traits: createInitialAdaptations(),
        combat_mutation_state: { elasticLimbsUsed: false, adaptiveCoreStatus: 'DORMANT' as const, armoredMemoryUsed: false, recoverySurgeUsed: false },
        combat_mutation_loadout: ['ELASTIC_LIMBS', 'ADAPTIVE_CORE'] as const,
        connected: true, evolution_draft_options: [], chosen_evolution_target_id: null, created_at: '2026-08-20T00:00:00.000Z',
    }

    return {
        game: {
            id: 'game', game_mode: 'PVP', status: 'CHOOSING', current_round: 1, scheduled_rounds: 7,
            round_event_sequence: ['HEAT_SPIKE'], rule_version: RULE_VERSION,
        },
        players: [me, opponent],
        me,
        opponent,
        world: getWorldById('AURELIA_PRIME'),
        currentRoundEvent: getRoundEventById('HEAT_SPIKE'),
        nextRoundEvent: null,
        actionsSubmitted: 0,
        myCurrentAction: null,
        currentRoundResult: null,
        roundResults: [],
        stateRevision: 0,
    } as unknown as GameSnapshot
}

describe('useGeneSelectionV2Controller', () => {
    let container: HTMLDivElement
    let root: Root
    let controller: Controller
    const onSubmitAction = vi.fn(async () => true)

    beforeEach(() => {
        vi.clearAllMocks()
        container = document.createElement('div')
        document.body.append(container)
        root = createRoot(container)

        function Probe() {
            controller = useGeneSelectionV2Controller({
                snapshot: createSnapshot(),
                myScore: 0,
                opponentScore: 0,
                onSubmitAction,
            })

            return null
        }

        act(() => root.render(createElement(Probe)))
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('submits the explicit gene even when selection changes in the same event', async () => {
        await act(async () => {
            controller.onSelectGene('ARMOR')
            await controller.onSubmitGeneAction({ geneId: 'ARMOR', actionType: 'USE' })
        })

        expect(onSubmitAction).toHaveBeenCalledWith({ trait: 'ARMOR', actionType: 'USE' })
    })

    it('routes the existing USE action through the atomic command', async () => {
        act(() => controller.onSelectGene('SENSES'))

        await act(async () => {
            await controller.onUseGene()
        })

        expect(onSubmitAction).toHaveBeenCalledWith({ trait: 'SENSES', actionType: 'USE' })
    })

    it('routes the existing EVOLVE action through the atomic command', async () => {
        act(() => controller.onSelectGene('CAMOUFLAGE'))

        await act(async () => {
            await controller.onEvolveGene()
        })

        expect(onSubmitAction).toHaveBeenCalledWith({ trait: 'CAMOUFLAGE', actionType: 'EVOLVE' })
    })

    it('releases the atomic submit lock after an error', async () => {
        onSubmitAction.mockRejectedValueOnce(new Error('network'))

        let firstResult = true
        await act(async () => {
            firstResult = await controller.onSubmitGeneAction({ geneId: 'ARMOR', actionType: 'USE' })
        })
        await act(async () => {
            await controller.onSubmitGeneAction({ geneId: 'ARMOR', actionType: 'USE' })
        })

        expect(firstResult).toBe(false)
        expect(onSubmitAction).toHaveBeenCalledTimes(2)
    })
})
