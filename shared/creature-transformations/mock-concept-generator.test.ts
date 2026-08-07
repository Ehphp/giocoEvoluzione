import { describe, expect, it } from 'vitest'

import { MockCreatureConceptGenerator } from './mock-concept-generator.ts'
import { validateCreatureTransformationConcept } from './concept-validation.ts'
import { TEST_CREATURE_IDENTITY } from './concept-test-fixtures.ts'
import { TRANSFORMATION_INTENSITIES } from './concepts.ts'
import { VISUAL_TRAITS } from './visual-traits.ts'
import { EVOLUTION_TARGET_BY_ID, EVOLUTION_TARGETS, resolveEvolutionDirection } from './evolution-targets.ts'

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

    it('generates one local primary mutation for a target-based evolution', async () => {
        const evolutionTarget = EVOLUTION_TARGET_BY_ID.TAIL
        const concept = await generator.generateConcept({
            identity: TEST_CREATURE_IDENTITY, visualTrait: VISUAL_TRAITS[1], intensity: 1, seed: 'target-tail',
            evolutionTarget, evolutionTargetId: evolutionTarget.id, evolutionFunction: 'BALANCE',
        })
        const result = validateCreatureTransformationConcept(concept, {
            requestedVisualTrait: VISUAL_TRAITS[1], requestedEvolutionTarget: evolutionTarget,
            requestedEvolutionFunction: 'BALANCE', requestedIntensity: 1, identity: TEST_CREATURE_IDENTITY,
        })

        expect(result.valid).toBe(true)
        expect(concept.schemaVersion).toBe(2)
        expect(concept.primaryMutation.bodyAreas).toEqual(['TAIL'])
        expect(concept.evolutionTargetId).toBe('TAIL')
    })

    it('generates valid local target concepts for every resolved direction and intensity', async () => {
        for (const target of EVOLUTION_TARGETS) {
            const direction = resolveEvolutionDirection({ evolutionTargetId: target.id, seed: `mock:${target.id}` })
            if (!direction) throw new Error(`missing direction for ${target.id}`)
            const visualTrait = VISUAL_TRAITS.find((trait) => trait.id === direction.visualTraitId)!
            for (const intensity of TRANSFORMATION_INTENSITIES) {
                const concept = await generator.generateConcept({
                    identity: TEST_CREATURE_IDENTITY, visualTrait, intensity, seed: `mock:${target.id}:${intensity}`,
                    evolutionTarget: target, evolutionTargetId: target.id, evolutionFunction: direction.evolutionFunction,
                })
                const validation = validateCreatureTransformationConcept(concept, {
                    requestedVisualTrait: visualTrait, requestedEvolutionTarget: target, requestedEvolutionFunction: direction.evolutionFunction,
                    requestedIntensity: intensity, identity: TEST_CREATURE_IDENTITY,
                })

                expect(validation, `${target.id}/${direction.evolutionFunction}/${intensity}: ${validation.valid ? '' : validation.problems.map((problem) => problem.code).join(', ')}`).toMatchObject({ valid: true })
                expect(concept.primaryMutation.bodyAreas).toHaveLength(1)
                expect(target.primaryBodyAreas).toContain(concept.primaryMutation.bodyAreas[0])
                expect(concept.colorEvolution).toBeDefined()
            }
        }
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
