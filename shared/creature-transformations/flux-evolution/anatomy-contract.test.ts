import { describe, expect, it } from 'vitest'

import { EVOLUTION_TARGET_IDS } from '../evolution-targets.ts'
import { AnatomyContractError, buildAnatomyContract, type AnatomyContract } from './anatomy-contract.ts'
import { BODY_PLANS } from './body-plan-registry.ts'

const quadruped = BODY_PLANS.QUADRUPED

function contractFor(target: Parameters<typeof buildAnatomyContract>[0]['evolutionTargetId'], bodyPlan = quadruped): AnatomyContract {
    return buildAnatomyContract({ bodyPlan, evolutionTargetId: target })
}

function text(contract: AnatomyContract): string {
    return [...contract.topologyInvariants, ...contract.targetAllowances, ...contract.preservationRules, ...contract.failureConditions].join(' ')
}

describe('anatomy contract', () => {
    it('builds a coherent contract for every target offered by a body plan', () => {
        for (const bodyPlan of Object.values(BODY_PLANS)) {
            for (const target of bodyPlan.evolutionTargets) {
                const contract = buildAnatomyContract({ bodyPlan, evolutionTargetId: target })

                expect(contract.target).toBe(target)
                expect(contract.capability).toBe('ANATOMICAL_MUTATION')
                expect(contract.bodyPlanId).toBe(bodyPlan.id)
                expect(contract.resultBodyPlanId).toBe(bodyPlan.id)
                expect(contract.topologyInvariants.length).toBeGreaterThan(0)
                expect(contract.targetAllowances.length).toBeGreaterThan(1)
                expect(contract.preservationRules.length).toBeGreaterThan(0)
                expect(contract.failureConditions.length).toBeGreaterThan(0)
                expect(contract.structuralChange).toBeUndefined()
            }
        }
    })

    it('refuses a target the current body plan does not offer', () => {
        expect(() => buildAnatomyContract({ bodyPlan: BODY_PLANS.SERPENTINE, evolutionTargetId: 'LIMBS_AND_FEET' }))
            .toThrowError(expect.objectContaining({ code: 'EVOLUTION_TARGET_NOT_AVAILABLE' }))
        expect(() => buildAnatomyContract({ bodyPlan: quadruped, evolutionTargetId: 'WINGS' }))
            .toThrowError(expect.objectContaining({ code: 'EVOLUTION_TARGET_NOT_AVAILABLE' }))
    })

    it('BODY_SHAPE authorizes strong morphological change but never new limbs', () => {
        const contract = contractFor('BODY_SHAPE')
        const allowances = contract.targetAllowances.join(' ')

        expect(allowances).toMatch(/trunk length/i)
        expect(allowances).toMatch(/volume/i)
        expect(allowances).toMatch(/silhouette/i)
        expect(allowances).toMatch(/longer, shorter, heavier, leaner/i)
        expect(contract.failureConditions.join(' ')).toMatch(/Plates, crests or spines may only be necessary, subordinate secondary adaptations/i)
        expect(contract.topologyInvariants.join(' ')).toContain('Keep exactly 4 limbs, in 2 symmetrical pairs, at their current attachment points.')
        expect(contract.failureConditions.join(' ')).toMatch(/New limbs, new tails or new heads are invalid/i)
    })

    it('defaults to preserving unrelated anatomy while allowing only necessary secondary adaptations', () => {
        const contract = contractFor('TAIL')

        expect(contract.preservationRules.join(' ')).toMatch(/primary evolutionary target/i)
        expect(contract.preservationRules.join(' ')).toMatch(/Preserve all unrelated anatomy by default/i)
        expect(contract.preservationRules.join(' ')).toMatch(/only when they are necessary consequences/i)
        expect(contract.preservationRules.join(' ')).toMatch(/If the primary mutation works on its own, change only the selected target/i)
        expect(contract.preservationRules.join(' ')).toMatch(/no gratuitous changes outside the selected target/i)
        expect(contract.failureConditions.join(' ')).toMatch(/primary mutation must be clearly readable on the selected target/i)
        expect(contract.failureConditions.join(' ')).toMatch(/gratuitous redesign outside the selected target is invalid/i)
        expect(contract.failureConditions.join(' ')).not.toMatch(/Only the selected target may carry the new mutation/i)
    })

    it('DORSAL_STRUCTURES allows only necessary, subordinate support changes', () => {
        const contract = contractFor('DORSAL_STRUCTURES')

        expect(contract.targetAllowances.join(' ')).toMatch(/spines, crests, ridges, fins, plates, membranes, sails or humps/i)
        expect(contract.preservationRules.join(' ')).toMatch(/Preserve all unrelated anatomy by default/i)
        expect(contract.preservationRules.join(' ')).toMatch(/only when they are necessary consequences/i)
        expect(contract.failureConditions.join(' ')).toMatch(/may not create a new dominant mutation elsewhere/i)
    })

    it('LIMBS_AND_FEET keeps the limb count in a normal mutation', () => {
        const contract = contractFor('LIMBS_AND_FEET')

        expect(contract.topologyInvariants.join(' ')).toContain('Keep exactly 4 limbs, in 2 symmetrical pairs, at their current attachment points.')
        expect(contract.preservationRules.join(' ')).toMatch(/limb count and every limb attachment point stay exactly as they are/i)
        expect(contract.failureConditions.join(' ')).toMatch(/Any added, removed, duplicated or relocated limb is invalid/i)
        // The limbs are one system: the contract never distinguishes fore from hind.
        expect(text(contract)).not.toMatch(/forelimb|hind limb/i)
    })

    it('HEAD_AND_CROWN permits horns and cranial structures while keeping one face', () => {
        const contract = contractFor('HEAD_AND_CROWN')
        const allowances = contract.targetAllowances.join(' ')

        expect(allowances).toMatch(/horns/i)
        expect(allowances).toMatch(/antlers/i)
        expect(allowances).toMatch(/antennae/i)
        expect(allowances).toMatch(/crests/i)
        expect(allowances).toMatch(/ears/i)
        expect(allowances).toMatch(/not a pixel-identical head/i)
        expect(contract.failureConditions.join(' ')).toMatch(/second head/i)
    })

    it('keeps the taxonomy and the contract catalogue aligned', () => {
        for (const target of EVOLUTION_TARGET_IDS) {
            const bodyPlan = Object.values(BODY_PLANS).find((plan) => plan.evolutionTargets.includes(target))

            expect(bodyPlan, target).toBeDefined()
            expect(() => buildAnatomyContract({ bodyPlan: bodyPlan!, evolutionTargetId: target })).not.toThrow()
        }
    })

    describe('body-plan mutation capability', () => {
        it('changes the topology only when the capability is explicitly authorized', () => {
            const structural = buildAnatomyContract({ bodyPlan: quadruped, evolutionTargetId: 'LIMBS_AND_FEET', capability: 'BODY_PLAN_MUTATION', bodyPlanMutationId: 'ADD_LIMB_PAIR' })

            expect(structural.capability).toBe('BODY_PLAN_MUTATION')
            expect(structural.resultBodyPlanId).toBe('SIX_LIMBED')
            expect(structural.structuralChange).toMatch(/one additional symmetrical pair of limbs/i)
            expect(structural.topologyInvariants.join(' ')).toContain('Keep exactly 6 limbs, in 3 symmetrical pairs')
            expect(structural.failureConditions.join(' ')).toMatch(/Only the structural change described above may alter the topology/i)
            expect(structural.failureConditions.join(' ')).not.toMatch(/Adding, removing, duplicating or relocating heads, limbs/i)
        })

        it('rejects a structural mutation without the capability, with the wrong target or outside the body plan', () => {
            expect(() => buildAnatomyContract({ bodyPlan: quadruped, evolutionTargetId: 'LIMBS_AND_FEET', bodyPlanMutationId: 'ADD_LIMB_PAIR' }))
                .toThrowError(expect.objectContaining({ code: 'BODY_PLAN_MUTATION_NOT_AUTHORIZED' }))
            expect(() => buildAnatomyContract({ bodyPlan: quadruped, evolutionTargetId: 'LIMBS_AND_FEET', capability: 'BODY_PLAN_MUTATION' }))
                .toThrowError(AnatomyContractError)
            expect(() => buildAnatomyContract({ bodyPlan: quadruped, evolutionTargetId: 'TAIL', capability: 'BODY_PLAN_MUTATION', bodyPlanMutationId: 'ADD_LIMB_PAIR' }))
                .toThrowError(expect.objectContaining({ code: 'BODY_PLAN_MUTATION_NOT_AUTHORIZED' }))
            expect(() => buildAnatomyContract({ bodyPlan: BODY_PLANS.WINGED_BIPED, evolutionTargetId: 'LIMBS_AND_FEET', capability: 'BODY_PLAN_MUTATION', bodyPlanMutationId: 'ADD_LIMB_PAIR' }))
                .toThrowError(expect.objectContaining({ code: 'BODY_PLAN_MUTATION_NOT_AUTHORIZED' }))
        })
    })
})
