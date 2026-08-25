import { describe, expect, it, vi } from 'vitest'

import { BODY_PLANS } from '../../../shared/creature-transformations/flux-evolution/body-plan-registry.ts'
import { buildFluxEvolutionPlan } from '../../../shared/creature-transformations/flux-evolution/evolution-plan.ts'
import {
    FluxMicroConceptGenerator,
    composeFluxMicroConceptInstructions,
    isNovelFluxMicroConcept,
    isTopologicallyCompatibleFluxMicroConcept,
} from './flux-micro-concept-generator.ts'
import { TEST_CREATURE_IDENTITY } from './test-creature-fixtures.ts'

const PREVIOUS = [
    {
        versionNumber: 2,
        visualTraitId: 'LOCOMOTION_ADAPTATION' as const,
        evolutionTargetId: 'TAIL' as const,
        conceptName: 'Timone foglia',
        mutationIdea: 'coda larga',
    },
    {
        versionNumber: 3,
        visualTraitId: 'ENERGY_REGULATION' as const,
        evolutionTargetId: 'SKIN_AND_COVERING' as const,
        conceptName: 'Pelle abissale',
        mutationIdea: 'pelle scura con venature luminose',
    },
]

function planFor(
    evolutionTargetId: 'SKIN_AND_COVERING' | 'LIMBS_AND_FEET' | 'TAIL' | 'BODY_SHAPE',
    structural = false,
) {
    return buildFluxEvolutionPlan({
        bodyPlan: BODY_PLANS.QUADRUPED,
        evolutionTargetId,
        previousTransformations: PREVIOUS,
        seed: 'seed',
        ...(structural
            ? {
                  bodyPlanMutationEnabled: true,
                  requestedBodyPlanMutationId:
                      evolutionTargetId === 'TAIL' ? ('TAIL_SPLIT' as const) : ('ADD_LIMB_PAIR' as const),
              }
            : {}),
    })
}

const input = { identity: TEST_CREATURE_IDENTITY, plan: planFor('SKIN_AND_COVERING') }

