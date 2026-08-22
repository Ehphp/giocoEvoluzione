import { describe, expect, it } from 'vitest'

import { ASSETS, fallbackToDefaultCreatureImage, withResolvedCreatureImage } from './assets'

describe('creature assets', () => {
    it('uses the verdant hatchling as every player-facing default', () => {
        // The generated file, not a master: `public/` is served verbatim, so a `.png` here would
        // mean an unoptimised asset had been wired back in. See tools/optimize-assets.ts.
        expect(ASSETS.creatures.default).toBe('/assets/battle/creatures/verdant-hatchling.webp')
        expect(ASSETS.creatures.player).toBe(ASSETS.creatures.default)
        expect(ASSETS.creatures.base).toBe(ASSETS.creatures.default)
    })

    it('replaces an unavailable signed image with the default creature', () => {
        const image = document.createElement('img')
        image.setAttribute('src', '/signed/evolved-creature.png')

        fallbackToDefaultCreatureImage(image)

        expect(image.getAttribute('src')).toBe(ASSETS.creatures.default)
    })

    it('keeps the default for the persisted base version and preserves evolved visuals', () => {
        const base = withResolvedCreatureImage({ signedUrl: '/signed/old-base.png', versionNumber: 1, isBaseVersion: true })
        const evolved = withResolvedCreatureImage({ signedUrl: '/signed/evolved.png', versionNumber: 2, isBaseVersion: false })

        expect(base.signedUrl).toBe(ASSETS.creatures.default)
        expect(evolved.signedUrl).toBe('/signed/evolved.png')
    })
})
