import { describe, expect, it } from 'vitest'

import { MockCreatureConceptGenerator } from './mock-concept-generator.ts'
import { validateCreatureTransformationConcept } from './concept-validation.ts'
import { TEST_CREATURE_IDENTITY } from './concept-test-fixtures.ts'
import { TRANSFORMATION_INTENSITIES } from './concepts.ts'
import { VISUAL_TRAITS } from './visual-traits.ts'

const generator = new MockCreatureConceptGenerator()

describe('MockCreatureConceptGenerator', () => {
    it('is deterministic for the same trait, intensity and seed', async () => {
        const input = {
            identity: TEST_CREATURE_IDENTITY,
            visualTrait: VISUAL_TRAITS[0],
            intensity: 2 as const,
            seed: 'same-seed',
        }

        await expect(generator.generateConcept(input)).resolves.toEqual(await generator.generateConcept(input))
        expect(generator.metadata.isMock).toBe(true)
    })

    it('uses the seed to select reproducible variations', async () => {
        const names = await Promise.all(
            Array.from({ length: 12 }, (_, index) => generator.generateConcept({
                identity: TEST_CREATURE_IDENTITY,
                visualTrait: VISUAL_TRAITS[0],
                intensity: 2,
                seed: `variation-${index}`,
            }).then((concept) => concept.conceptName)),
        )

        expect(new Set(names).size).toBeGreaterThan(1)
    })

    it('returns valid catalog-compliant concepts for every trait and intensity', async () => {
        for (const visualTrait of VISUAL_TRAITS) {
            for (const intensity of TRANSFORMATION_INTENSITIES) {
                const concept = await generator.generateConcept({
                    identity: TEST_CREATURE_IDENTITY,
                    visualTrait,
                    intensity,
                    seed: `${visualTrait.id}-${intensity}`,
                })
                const validation = validateCreatureTransformationConcept(concept, {
                    requestedVisualTrait: visualTrait,
                    requestedIntensity: intensity,
                    identity: TEST_CREATURE_IDENTITY,
                })

                expect(validation.valid).toBe(true)
                expect(visualTrait.allowedMutationArchetypes).toContain(concept.primaryMutation.mutationArchetype)
                expect(concept.primaryMutation.bodyAreas.every((area) => visualTrait.allowedBodyAreas.includes(area))).toBe(true)
            }
        }
    })

    it('makes the requested intensity visible in the concept output', async () => {
        const low = await generator.generateConcept({
            identity: TEST_CREATURE_IDENTITY,
            visualTrait: VISUAL_TRAITS[1],
            intensity: 1,
            seed: 'intensity',
        })
        const high = await generator.generateConcept({
            identity: TEST_CREATURE_IDENTITY,
            visualTrait: VISUAL_TRAITS[1],
            intensity: 3,
            seed: 'intensity',
        })

        expect(low.intensity).toBe(1)
        expect(high.intensity).toBe(3)
        expect(low.primaryMutation.morphology).not.toBe(high.primaryMutation.morphology)
        expect(low.secondaryMutations.length).toBeLessThan(high.secondaryMutations.length)
    })

    it('proposes intentional colour evolutions frequently while retaining a deterministic conservative path', async () => {
        const concepts = await Promise.all(Array.from({ length: 12 }, (_, index) => generator.generateConcept({
            identity: TEST_CREATURE_IDENTITY, visualTrait: VISUAL_TRAITS[4], intensity: 3, seed: `colour-${index}`,
        })))
        const evolved = concepts.filter((concept) => concept.colorEvolution?.mode !== 'PRESERVE')

        expect(evolved.length).toBeGreaterThan(6)
        expect(evolved.every((concept) => concept.colorEvolution?.mode === 'SHIFT' && concept.colorEvolution.affectedBodyAreas.includes('SKIN_SURFACE'))).toBe(true)
        expect(concepts.some((concept) => concept.colorEvolution?.mode === 'PRESERVE')).toBe(true)
    })
})
