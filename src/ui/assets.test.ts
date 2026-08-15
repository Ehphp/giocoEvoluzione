import { describe, expect, it } from 'vitest'

import { ASSETS, fallbackToDefaultCreatureImage } from './assets'

describe('creature assets', () => {
    it('uses the verdant hatchling as every player-facing default', () => {
        expect(ASSETS.creatures.default).toBe('/assets/battle/creatures/verdant-hatchling.png')
        expect(ASSETS.creatures.player).toBe(ASSETS.creatures.default)
        expect(ASSETS.creatures.base).toBe(ASSETS.creatures.default)
    })

    it('replaces an unavailable signed image with the default creature', () => {
        const image = document.createElement('img')
        image.setAttribute('src', '/signed/evolved-creature.png')

        fallbackToDefaultCreatureImage(image)

        expect(image.getAttribute('src')).toBe(ASSETS.creatures.default)
    })
})