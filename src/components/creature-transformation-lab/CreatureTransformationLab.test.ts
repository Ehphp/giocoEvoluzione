import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ generateConcept: vi.fn(), generateImage: vi.fn() }))

vi.mock('../../lib/creature-transformations-api', () => ({
    createConceptIdempotencyKey: () => 'test-key',
    createImageIdempotencyKey: () => 'image-test-key',
    generateCreatureTransformationConcept: mocks.generateConcept,
    generateCreatureTransformationImage: mocks.generateImage,
    CreatureTransformationApiError: class CreatureTransformationApiError extends Error {},
}))

import { CreatureTransformationLab } from './CreatureTransformationLab'

describe('CreatureTransformationLab', () => {
    it('hides the image action until a concept is accepted and exposes no REAL selector', () => {
        const markup = renderToStaticMarkup(createElement(CreatureTransformationLab, {
            creature: {
                id: 'creature-1', profile_id: 'profile-1', base_creature_key: 'VERDANT_HATCHLING', name: 'Creatura iniziale',
                level: 1, experience: 0, progression_state: {}, created_at: '', updated_at: '',
            },
            onBack: () => undefined,
        }))

        expect(markup).toContain('Laboratorio trasformazioni')
        expect(markup).toContain('Visual Trait')
        expect(markup).toContain('Concept Generator')
        expect(markup).toContain('Genera concept')
        expect(markup).toContain('/assets/battle/creatures/verdant-hatchling.png')
        expect(markup).not.toContain('/assets/creatures/base.png')
        expect(markup).not.toContain('Genera immagine')
        expect(markup).not.toContain('REAL')
        expect(mocks.generateConcept).not.toHaveBeenCalled()
        expect(mocks.generateImage).not.toHaveBeenCalled()
    })
})
