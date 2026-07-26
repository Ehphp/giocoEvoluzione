import { describe, expect, it } from 'vitest'
import { selectStrategicBotAction } from './bot.ts'
import { getRoundEventById } from './state.ts'
import { createInitialGenes } from './state.ts'

describe('strategic bot', () => {
    it('uses the available gene with the highest value for the event', () => {
        const action = selectStrategicBotAction(createInitialGenes(), getRoundEventById('HEAT_SPIKE'), 1, null, () => 0)

        expect(action).toEqual({ trait: 'METABOLISM', actionType: 'USE' })
    })

    it('evolves the best-adapted trait when every available use has no value', () => {
        const genes = createInitialGenes()
        genes.METABOLISM.cooldown = 1
        genes.SENSES.cooldown = 1
        const action = selectStrategicBotAction(genes, getRoundEventById('NUTRIENT_COLLAPSE'), 1, null, () => 0)

        expect(action).toEqual({ trait: 'METABOLISM', actionType: 'EVOLVE' })
    })

    it('never evolves during the final round when a positive use is available', () => {
        const action = selectStrategicBotAction(createInitialGenes(), getRoundEventById('HEAT_SPIKE'), 6, null, () => 0)

        expect(action.actionType).toBe('USE')
    })

    it('evolves during the final round rather than using a non-positive gene', () => {
        const genes = createInitialGenes()
        genes.METABOLISM.cooldown = 1
        genes.SENSES.cooldown = 1
        const action = selectStrategicBotAction(genes, getRoundEventById('NUTRIENT_COLLAPSE'), 6, null, () => 0)

        expect(action.actionType).toBe('EVOLVE')
    })

    it('evolves the gene with a +2 bonus in the next round', () => {
        const action = selectStrategicBotAction(
            createInitialGenes(),
            getRoundEventById('HEAT_SPIKE'),
            1,
            getRoundEventById('FLASH_FLOOD'),
            () => 0,
        )

        expect(action).toEqual({ trait: 'AQUATIC', actionType: 'EVOLVE' })
    })

    it('evolves an available +1 gene next round when the +2 gene is on cooldown', () => {
        const genes = createInitialGenes()
        genes.METABOLISM.cooldown = 1
        const action = selectStrategicBotAction(
            genes,
            getRoundEventById('VOLCANIC_ASH_WAVE'),
            1,
            getRoundEventById('HEAT_SPIKE'),
            () => 0,
        )

        expect(action).toEqual({ trait: 'MOBILITY', actionType: 'EVOLVE' })
    })
})
