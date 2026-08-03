import { describe, expect, it } from 'vitest'

import {
    CURRENT_CREATURE_RENDER_SPECIFICATION,
    TRANSFORMATION_INTENSITIES,
    VISUAL_TRAIT_BY_ID,
    VISUAL_TRAIT_IDS,
    VISUAL_TRAITS,
    type CreatureTransformationRequest,
    type GenerateConceptRequest,
    type GenerateImageRequest,
} from './index.ts'

const domainSources = import.meta.glob('./*.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
}) as Record<string, string>

describe('creature transformation domain', () => {
    it('defines each visual trait exactly once with a distinct display name', () => {
        expect(VISUAL_TRAITS.map((trait) => trait.id)).toEqual(VISUAL_TRAIT_IDS)
        expect(new Set(VISUAL_TRAIT_IDS).size).toBe(VISUAL_TRAIT_IDS.length)
        expect(new Set(VISUAL_TRAITS.map((trait) => trait.displayName)).size).toBe(VISUAL_TRAITS.length)

        for (const trait of VISUAL_TRAITS) {
            expect(trait.displayName).not.toBe(trait.id)
            expect(trait.allowedBodyAreas.length).toBeGreaterThan(0)
            expect(trait.allowedMutationArchetypes.length).toBeGreaterThan(0)
            expect(VISUAL_TRAIT_BY_ID[trait.id]).toBe(trait)
        }
    })

    it('exports immutable visual trait catalogues', () => {
        expect(Object.isFrozen(VISUAL_TRAIT_IDS)).toBe(true)
        expect(Object.isFrozen(VISUAL_TRAITS)).toBe(true)
        expect(Object.isFrozen(VISUAL_TRAIT_BY_ID)).toBe(true)

        for (const trait of VISUAL_TRAITS) {
            expect(Object.isFrozen(trait)).toBe(true)
            expect(Object.isFrozen(trait.allowedBodyAreas)).toBe(true)
            expect(Object.isFrozen(trait.allowedMutationArchetypes)).toBe(true)
            expect(Object.isFrozen(trait.creativeLimits)).toBe(true)
        }
    })

    it('keeps the current sprite render specification fixed and immutable', () => {
        expect(CURRENT_CREATURE_RENDER_SPECIFICATION).toEqual({
            version: 'sprite-1024x1536-v1',
            width: 1024,
            height: 1536,
            outputMimeType: 'image/png',
            transparentBackground: true,
            preservePose: true,
            preserveComposition: true,
            preserveCanvasMargins: true,
        })
        expect(Object.isFrozen(CURRENT_CREATURE_RENDER_SPECIFICATION)).toBe(true)
    })

    it('limits transformation intensity to the canonical three values', () => {
        expect(TRANSFORMATION_INTENSITIES).toEqual([1, 2, 3])
        expect(Object.isFrozen(TRANSFORMATION_INTENSITIES)).toBe(true)
    })

    it('discriminates concept and image requests', () => {
        const conceptRequest: GenerateConceptRequest = {
            operation: 'GENERATE_CONCEPT',
            creatureId: 'creature-1',
            visualTraitId: 'IMPACT_ADAPTATION',
            intensity: 2,
            conceptMode: 'MOCK',
            idempotencyKey: 'request-1',
        }
        const imageRequest: GenerateImageRequest = {
            operation: 'GENERATE_IMAGE',
            creatureId: 'creature-1',
            concept: {
                schemaVersion: 1,
                visualTrait: 'IMPACT_ADAPTATION',
                conceptName: 'Scaglie elastiche',
                evolutionaryFunction: 'Distribuisce l urto sul dorso.',
                primaryMutation: {
                    mutationArchetype: 'ELASTIC_CUSHIONING',
                    bodyAreas: ['BACK'],
                    morphology: 'Cuscinetti sovrapposti.',
                    material: 'Tessuto elastico',
                },
                secondaryMutations: [],
                identityToPreserve: ['Volto'],
                forbiddenChanges: ['Nessuna arma'],
                intensity: 2,
            },
            imageProviderMode: 'MOCK',
            idempotencyKey: 'request-2',
        }

        const getRequestDetail = (request: CreatureTransformationRequest) => (
            request.operation === 'GENERATE_CONCEPT'
                ? request.visualTraitId
                : request.operation === 'GENERATE_IMAGE'
                    ? request.concept.primaryMutation.mutationArchetype
                    : request.operation === 'GET_REQUEST_STATUS' || request.operation === 'SUBMIT_EXPERIMENT_REVIEW'
                        ? request.transformationRequestId
                        : request.operation
        )

        expect(getRequestDetail(conceptRequest)).toBe('IMPACT_ADAPTATION')
        expect(getRequestDetail(imageRequest)).toBe('ELASTIC_CUSHIONING')
    })

    it('does not import either gameplay domain path', () => {
        for (const [filePath, source] of Object.entries(domainSources)) {
            if (filePath.endsWith('.test.ts')) {
                continue
            }

            expect(source).not.toMatch(/from\s+['"][^'"]*(?:game-rules|src\/game)(?:\/|['"])/)
            expect(source).not.toMatch(/@supabase|api\.openai|fetch\(|Deno\.env/)
        }
    })
})