describe('FluxMicroConceptGenerator', () => {
    it('briefs the model with target freedom, the anatomy contract and minimal target continuity', () => {
        const prompt = composeFluxMicroConceptInstructions(input)

        expect(prompt).toContain('SELECTED TARGET: SKIN_AND_COVERING')
        expect(prompt).toContain('FIELD ROLES:')
        expect(prompt).toMatch(/conceptName is a short visible morphology label, not the biological function/i)
        expect(prompt).toMatch(/mutationIdea describes concrete anatomy: what grows or reshapes/i)
        expect(prompt).toMatch(/visualDetails contains 1-5 non-overlapping concrete visual details/i)
        expect(prompt).toMatch(/avoid contains only mutation-specific failure modes/i)
        expect(prompt).toMatch(/do not include global camera, orientation, framing, background or anatomy rules/i)
        expect(prompt).toMatch(/primary evolutionary target/i)
        expect(prompt).toMatch(/default to a local mutation/i)
        expect(prompt).toMatch(/If the mutation works on its own, describe only that target/i)
        expect(prompt).toMatch(/Preserve all unrelated anatomy by default/i)
        expect(prompt).toMatch(/never add one by default/i)
        expect(prompt).not.toMatch(/lives exclusively there/i)
        expect(prompt).toContain('TARGET FREEDOM')
        expect(prompt).toContain('TOPOLOGY: For a normal anatomical mutation')
        expect(prompt).toMatch(/Structures integrated into and anchored to the selected target are allowed/i)
        expect(prompt).toMatch(
            /do not describe independently rooted appendages, new anatomical roots, extra tails, tentacles, limbs, wings or heads/i,
        )
        expect(prompt).toContain('ANATOMY CONTRACT')
        expect(prompt).toContain('CURRENT SOURCE IMAGE')
        expect(prompt).toContain('MUTABLE APPEARANCE: corpo verde')
        expect(prompt).toMatch(/not identity invariants/i)
        expect(prompt).toMatch(/visible colour treatment is optional/i)
        expect(prompt).toContain('CURRENT TARGET STATE')
        expect(prompt).toContain('Pelle abissale')
        expect(prompt).toMatch(/new, substantial, independently readable morphological mutation/i)
        expect(prompt).toMatch(/do not merely enlarge, decorate, refine or recolour it/i)
        expect(prompt).not.toContain('OTHER ESTABLISHED EVOLUTIONS')
        expect(prompt).not.toContain('Timone foglia')
        expect(prompt).not.toContain('LEGACY EVOLUTIONS WITH UNKNOWN TARGET')
        expect(prompt).not.toContain('mutationArchetype')
        expect(prompt).not.toContain('colorEvolution')
        expect(prompt).not.toContain('AUTHORIZED BODY-PLAN MUTATION')
    })

    it('makes SKIN_AND_COVERING surface-first without applying its boundary to TAIL', () => {
        const skinPrompt = composeFluxMicroConceptInstructions(input)
        const tailPrompt = composeFluxMicroConceptInstructions({
            identity: TEST_CREATURE_IDENTITY,
            plan: planFor('TAIL'),
        })

        expect(skinPrompt).toContain('SKIN SURFACE-FIRST BOUNDARY')
        expect(skinPrompt).toMatch(/conformal, anatomy-following covering mutation/i)
        expect(skinPrompt).toMatch(/dominant palette and pigmentation, biological patterns, scale morphology and grain/i)
        expect(skinPrompt).toMatch(/dermal texture, skin thickness, translucency, iridescence and sheen/i)
        expect(skinPrompt).toMatch(/attached and conformal to the existing body surface/i)
        expect(skinPrompt).toMatch(/dorsal spines, horns, crests, fins/i)
        expect(skinPrompt).toMatch(/long projecting plates, new appendages or other protruding structures/i)
        expect(skinPrompt).toMatch(/substantially change the silhouette/i)
        expect(skinPrompt).toMatch(/Do not change body shape, topology, pose, stance, limb structure, tail structure/i)
        expect(tailPrompt).not.toContain('SKIN SURFACE-FIRST BOUNDARY')
    })

    it('adds observed state only as secondary repair context and leaves the selected target primary', () => {
        const prompt = composeFluxMicroConceptInstructions({
            ...input,
            visualContinuity: 'CURRENT OBSERVED VISUAL STATE: four limbs; unresolved EXTRA_LIMB at CENTER_IMAGE_RIGHT.',
        })

        expect(prompt).toContain('VISUAL CONTINUITY (secondary repair context)')
        expect(prompt).toContain('unresolved EXTRA_LIMB')
        expect(prompt).toMatch(/selected target remains the primary mutation/i)
    })

    it('treats DEFENSE as a purpose and asks for grown biological anatomy', () => {
        const basePlan = planFor('TAIL')
        const prompt = composeFluxMicroConceptInstructions({
            identity: TEST_CREATURE_IDENTITY,
            plan: { ...basePlan, evolutionFunction: 'DEFENSE', visualTraitId: 'ANATOMICAL_EVOLUTION' },
        })

        expect(prompt).toContain('Functional direction: DEFENSE. Use the biological function to invent the mutation')
        expect(prompt).toMatch(/describe visible anatomy rather than explaining its purpose/i)
        expect(prompt).toContain('BIOLOGICAL PRIOR')
        expect(prompt).toMatch(/naturally grown animal anatomy and biological tissues/i)
        expect(prompt).toMatch(/Avoid manufactured, mechanical, metallic, technological or worn structures/i)
        expect(prompt).toMatch(
            /carapaces, chitin, bone, keratin, scales, mineralized skin, spines and biological plates remain valid/i,
        )
        expect(prompt).not.toContain('IMPACT_ADAPTATION')
    })

    it('keeps a normal BODY_SHAPE concept inside the existing creature presentation', () => {
        const prompt = composeFluxMicroConceptInstructions({
            identity: TEST_CREATURE_IDENTITY,
            plan: planFor('BODY_SHAPE'),
        })

        expect(prompt).toContain('BODY-SHAPE PRESENTATION LOCK')
        expect(prompt).toMatch(/same base pose, viewpoint, facing direction, overall orientation and composition/i)
        expect(prompt).toMatch(/Do not describe a new stance, camera angle, rotation, tilt or re-staging/i)
        expect(prompt).not.toMatch(/differently balanced|posture rebalancing/i)
    })

    it('locks TAIL concepts to the source pose and local tail anatomy', () => {
        const prompt = composeFluxMicroConceptInstructions({ identity: TEST_CREATURE_IDENTITY, plan: planFor('TAIL') })
        const nonTailPrompt = composeFluxMicroConceptInstructions(input)

        expect(prompt).toContain('TAIL POSE AND BODY LOCK')
        expect(prompt).toMatch(/Preserve the original pose and body plan/i)
        expect(prompt).toMatch(
            /secondary adaptation only when it is necessary for local anatomical continuity, tail-root integration or tightly linked target material or colour propagation/i,
        )
        expect(prompt).toMatch(
            /never as wings, dorsal fronds, back ornaments, unrelated fins or independently rooted appendages/i,
        )
        expect(prompt).not.toMatch(/posture rebalancing|stance rebalancing|supporting anatomy/i)
        expect(nonTailPrompt).not.toContain('TAIL POSE AND BODY LOCK')
    })

    it('states the authorized structural change when the capability is used', () => {
        const prompt = composeFluxMicroConceptInstructions({
            identity: TEST_CREATURE_IDENTITY,
            plan: planFor('LIMBS_AND_FEET', true),
        })

        expect(prompt).toContain('AUTHORIZED BODY-PLAN MUTATION')
        expect(prompt).toMatch(/one additional symmetrical pair of limbs/i)
        expect(prompt).toContain('Keep exactly 6 limbs')
    })

    it('separates source, authorized change and output topology for a structural TAIL concept', () => {
        const prompt = composeFluxMicroConceptInstructions({
            identity: TEST_CREATURE_IDENTITY,
            plan: planFor('TAIL', true),
        })

        expect(prompt).toMatch(/SOURCE ANATOMY: The source creature currently has exactly 1 tail/i)
        expect(prompt).toMatch(
            /AUTHORIZED TOPOLOGY CHANGE: Change exactly 1 existing tail into 2 tails sharing the original tail root/i,
        )
        expect(prompt).toMatch(/OUTPUT ANATOMY: The final creature must have exactly 2 tails/i)
        expect(prompt).not.toContain('AUTHORIZED BODY-PLAN MUTATION: Split the tail into two tails')
    })

    it('uses strict structured output and returns only the small micro-concept', async () => {
        const fetchImplementation = vi.fn(
            async () =>
                new Response(
                    JSON.stringify({
                        output_text: JSON.stringify({
                            conceptName: 'Corteccia vitrea',
                            mutationIdea: 'Placche vitree.',
                            visualDetails: ['placche'],
                            avoid: [],
                        }),
                    }),
                ),
        )
        const generator = new FluxMicroConceptGenerator({
            apiKey: 'test-key',
            model: 'test-model',
            fetchImplementation,
        })

        await expect(generator.generate(input)).resolves.toMatchObject({ conceptName: 'Corteccia vitrea' })
        const request = JSON.parse(String(fetchImplementation.mock.calls[0]![1].body))
        expect(request.text.format.strict).toBe(true)
        expect(request.text.format.schema.required).toEqual(['conceptName', 'mutationIdea', 'visualDetails', 'avoid'])
        expect(JSON.stringify(request)).toContain('additionalProperties')
    })

    it('retries a topologically incompatible normal TAIL concept before accepting a continuous tail', async () => {
        const fetchImplementation = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        output_text: JSON.stringify({
                            conceptName: 'Ventaglio abissale',
                            mutationIdea: 'La coda si divide in sei appendici indipendenti simili a tentacoli.',
                            visualDetails: ['code aggiuntive'],
                            avoid: [],
                        }),
                    }),
                ),
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        output_text: JSON.stringify({
                            conceptName: 'Ventaglio abissale',
                            mutationIdea:
                                'La coda esistente sviluppa lobi fogliari articolati lungo la sua struttura continua.',
                            visualDetails: ['lobi ancorati alla coda'],
                            avoid: [],
                        }),
                    }),
                ),
            )
        const generator = new FluxMicroConceptGenerator({
            apiKey: 'test-key',
            model: 'test-model',
            fetchImplementation,
        })

        await expect(
            generator.generate({ identity: TEST_CREATURE_IDENTITY, plan: planFor('TAIL') }),
        ).resolves.toMatchObject({ conceptName: 'Ventaglio abissale' })
        expect(fetchImplementation).toHaveBeenCalledTimes(2)
    })

    it('retries one malformed schema response then rejects an invalid contract', async () => {
        const retry = vi
            .fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: '{bad json' })))
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        output_text: JSON.stringify({ conceptName: '', mutationIdea: 'idea', visualDetails: [] }),
                    }),
                ),
            )
        const generator = new FluxMicroConceptGenerator({
            apiKey: 'test-key',
            model: 'test-model',
            fetchImplementation: retry,
        })

        await expect(generator.generate(input)).rejects.toMatchObject({ code: 'FLUX_CONCEPT_RESPONSE_INVALID' })
        expect(retry).toHaveBeenCalledTimes(2)
    })

    it('rejects a repeated local concept and retries with a different morphological direction', async () => {
        const repeated = {
            conceptName: 'Pelle abissale',
            mutationIdea: 'pelle scura con venature luminose',
            visualDetails: ['venature luminose'],
            avoid: [],
        }
        const distinct = {
            conceptName: 'Corteccia vitrea',
            mutationIdea: 'La pelle sviluppa placche traslucide sovrapposte.',
            visualDetails: ['placche traslucide'],
            avoid: [],
        }
        const fetchImplementation = vi
            .fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify(repeated) })))
            .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify(distinct) })))
        const generator = new FluxMicroConceptGenerator({
            apiKey: 'test-key',
            model: 'test-model',
            fetchImplementation,
        })

        await expect(generator.generate(input)).resolves.toMatchObject({ conceptName: 'Corteccia vitrea' })
        expect(fetchImplementation).toHaveBeenCalledTimes(2)
        const retryRequest = JSON.parse(String(fetchImplementation.mock.calls[1]![1].body))
        expect(JSON.stringify(retryRequest)).toContain('NOVELTY RETRY')
    })

    it('accepts different local mutations on the same target without requiring a multi-target change', () => {
        const plan = planFor('TAIL')
        const localTailMutation = {
            conceptName: 'Coda a clava',
            mutationIdea: 'La coda sviluppa vertebre compattate e una massa terminale di cheratina.',
            visualDetails: ['massa terminale ancorata alla coda'],
            avoid: [],
        }

        expect(plan.noveltyReferences).toHaveLength(1)
        expect(isNovelFluxMicroConcept(localTailMutation, plan)).toBe(true)
        expect(isTopologicallyCompatibleFluxMicroConcept(localTailMutation, plan)).toBe(true)
    })

    it('scopes novelty to the selected target rather than forcing mutations across targets', () => {
        const plan = planFor('TAIL')
        const tailOnlyMutation = {
            conceptName: 'Coda a frusta',
            mutationIdea: 'La coda esistente forma anelli elastici di cheratina lungo la sua struttura continua.',
            visualDetails: ['anelli integrati nella coda'],
            avoid: [],
        }

        expect(isNovelFluxMicroConcept(tailOnlyMutation, plan)).toBe(true)
        expect(tailOnlyMutation.mutationIdea).not.toMatch(/ali|zampe|pelle|head/i)
    })
})
