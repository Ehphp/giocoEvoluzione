import { describe, expect, it } from 'vitest'

import { CREATURE_IDENTITY_REGISTRY } from '../../../supabase/functions/generate-creature-transformation/identity-registry.ts'
import type { PreviousCreatureTransformationSummary } from '../creature-visual-versions.ts'
import { BODY_PLAN_MUTATIONS, BODY_PLAN_MUTATION_BY_ID } from './body-plan-mutations.ts'
import {
    BODY_PLANS,
    CREATURE_BASE_BODY_PLAN_IDS,
    applyBodyPlanMutation,
    bodyPlanStructuralMutations,
    isEvolutionTargetAvailable,
    resolveBaseCreatureBodyPlan,
    resolveCanonicalBodyPlan,
} from './body-plan-registry.ts'
import { buildFluxEvolutionPlan, EvolutionPlanError, selectEvolutionCapability } from './evolution-plan.ts'

const HISTORY: PreviousCreatureTransformationSummary[] = []

describe('body plan registry', () => {
    it('declares a base body plan for every supported canonical identity', () => {
        expect(Object.keys(CREATURE_BASE_BODY_PLAN_IDS).sort()).toEqual(Object.keys(CREATURE_IDENTITY_REGISTRY).sort())
        expect(resolveBaseCreatureBodyPlan('VERDANT_HATCHLING')?.id).toBe('QUADRUPED')
        expect(resolveBaseCreatureBodyPlan('UNKNOWN_CREATURE')).toBeNull()
    })

    it('derives the available evolution targets from the body plan', () => {
        expect(isEvolutionTargetAvailable(BODY_PLANS.QUADRUPED, 'LIMBS_AND_FEET')).toBe(true)
        expect(isEvolutionTargetAvailable(BODY_PLANS.QUADRUPED, 'WINGS')).toBe(false)
        // A serpentine creature has no limbs, so it never offers a limb target.
        expect(isEvolutionTargetAvailable(BODY_PLANS.SERPENTINE, 'LIMBS_AND_FEET')).toBe(false)
        expect(BODY_PLANS.SERPENTINE.evolutionTargets).toContain('TAIL')
        // A winged creature gets a dedicated wing target; a tentacled one a tentacle target.
        expect(BODY_PLANS.WINGED_BIPED.evolutionTargets).toContain('WINGS')
        expect(BODY_PLANS.TENTACLED.evolutionTargets).toContain('TENTACLES')
        expect(BODY_PLANS.TENTACLED.evolutionTargets).not.toContain('LIMBS_AND_FEET')
    })

    it('keeps a body plan without limbs free of limb topology', () => {
        expect(BODY_PLANS.SERPENTINE.topology.forelimbCount + BODY_PLANS.SERPENTINE.topology.hindLimbCount).toBe(0)
        expect(BODY_PLANS.TENTACLED.topology.tentacleCount).toBeGreaterThan(0)
    })

    it('only allows the structural transitions its source plan declares', () => {
        expect(applyBodyPlanMutation(BODY_PLANS.QUADRUPED, 'ADD_LIMB_PAIR')?.id).toBe('SIX_LIMBED')
        expect(applyBodyPlanMutation(BODY_PLANS.QUADRUPED, 'BIPEDAL_TRANSITION')?.id).toBe('BIPED')
        expect(applyBodyPlanMutation(BODY_PLANS.QUADRUPED, 'FORELIMBS_TO_WINGS')?.id).toBe('WINGED_BIPED')
        expect(applyBodyPlanMutation(BODY_PLANS.SIX_LIMBED, 'FORELIMBS_TO_WINGS')?.id).toBe('WINGED_QUADRUPED')
        expect(applyBodyPlanMutation(BODY_PLANS.SIX_LIMBED, 'ADD_LIMB_PAIR')).toBeNull()
        expect(applyBodyPlanMutation(BODY_PLANS.SERPENTINE, 'ADD_LIMB_PAIR')).toBeNull()
    })

    it('keeps every catalogued mutation reachable and coherent with its target', () => {
        for (const mutation of BODY_PLAN_MUTATIONS) {
            const source = Object.values(BODY_PLANS).find((plan) => plan.structuralMutations.some((transition) => transition.mutationId === mutation.id))

            expect(source, mutation.id).toBeDefined()
            expect(source!.evolutionTargets).toContain(mutation.evolutionTargetId)
            expect(bodyPlanStructuralMutations(source!, mutation.evolutionTargetId)).toContain(BODY_PLAN_MUTATION_BY_ID[mutation.id])
        }
    })

    it('makes an adopted structural mutation the new canonical body plan', () => {
        const canonical = resolveCanonicalBodyPlan({ baseCreatureKey: 'VERDANT_HATCHLING', adoptedBodyPlanMutationIds: ['ADD_LIMB_PAIR'] })

        expect(canonical?.id).toBe('SIX_LIMBED')
        expect(canonical?.topology.forelimbCount).toBe(4)
        expect(resolveCanonicalBodyPlan({ baseCreatureKey: 'VERDANT_HATCHLING' })?.id).toBe('QUADRUPED')
        // A historical mutation the current plan cannot apply never breaks the resolution.
        expect(resolveCanonicalBodyPlan({ baseCreatureKey: 'VERDANT_HATCHLING', adoptedBodyPlanMutationIds: ['ADD_LIMB_PAIR', 'ADD_LIMB_PAIR'] })?.id).toBe('SIX_LIMBED')
    })
})

