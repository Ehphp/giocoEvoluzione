import { describe, expect, it } from 'vitest'
import { createInitialGenes, getRoundEventById, resolveRound } from './index.ts'
import { COOLDOWN_NONE, EVOLVE, USE, actionValue, assertAuditEquivalence, encodeState, nextState, toGenes } from '../../tools/audit-core.ts'

describe('packed audit engine', () => {
    it('matches the real engine for sampled states, actions and events', () => {
        assertAuditEquivalence()
        const state = encodeState((2 << 0) | (1 << 4), COOLDOWN_NONE)
        const event = getRoundEventById('HEAT_SPIKE')
        const before = toGenes(state)
        const resolved = resolveRound({ roundNumber: 3, roundEvent: event, player1Id: 'one', player2Id: 'two', player1Traits: before, player2Traits: createInitialGenes(), player1Action: { playerId: 'one', trait: 'RESILIENCE', actionType: 'USE' }, player2Action: { playerId: 'two', trait: 'AQUATIC', actionType: 'EVOLVE' } })
        expect(actionValue(3, state, USE(0))).toBe(resolved.player1.roundValue)
        expect(toGenes(nextState(state, USE(0)))).toEqual(resolved.player1.traits)
        expect(nextState(state, EVOLVE(1))).not.toBe(state)
    })
})
