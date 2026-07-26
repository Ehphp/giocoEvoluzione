import { describe, expect, it } from 'vitest'

import { createInitialTraits } from './config'
import { getLegalBotActions, selectRandomBotAction } from './bot'

describe('bot action selection', () => {
    it('exposes only legal USE and EVOLVE actions', () => {
        const traits = createInitialTraits()
        traits.AGILITY.cooldown = 1
        traits.RESISTANCE.level = 3

        const actions = getLegalBotActions(traits)

        expect(actions).toContainEqual({ trait: 'STRENGTH', actionType: 'EVOLVE' })
        expect(actions).toContainEqual({ trait: 'STRENGTH', actionType: 'USE' })
        expect(actions).toContainEqual({ trait: 'AGILITY', actionType: 'EVOLVE' })
        expect(actions).not.toContainEqual({ trait: 'AGILITY', actionType: 'USE' })
        expect(actions).not.toContainEqual({ trait: 'RESISTANCE', actionType: 'EVOLVE' })
    })

    it('selects the first legal action when random returns zero', () => {
        const traits = createInitialTraits()

        expect(selectRandomBotAction(traits, () => 0)).toEqual({ trait: 'STRENGTH', actionType: 'EVOLVE' })
    })

    it('selects the last legal action when random is near one', () => {
        const traits = createInitialTraits()

        const action = selectRandomBotAction(traits, () => 0.999999)

        expect(action).toEqual({ trait: 'FAT_RESERVES', actionType: 'USE' })
    })
})
