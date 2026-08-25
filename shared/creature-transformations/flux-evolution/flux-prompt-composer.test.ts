import { describe, expect, it } from 'vitest'

import { composeLockedDynamicFluxEvolutionPrompt } from './flux-prompt-composer.ts'
import { buildAnatomyContract } from './anatomy-contract.ts'
import { BODY_PLANS } from './body-plan-registry.ts'

describe('composeLockedDynamicFluxEvolutionPrompt', () => {
    const identity = {
        creatureId: 'creature',
        baseCreatureKey: 'test-creature',
        description: 'A moss-green quadruped.',
        identityFeatures: ['round eyes'],
        mutableVisualFeatures: [],
        styleDefinition: 'illustrated',
    }
    const anatomyContract = buildAnatomyContract({
        bodyPlan: BODY_PLANS.QUADRUPED,
        evolutionTargetId: 'HEAD_AND_CROWN',
    })
    const dynamicConcept = {
        conceptName: 'TEST_DYNAMIC_MUTATION_123',
        mutationIdea: 'Grow a symmetrical pair of soft crown structures from the existing skull.',
        visualDetails: ['rounded upward branches', 'living orange vascular velvet'],
        avoid: ['exposed white bone'],
    }

    function lockedPrompt(
        microConcept: Parameters<typeof composeLockedDynamicFluxEvolutionPrompt>[0]['microConcept'] = dynamicConcept,
        framingAttempt?: number,
    ) {
        return composeLockedDynamicFluxEvolutionPrompt({
            identity,
            anatomyContract,
            microConcept,
            ...(framingAttempt === undefined ? {} : { framingAttempt }),
        })
    }

    function withoutMutation(prompt: string) {
        const start = prompt.indexOf('\n\nNEW MUTATION —')
        const end = prompt.indexOf('\n\nBIOLOGICAL PRIOR')
        return `${prompt.slice(0, start)}${prompt.slice(end)}`
    }

    it('keeps the deterministic viewpoint, framing, anatomy and invalid-result locks', () => {
        const prompt = lockedPrompt()

        expect(prompt).toContain('VIEWPOINT LOCK')
        expect(prompt).toContain('exact same camera angle, 3/4 view, facing direction')
        expect(prompt).toContain('Do not mirror the subject.')
        expect(prompt).toContain('Do not rotate it into profile.')
        expect(prompt).toContain('STRICT FRAMING')
        expect(prompt).toContain('ANATOMY LOCK')
        expect(prompt).toContain('Keep exactly 4 limbs')
        expect(prompt).toContain('SELECTED TARGET: HEAD_AND_CROWN')
        expect(prompt).toContain('BIOLOGICAL PRIOR')
        expect(prompt).toContain('NON-TARGET PRESERVATION')
        expect(prompt).toContain('BACKGROUND')
        expect(prompt).toContain('INVALID RESULT IF')
        expect(prompt).toMatch(/front-facing, profile-facing, mirrored/i)
        expect(prompt).not.toMatch(/stance rebalancing/i)
    })

    it('renders every field of the dynamic concept without flattening it', () => {
        const prompt = lockedPrompt()

        expect(prompt).toContain('NEW MUTATION — TEST_DYNAMIC_MUTATION_123')
        expect(prompt).toContain(dynamicConcept.mutationIdea)
        expect(prompt).toContain('Visual details:\n- rounded upward branches\n- living orange vascular velvet')
        expect(prompt).toContain('Avoid:\n- exposed white bone')
        expect(prompt).toContain(
            'cannot override VIEWPOINT LOCK, STRICT FRAMING, ANATOMY LOCK or NON-TARGET PRESERVATION',
        )
        expect(lockedPrompt({ ...dynamicConcept, avoid: undefined })).not.toContain('\nAvoid:\n')
    })

    it('keeps D and E shells identical while only their NEW MUTATION changes', () => {
        const fixed = lockedPrompt({ ...dynamicConcept, conceptName: 'ORANGE VELVET JUVENILE ANTLERS' })
        const generated = lockedPrompt()

        expect(withoutMutation(fixed)).toBe(withoutMutation(generated))
        expect(fixed).toContain('ORANGE VELVET JUVENILE ANTLERS')
        expect(generated).toContain('TEST_DYNAMIC_MUTATION_123')
    })

    it('keeps the concept unchanged while a retry tightens framing only', () => {
        const first = lockedPrompt()
        const retry = lockedPrompt(dynamicConcept, 1)

        expect(retry).toContain('RETRY FRAMING OVERRIDE (attempt 2)')
        expect(retry).toContain('at least 15% clear background margin')
        expect(retry).toContain('TEST_DYNAMIC_MUTATION_123')
        expect(retry).toContain(dynamicConcept.mutationIdea)
        expect(first).not.toContain('RETRY FRAMING OVERRIDE')
    })

    it('applies the pose, locality and non-target locks only to TAIL', () => {
        const tailContract = buildAnatomyContract({ bodyPlan: BODY_PLANS.QUADRUPED, evolutionTargetId: 'TAIL' })
        const tailPrompt = composeLockedDynamicFluxEvolutionPrompt({
            identity,
            anatomyContract: tailContract,
            microConcept: dynamicConcept,
        })
        const nonTailPrompt = lockedPrompt()

        expect(tailPrompt).toContain('TAIL POSE AND BODY LOCK')
        expect(tailPrompt).toMatch(/Preserve the original pose and body plan/i)
        expect(tailPrompt).toMatch(
            /Do not make the creature taller, more upright, more serpentine or substantially elongated/i,
        )
        expect(tailPrompt).toMatch(
            /never as wings, dorsal fronds, back ornaments, unrelated fins or independently rooted appendages/i,
        )
        expect(tailPrompt).toMatch(
            /Preserve the head, face, neck proportions, torso proportions, limb roots, limb placement, original stance and overall body presentation/i,
        )
        expect(tailPrompt).not.toMatch(/posture rebalancing|stance rebalancing|supporting anatomy/i)
        expect(nonTailPrompt).not.toContain('TAIL POSE AND BODY LOCK')
        expect(nonTailPrompt).not.toContain('TAIL LOCALITY AND INTEGRATION')
    })

    it('lets SKIN_AND_COVERING redesign global covering without releasing anatomy or presentation', () => {
        const skinContract = buildAnatomyContract({
            bodyPlan: BODY_PLANS.QUADRUPED,
            evolutionTargetId: 'SKIN_AND_COVERING',
        })
        const skinPrompt = composeLockedDynamicFluxEvolutionPrompt({
            identity,
            anatomyContract: skinContract,
            microConcept: dynamicConcept,
        })

        expect(skinPrompt).toContain('SKIN AND COVERING AUTHORITY')
        expect(skinPrompt).toMatch(/across the entire existing anatomy/i)
        expect(skinPrompt).toMatch(/dominant palette, pigmentation, patterns, skin and surface texture/i)
        expect(skinPrompt).toMatch(/biological covering or material appearance/i)
        expect(skinPrompt).toMatch(/current source-image colour is mutable covering, not an individual identity invariant/i)
        expect(skinPrompt).not.toContain('body coloration')
        expect(skinPrompt).toMatch(
            /Preserve the individual identity, recognisable face, eye arrangement, head shape, topology, limb counts and roots, body silhouette and body shape, posture, stance, proportions, camera angle and facing direction/i,
        )
        expect(skinPrompt).toMatch(/Do not add, remove, relocate or reshape anatomical structures/i)
        expect(skinPrompt).toContain('Keep exactly 4 limbs, in 2 symmetrical pairs')
        expect(skinPrompt).toContain('Keep exactly 1 tail.')
        expect(skinPrompt).toContain('Keep the four-legged quadrupedal body plan.')
        expect(skinPrompt).toMatch(/exact same camera angle, 3\/4 view, facing direction and overall pose/i)
        expect(skinPrompt).toContain('New appendages or structural anatomy changes are invalid on this target.')
    })

    it('keeps the existing TAIL colour-preservation wording unchanged', () => {
        const tailContract = buildAnatomyContract({ bodyPlan: BODY_PLANS.QUADRUPED, evolutionTargetId: 'TAIL' })
        const tailPrompt = composeLockedDynamicFluxEvolutionPrompt({
            identity,
            anatomyContract: tailContract,
            microConcept: dynamicConcept,
        })

        expect(tailPrompt).toContain(
            'Only the minimum local anatomical continuity, tail-root integration or tightly linked target material or colour propagation is allowed.',
        )
        expect(tailPrompt).not.toContain('SKIN AND COVERING AUTHORITY')
    })

    it('states tail split topology from source through authorized change to output', () => {
        const tailSplitContract = buildAnatomyContract({
            bodyPlan: BODY_PLANS.QUADRUPED,
            evolutionTargetId: 'TAIL',
            capability: 'BODY_PLAN_MUTATION',
            bodyPlanMutationId: 'TAIL_SPLIT',
        })
        const prompt = composeLockedDynamicFluxEvolutionPrompt({
            identity,
            anatomyContract: tailSplitContract,
            microConcept: dynamicConcept,
        })

        expect(prompt).toMatch(/SOURCE ANATOMY[\s\S]*source creature currently has exactly 1 tail/i)
        expect(prompt).toMatch(
            /AUTHORIZED TOPOLOGY CHANGE[\s\S]*Change exactly 1 existing tail into 2 tails sharing the original tail root/i,
        )
        expect(prompt).toMatch(/OUTPUT ANATOMY[\s\S]*final creature must have exactly 2 tails/i)
        expect(prompt.indexOf('SOURCE ANATOMY')).toBeLessThan(prompt.indexOf('AUTHORIZED TOPOLOGY CHANGE'))
        expect(prompt.indexOf('AUTHORIZED TOPOLOGY CHANGE')).toBeLessThan(prompt.indexOf('OUTPUT ANATOMY'))
        expect(prompt).not.toContain('AUTHORIZED STRUCTURAL MUTATION: Split the tail into two tails')
    })

    it('makes an authorized structural mutation explicit without unlocking other topology changes', () => {
        const structuralContract = buildAnatomyContract({
            bodyPlan: BODY_PLANS.QUADRUPED,
            evolutionTargetId: 'LIMBS_AND_FEET',
            capability: 'BODY_PLAN_MUTATION',
            bodyPlanMutationId: 'ADD_LIMB_PAIR',
        })

        const prompt = composeLockedDynamicFluxEvolutionPrompt({
            identity,
            anatomyContract: structuralContract,
            microConcept: dynamicConcept,
        })

        expect(prompt).toContain('AUTHORIZED STRUCTURAL MUTATION')
        expect(prompt).toMatch(/Grow one additional symmetrical pair of limbs/i)
        expect(prompt).toContain('Keep exactly 6 limbs')
        expect(prompt).toContain('any topology change other than the authorized structural mutation')
    })
})
