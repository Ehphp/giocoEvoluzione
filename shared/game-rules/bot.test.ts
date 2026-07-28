import { describe, expect, it } from 'vitest'
import { createInitialAdaptations, getRoundEventById, selectBotAction } from './index.ts'
import { selectEdgeBotAction } from '../../supabase/functions/resolve-round/bot-policy.ts'
describe('bot policy', () => {
    it('does not USE an adaptation in recovery and Edge stays equivalent', () => {
        const traits = createInitialAdaptations(); traits.SENSES.cooldown = 1
        const input = { adaptations: traits, roundEvent: getRoundEventById('HEAT_SPIKE'), roundNumber: 1, random: () => 0 }
        const selected = selectBotAction(input)
        expect(selected).not.toEqual({ trait: 'SENSES', actionType: 'USE' })
        expect(selectEdgeBotAction({ traits, roundEvent: input.roundEvent, roundNumber: 1, random: () => 0 })).toEqual(selected)
    })
})
