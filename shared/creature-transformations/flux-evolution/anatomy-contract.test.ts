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
        expect(allowances).not.toMatch(/add(ing)? plates/i)
        expect(contract.topologyInvariants.join(' ')).toContain('Keep exactly 4 limbs, in 2 symmetrical pairs, at their current attachment points.')
        expect(contract.failureConditions.join(' ')).toMatch(/New limbs, new tails, new heads or new dorsal appendages are invalid/i)
    })

    it('DORSAL_STRUCTURES allows dorsal structures while other regions stay as they are', () => {
        const contract = contractFor('DORSAL_STRUCTURES')

        expect(contract.targetAllowances.join(' ')).toMatch(/spines, crests, ridges, fins, plates, membranes, sails or humps/i)
        expect(contract.preservationRules.join(' ')).toMatch(/Trunk volume and body proportions, head, face, limbs and tail keep their current shape/i)
        expect(contract.failureConditions.join(' ')).toMatch(/no other region may be reshaped to host them/i)
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
