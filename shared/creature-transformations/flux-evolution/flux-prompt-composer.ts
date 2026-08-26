import type { CreatureSemanticIdentity } from '../contracts.ts'
import { EVOLUTION_TARGET_BY_ID } from '../evolution-targets.ts'
import type { AnatomyContract } from './anatomy-contract.ts'
import type { FluxMicroConcept } from './micro-concept.ts'

export type ComposeFluxPromptInput = Readonly<{
    identity: CreatureSemanticIdentity
    anatomyContract: AnatomyContract
    microConcept: FluxMicroConcept
    /** Retries tighten an already-mandatory framing constraint. */
    framingAttempt?: number
}>

function plural(count: number, singular: string, pluralForm: string): string {
    return count === 1 ? singular : pluralForm
}

function isTailStructuralMutation(contract: AnatomyContract): boolean {
    return (
        contract.target === 'TAIL' && contract.capability === 'BODY_PLAN_MUTATION' && Boolean(contract.structuralChange)
    )
}

function withoutTailInvariant(invariants: readonly string[]): readonly string[] {
    return invariants.filter((invariant) => !/\btails?\b/i.test(invariant))
}

function tailStructuralTopologySections(contract: AnatomyContract): readonly string[] {
    if (!isTailStructuralMutation(contract)) return []
    const sourceCount = contract.sourceTopology.tailCount
    const outputCount = contract.resultTopology.tailCount
    return [
        'SOURCE ANATOMY',
        `The source creature currently has exactly ${sourceCount} ${plural(sourceCount, 'tail', 'tails')}.`,
        'AUTHORIZED TOPOLOGY CHANGE',
        `Change exactly ${sourceCount} existing ${plural(sourceCount, 'tail', 'tails')} into ${outputCount} ${plural(outputCount, 'tail', 'tails')} sharing the original tail root.`,
        'OUTPUT ANATOMY',
        `The final creature must have exactly ${outputCount} ${plural(outputCount, 'tail', 'tails')}, all clearly readable as tails and all rooted at the original tail attachment point.`,
    ]
}

function tailSpecificPolicySections(contract: AnatomyContract): readonly string[] {
    if (contract.target !== 'TAIL') return []
    return [
        'TAIL POSE AND BODY LOCK',
        'Preserve the original pose and body plan. Do not make the creature taller, more upright, more serpentine or substantially elongated. Do not lengthen the neck, redesign the torso or reposition the limbs. A tail mutation does not authorize a posture or stance change.',
        'TAIL LOCALITY AND INTEGRATION',
        'Keep the mutation confined to the tail and the minimum local anatomical integration required at the tail root. Every resulting tail must read clearly as a tail, never as wings, dorsal fronds, back ornaments, unrelated fins or independently rooted appendages.',
        'TAIL NON-TARGET PRESERVATION',
        'Preserve the head, face, neck proportions, torso proportions, limb roots, limb placement, original stance and overall body presentation. Do not redesign the rest of the creature to present the tail mutation.',
    ]
}

function lockedTopologyInvariants(invariants: readonly string[]): readonly string[] {
    return invariants.map((invariant) =>
        invariant.replace(
            ' Their relative visual positions may adapt naturally to authorized changes in body proportions or stance; no limb may migrate to a different anatomical region.',
            ' Keep every limb in its existing anatomical root and body region.',
        ),
    )
}

function targetRules(contract: AnatomyContract): readonly string[] {
    const rules = [...contract.targetAllowances, ...contract.preservationRules]
    if (contract.bodyPlanMutationId !== 'BIPEDAL_TRANSITION') return rules
    return rules.map((rule) =>
        rule.replace(
            ' This target is a change of body form, not an added plate or crest or a new presentation of the creature.',
            ' This target is a change of body form, not an added plate or crest.',
        ),
    )
}