describe('flux evolution plan', () => {
    it('stays anatomical while the body-plan mutation capability is disabled', () => {
        const capability = selectEvolutionCapability({ bodyPlan: BODY_PLANS.QUADRUPED, evolutionTargetId: 'LIMBS_AND_FEET', bodyPlanMutationEnabled: false })

        expect(capability).toEqual({ capability: 'ANATOMICAL_MUTATION' })
        const plan = buildFluxEvolutionPlan({ bodyPlan: BODY_PLANS.QUADRUPED, evolutionTargetId: 'LIMBS_AND_FEET', previousTransformations: HISTORY, seed: 'k' })
        expect(plan.capability).toBe('ANATOMICAL_MUTATION')
        expect(plan.bodyPlanMutationId).toBeUndefined()
        expect(plan.resultBodyPlanId).toBe('QUADRUPED')
    })

    it('refuses an explicit structural mutation when the capability is disabled', () => {
        expect(() => selectEvolutionCapability({ bodyPlan: BODY_PLANS.QUADRUPED, evolutionTargetId: 'LIMBS_AND_FEET', bodyPlanMutationEnabled: false, requestedBodyPlanMutationId: 'ADD_LIMB_PAIR' }))
            .toThrowError(expect.objectContaining({ code: 'BODY_PLAN_MUTATION_NOT_AUTHORIZED' }))
        expect(() => buildFluxEvolutionPlan({ bodyPlan: BODY_PLANS.QUADRUPED, evolutionTargetId: 'LIMBS_AND_FEET', previousTransformations: HISTORY, requestedBodyPlanMutationId: 'ADD_LIMB_PAIR' }))
            .toThrowError(EvolutionPlanError)
    })

    it('plans an authorized structural mutation against the resulting body plan', () => {
        const plan = buildFluxEvolutionPlan({
            bodyPlan: BODY_PLANS.QUADRUPED, evolutionTargetId: 'LIMBS_AND_FEET', previousTransformations: HISTORY,
            bodyPlanMutationEnabled: true, requestedBodyPlanMutationId: 'ADD_LIMB_PAIR', seed: 'k',
        })

        expect(plan.capability).toBe('BODY_PLAN_MUTATION')
        expect(plan.bodyPlanMutationId).toBe('ADD_LIMB_PAIR')
        expect(plan.resultBodyPlanId).toBe('SIX_LIMBED')
        expect(plan.anatomyContract.topologyInvariants.join(' ')).toContain('Keep exactly 6 limbs')
    })

    it('never selects a structural mutation already adopted', () => {
        const capability = selectEvolutionCapability({
            bodyPlan: BODY_PLANS.QUADRUPED, evolutionTargetId: 'TAIL', bodyPlanMutationEnabled: true,
            adoptedBodyPlanMutationIds: ['TAIL_SPLIT'],
        })

        expect(capability).toEqual({ capability: 'ANATOMICAL_MUTATION' })
    })

    it('contracts the generation after adoption against the new canonical topology', () => {
        const adopted: PreviousCreatureTransformationSummary[] = [{
            versionNumber: 2, visualTraitId: 'LOCOMOTION_ADAPTATION', evolutionTargetId: 'LIMBS_AND_FEET',
            conceptName: 'Arti mediani', mutationIdea: 'un nuovo paio di arti', bodyPlanMutationId: 'ADD_LIMB_PAIR',
        }]
        const canonical = resolveCanonicalBodyPlan({ baseCreatureKey: 'VERDANT_HATCHLING', adoptedBodyPlanMutationIds: ['ADD_LIMB_PAIR'] })!
        const plan = buildFluxEvolutionPlan({ bodyPlan: canonical, evolutionTargetId: 'LIMBS_AND_FEET', previousTransformations: adopted, seed: 'next' })

        expect(plan.bodyPlanId).toBe('SIX_LIMBED')
        expect(plan.capability).toBe('ANATOMICAL_MUTATION')
        expect(plan.anatomyContract.topologyInvariants.join(' ')).toContain('Keep exactly 6 limbs, in 3 symmetrical pairs')
        expect(plan.lineage.currentTargetState.map((entry) => entry.conceptName)).toEqual(['Arti mediani'])
    })

    it('refuses a target the body plan does not offer', () => {
        expect(() => buildFluxEvolutionPlan({ bodyPlan: BODY_PLANS.SERPENTINE, evolutionTargetId: 'LIMBS_AND_FEET', previousTransformations: HISTORY }))
            .toThrowError(expect.objectContaining({ code: 'EVOLUTION_TARGET_NOT_AVAILABLE' }))
    })
})