/**
 * Deterministic shell for the Seedream production contract. Structural mutations are behind a
 * server-side policy gate; when authorized, the prompt names the exact resulting topology.
 */
export function composeLockedDynamicFluxEvolutionPrompt(input: ComposeFluxPromptInput): string {
    const contract = input.anatomyContract
    const structural = contract.capability === 'BODY_PLAN_MUTATION'
    const tailPresentationLock = contract.target === 'TAIL'
    const tailStructural = isTailStructuralMutation(contract)
    const anatomyInvariants = tailStructural
        ? withoutTailInvariant(contract.topologyInvariants)
        : contract.topologyInvariants
    const target = EVOLUTION_TARGET_BY_ID[contract.target]
    const retryFraming =
        input.framingAttempt && input.framingAttempt > 0
            ? `RETRY FRAMING OVERRIDE (attempt ${input.framingAttempt + 1})\n\nMake the creature visibly smaller in frame. Use a wider camera and at least ${10 + input.framingAttempt * 5}% clear background margin around the complete silhouette. Do not crop, rotate or mirror the creature.`
            : null
    const selectedTargetRules = targetRules(contract)
    const identity = input.identity.identityFeatures.length
        ? input.identity.identityFeatures.join('; ')
        : input.identity.description

    return [
        'CURRENT SOURCE IMAGE',
        'Edit the supplied source image as the visual truth.\nThis is the same creature and the same individual.',
        'VIEWPOINT LOCK',
        tailPresentationLock
            ? 'Preserve the exact same camera angle, 3/4 view, facing direction, overall pose and body plan as the source image.\n\nDo not rotate the creature toward the camera.\nDo not rotate it into profile.\nDo not turn it toward the opposite side.\nDo not mirror the subject.\n\nDo not change posture, stance, neck length, torso proportions or limb placement.\n\nOnly minimal zoom-out or reframing is allowed when required to keep the entire creature inside the canvas.'
            : structural
              ? 'Preserve the same camera angle, 3/4 view, facing direction and overall presentation as the source image.\n\nDo not rotate the creature toward the camera.\nDo not rotate it into profile.\nDo not turn it toward the opposite side.\nDo not mirror the subject.\n\nOnly the posture and silhouette changes required by the authorized structural mutation are allowed.\n\nOnly minimal zoom-out or reframing is allowed when required to keep the entire creature inside the canvas.'
              : 'Preserve the exact same camera angle, 3/4 view, facing direction and overall pose as the source image.\n\nDo not rotate the creature toward the camera.\nDo not rotate it into profile.\nDo not turn it toward the opposite side.\nDo not mirror the subject.\n\nThe mutation must be achieved without changing how the creature is oriented.\n\nOnly minimal zoom-out or reframing is allowed when required to keep the entire creature inside the canvas.',
        'STRICT FRAMING',
        'Show the entire creature and every appendage.\n\nNothing may touch or cross the canvas boundary.\n\nKeep at least 8-10% clear background margin around the complete silhouette.\n\nIf the mutation requires more space, zoom out instead of cropping or rotating the creature.',
        ...(retryFraming ? [retryFraming] : []),
        'ANATOMY LOCK',
        [
            ...(structural ? anatomyInvariants : lockedTopologyInvariants(anatomyInvariants)),
            ...(!tailStructural && structural && contract.structuralChange
                ? [
                      `AUTHORIZED STRUCTURAL MUTATION: ${contract.structuralChange}`,
                      'Realize exactly this one topology change and no other topology change.',
                  ]
                : []),
            'Keep the existing eye arrangement.',
            `Preserve the creature's distinctive identity: ${identity}.`,
        ].join('\n'),
        ...tailStructuralTopologySections(contract),
        `SELECTED TARGET: ${contract.target}`,
        [
            `The primary mutation is restricted to ${target.promptRegion}.`,
            'Structures belonging to this mutation must be anatomically integrated with and rooted in the selected target.',
            ...(selectedTargetRules.length ? ['Target-specific anatomical rules:', ...selectedTargetRules] : []),
            'Do not redesign unrelated anatomy.',
        ].join('\n'),
        ...tailSpecificPolicySections(contract),
        `NEW MUTATION — ${input.microConcept.conceptName}`,
        [
            input.microConcept.mutationIdea,
            'Visual details:',
            ...input.microConcept.visualDetails.map((detail) => `- ${detail}`),
            ...(input.microConcept.avoid?.length
                ? ['Avoid:', ...input.microConcept.avoid.map((item) => `- ${item}`)]
                : []),
            'These mutation details cannot override VIEWPOINT LOCK, STRICT FRAMING, ANATOMY LOCK or NON-TARGET PRESERVATION.',
        ].join('\n'),
        'BIOLOGICAL PRIOR',
        'Prefer living animal tissue and naturally grown anatomy.\n\nEvolutionary structures must look grown from the creature itself.\n\nNo metal, machinery, technology, manufactured accessories or artificial materials unless explicitly required by the mutation.',
        'NON-TARGET PRESERVATION',
        contract.target === 'SKIN_AND_COVERING'
            ? 'SKIN AND COVERING AUTHORITY\n\nThe selected target may redesign the skin and body covering across the entire existing anatomy. You may globally change the dominant palette, pigmentation, patterns, skin and surface texture, and biological covering or material appearance on the head, neck, torso, limbs and tail. The current source-image colour is mutable covering, not an individual identity invariant for this target.\n\nANATOMY AND PRESENTATION LOCK\n\nPreserve the individual identity, recognisable face, eye arrangement, head shape, topology, limb counts and roots, body silhouette and body shape, posture, stance, proportions, camera angle and facing direction. Do not add, remove, relocate or reshape anatomical structures. The covering must follow the existing anatomy.'
            : tailPresentationLock
            ? 'Preserve the head, face, neck proportions, torso proportions, limb roots, limb placement, original stance and overall body presentation.\n\nDo not redesign the creature to present the tail mutation.\n\nOnly the minimum local anatomical continuity, tail-root integration or tightly linked target material or colour propagation is allowed.'
            : structural
              ? 'Preserve unrelated body regions by default.\n\nDo not redesign anatomy outside the authorized structural change.\n\nOnly the supporting integration required by that exact mutation is allowed.'
              : 'Preserve unrelated body regions by default.\n\nDo not redesign unrelated limbs, tail, face, body coloration or pose.\n\nOnly minor local anatomical integration required by the selected mutation is allowed.',
        'BACKGROUND',
        'Flat uniform medium-gray technical background.\n\nSingle isolated creature.\n\nNo objects, scenery, text, aura, glow, bloom, fog, light spill or background gradient.',
        'INVALID RESULT IF',
        [
            tailPresentationLock
                ? 'The creature changes its original pose, stance, body plan, neck length, torso proportions, limb placement, camera angle, facing direction or overall presentation.'
                : structural
                  ? 'The creature becomes front-facing, profile-facing, mirrored or turned toward the opposite direction. The authorized posture and silhouette change is allowed; a camera or facing change is not.'
                  : 'The creature becomes front-facing, profile-facing, mirrored, turned toward the opposite direction, or otherwise changes its original presentation.',
            'Also invalid:',
            '- cropped anatomy',
            structural
                ? '- any topology change other than the authorized structural mutation'
                : '- unauthorized extra limbs',
            '- extra heads',
            '- extra faces',
            '- extra eyes',
            ...(tailPresentationLock
                ? [
                      '- a tail interpreted as wings, dorsal fronds, back ornaments, unrelated fins or independently rooted appendages',
                  ]
                : []),
            '- artificial-looking structures',
            '- failure to make the requested mutation clearly visible',
            ...contract.failureConditions.map((condition) => `- ${condition}`),
        ].join('\n'),
    ].join('\n\n')
}
