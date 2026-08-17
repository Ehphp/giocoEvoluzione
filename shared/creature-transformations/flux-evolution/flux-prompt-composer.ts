import type { CreatureSemanticIdentity } from '../contracts.ts'
import { EVOLUTION_TARGET_BY_ID } from '../evolution-targets.ts'
import type { AnatomyContract } from './anatomy-contract.ts'
import { describeCurrentTargetState, type EvolutionLineageContext } from './evolution-lineage.ts'
import type { FluxMicroConcept } from './micro-concept.ts'

export type ComposeFluxPromptInput = Readonly<{
    identity: CreatureSemanticIdentity
    anatomyContract: AnatomyContract
    microConcept: FluxMicroConcept
    lineage: EvolutionLineageContext
    /** Retries tighten an already-mandatory framing constraint. */
    framingAttempt?: number
}>

function join(items: readonly string[]): string {
    return items.filter(Boolean).join(' ')
}

function describeAvoid(avoid: readonly string[] | undefined): string {
    if (!avoid?.length) return ''
    const precise = avoid.map((item) => /\b(?:additional|extra|new)\s+(?:anatomical\s+)?structures?\b/i.test(item)
        ? 'independently rooted anatomical appendages or unrelated body structures outside the selected target'
        : item)
    return ` Avoid: ${precise.join('; ')}.`
}

function plural(count: number, singular: string, pluralForm: string): string {
    return count === 1 ? singular : pluralForm
}

function isTailStructuralMutation(contract: AnatomyContract): boolean {
    return contract.target === 'TAIL'
        && contract.capability === 'BODY_PLAN_MUTATION'
        && Boolean(contract.structuralChange)
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

export function composeMinimalFluxEvolutionPrompt(microConcept: FluxMicroConcept, framingAttempt = 0): string {
    const marginPercent = 10 + framingAttempt * 5
    return [
        'Edit the supplied source image as an evolution of the same creature and same individual, keeping its identity recognisable.',
        `Keep the source image's visual style. Show the complete creature fully inside the canvas, sized to leave at least ${marginPercent}% clear background margin on every side.`,
        'EVOLUTION:',
        `${microConcept.conceptName}: ${microConcept.mutationIdea}\nVisual details: ${microConcept.visualDetails.join('; ')}`,
    ].join('\n\n')
}

/** Historical full prompt retained for production compatibility and controlled comparisons. */
export function composeFluxEvolutionPromptV5(input: ComposeFluxPromptInput): string {
    const contract = input.anatomyContract
    const target = EVOLUTION_TARGET_BY_ID[contract.target]
    const structural = contract.capability === 'BODY_PLAN_MUTATION' && contract.structuralChange
    const mutableAppearance = input.identity.mutableVisualFeatures.length
        ? input.identity.mutableVisualFeatures.join('; ')
        : 'current surface appearance and coloration'
    return [
        'CURRENT SOURCE IMAGE',
        'Edit the supplied source image. This is the same creature and the same individual. Preserve pose, viewpoint, composition and illustrated style as closely as possible. A minimal reframing or subject-scale adjustment is authorized only when necessary to keep the complete creature and its mutated target inside the canvas.',
        'STRICT FRAMING',
        'FRAMING IS STRICT: show the entire creature from the highest anatomical point to every foot, claw, tail tip, wing tip, horn, shell edge and appendage. Nothing may touch or cross the canvas boundary. Keep the creature centered with at least 8-10% clear background margin on every side. If the mutation makes the creature larger or wider, zoom the camera out instead of cropping any anatomy. The full silhouette must remain fully visible inside the frame.',
        ...(input.framingAttempt && input.framingAttempt > 0 ? [`RETRY FRAMING OVERRIDE (attempt ${input.framingAttempt + 1}): make the creature visibly smaller in frame. Use a wider camera and extra clear background on every side; full body and every appendage must remain inside the canvas.`] : []),
        'ANATOMY CONTRACT',
        join(contract.topologyInvariants),
        `SELECTED TARGET: ${contract.target} — ${target.promptRegion}. This is the primary evolutionary target: make the primary mutation clearly readable there. Default to a local mutation. Preserve all unrelated anatomy by default. Introduce secondary adaptations only when they are necessary consequences of the primary mutation for biomechanical support, anatomical continuity, posture rebalancing, structural integration or tightly linked visual propagation. If none is necessary, modify only this target. Any secondary adaptation must be subordinate, less visually prominent and clearly derived from the primary mutation; do not redesign unrelated anatomy.`,
        'TARGET FREEDOM',
        join(contract.targetAllowances),
        'TARGET STRUCTURE BOUNDARY',
        'Structures integrated into and anchored to the selected target are allowed. Do not introduce independently rooted anatomical appendages, new anatomical roots, or unrelated body structures outside the selected target.',
        ...(structural ? ['AUTHORIZED BODY-PLAN MUTATION', contract.structuralChange!] : []),
        'CURRENT TARGET STATE',
        describeCurrentTargetState(input.lineage),
        'NEW MUTATION',
        `${input.microConcept.conceptName}: ${input.microConcept.mutationIdea}. Visual details: ${input.microConcept.visualDetails.join('; ')}.${describeAvoid(input.microConcept.avoid)}`,
        'MUTABLE APPEARANCE',
        `${mutableAppearance} are not identity invariants. Preserve the current coloration unless the NEW MUTATION expressly declares a biologically motivated, target-linked colour treatment; when declared, make it clearly visible only on the selected target or directly connected surface.`,
        'BIOLOGICAL PRIOR',
        'Prefer naturally grown animal anatomy and biological tissues. Evolutionary structures should look grown from the creature itself. Avoid manufactured, mechanical, metallic, technological or worn structures unless explicitly required by the concept. Carapaces, chitin, bone, keratin, scales, mineralized skin, spines and biological plates are valid when grown as part of the creature.',
        'PRESERVE',
        join(contract.preservationRules),
        `Preserve the identity of this individual: ${input.identity.identityFeatures.join('; ')}. ${input.identity.description}`,
        'BACKGROUND / TECHNICAL RULES',
        'Flat uniform medium-gray background. Surface-visible bioluminescent markings or coloration already present on the creature are allowed. No external glow, aura, halo, bloom, light spill, fog or atmospheric effect. Single isolated creature. No text, objects or environmental scene.',
        'FAILURE CONDITIONS',
        join(contract.failureConditions),
        'External glow, aura, halo, bloom, background gradient or light spill are invalid results; surface-visible bioluminescent markings or coloration are allowed.',
    ].join('\n\n')
}

function composeFluxEvolutionPromptWithFreedom(input: ComposeFluxPromptInput, expandedFreedom: boolean): string {
    const contract = input.anatomyContract
    const target = EVOLUTION_TARGET_BY_ID[contract.target]
    const structural = contract.capability === 'BODY_PLAN_MUTATION' && contract.structuralChange
    const bodyShapePresentationLock = contract.target === 'BODY_SHAPE' && !structural
    const tailPresentationLock = contract.target === 'TAIL'
    const tailStructural = isTailStructuralMutation(contract)
    const anatomyInvariants = tailStructural ? withoutTailInvariant(contract.topologyInvariants) : contract.topologyInvariants
    const mutableAppearance = input.identity.mutableVisualFeatures.length
        ? input.identity.mutableVisualFeatures.join('; ')
        : 'current surface appearance and coloration'
    return [
        'CURRENT SOURCE IMAGE',
        bodyShapePresentationLock
            ? 'Edit the supplied source image as the complete visual truth. Keep the same base pose, viewpoint, facing direction, overall orientation and composition. BODY_SHAPE changes must be achieved within this existing presentation, never by re-staging, rotating, tilting or otherwise reorienting the creature. A minimal reframing or subject-scale adjustment is authorized only when necessary to keep the complete creature and its mutated target inside the canvas.'
            : tailPresentationLock
                ? 'Edit the supplied source image as the complete visual truth. Preserve the original pose and body plan, viewpoint, facing direction, overall orientation and composition. A tail mutation must be achieved without a posture or stance change. A minimal reframing or subject-scale adjustment is authorized only when necessary to keep the complete creature and its mutated tail inside the canvas.'
            : expandedFreedom
                ? 'Edit the supplied source image as the complete visual truth. Keep its viewpoint and composition. Preserve the overall pose family, while allowing natural stance, posture and proportion adjustments that better express and biomechanically support the evolution. A minimal reframing or subject-scale adjustment is authorized only when necessary to keep the complete creature and its mutated target inside the canvas.'
                : 'Edit the supplied source image as the complete visual truth. Keep its viewpoint and composition. Preserve its pose by default, while allowing the slight stance or posture rebalancing expressly authorized below. A minimal reframing or subject-scale adjustment is authorized only when necessary to keep the complete creature and its mutated target inside the canvas.',
        'STRICT FRAMING',
        'FRAMING IS STRICT: show the entire creature from the highest anatomical point to every foot, claw, tail tip, wing tip, horn, shell edge and appendage. Nothing may touch or cross the canvas boundary. Keep the creature centered with at least 8-10% clear background margin on every side. If the mutation makes the creature larger or wider, zoom the camera out instead of cropping any anatomy. The full silhouette must remain fully visible inside the frame.',
        ...(input.framingAttempt && input.framingAttempt > 0 ? [`RETRY FRAMING OVERRIDE (attempt ${input.framingAttempt + 1}): make the creature visibly smaller in frame. Use a wider camera and extra clear background on every side; full body and every appendage must remain inside the canvas.`] : []),
        'HARD INVARIANTS',
        join(anatomyInvariants),
        `This must remain the same creature and the same individual, with recognisable identity: ${input.identity.identityFeatures.join('; ')}. ${input.identity.description}`,
        'Keep the same illustrated style and the flat uniform medium-gray technical background defined below.',
        'PRIMARY MUTATION AUTHORITY',
        `SELECTED TARGET: ${contract.target} — ${target.promptRegion}. This is the primary evolutionary focus. Within this target, the NEW MUTATION takes precedence over preserving local geometry, proportions, biological material, local silhouette and surface detail. Preservation rules protect identity, topology and non-target anatomy; they must not weaken, miniaturize or cosmetically reduce the requested target transformation. Keep the mutation anatomically focused on this target, but make its change substantial, clearly readable and morphologically significant. Here, local means a circumscribed anatomical origin, not a small, conservative or surface-level edit.`,
        'TARGET FREEDOM',
        join(contract.targetAllowances),
        ...tailSpecificPolicySections(contract),
        ...(bodyShapePresentationLock ? [
            'BODY-SHAPE PRESENTATION LOCK',
            'Reshape the trunk strongly through length, volume, chest and back mass, back line and mass distribution while preserving the same base pose, viewpoint, facing direction, overall orientation and composition. This target does not authorize a new stance, camera angle, rotation, tilt or re-staging. Make the body-form change readable through morphology inside the existing presentation.',
        ] : []),
        'MINIMUM VISUAL DELTA',
        'The selected target must show a clear, unequivocal difference that reads at normal gameplay scale. When the NEW MUTATION is morphological, texture, colour, markings, plates, ridges or other surface details alone do not satisfy it: the primary change must visibly alter the target form described by the concept.',
        'TARGET STRUCTURE BOUNDARY',
        'Structures integrated into and anchored to the selected target are allowed. Do not introduce independently rooted anatomical appendages, new anatomical roots, or unrelated body structures outside the selected target.',
        ...(tailStructural
            ? tailStructuralTopologySections(contract)
            : structural ? [
            'AUTHORIZED BODY-PLAN MUTATION',
            contract.structuralChange!,
            'MANDATORY VISIBLE STRUCTURAL RESULT',
            `The output must visibly realise this authorized body-plan change: ${contract.structuralChange!} This is mandatory, not optional. A result that preserves the source topology or presentation instead of visibly realising this structural mutation is invalid.`,
            ...(contract.bodyPlanMutationId === 'BIPEDAL_TRANSITION'
                ? ['The output must visibly read as an upright bipedal creature. A result that still reads as a quadruped is invalid. Do not preserve the quadrupedal pose from the source image.']
                : []),
        ] : []),
        'CURRENT TARGET STATE',
        describeCurrentTargetState(input.lineage),
        'NEW MUTATION',
        `${input.microConcept.conceptName}: ${input.microConcept.mutationIdea}. Visual details: ${input.microConcept.visualDetails.join('; ')}.${describeAvoid(input.microConcept.avoid)}`,
        'MUTABLE APPEARANCE',
        `${mutableAppearance} are not identity invariants. Preserve the current coloration unless the NEW MUTATION expressly declares a biologically motivated, target-linked colour treatment; when declared, make it clearly visible only on the selected target or directly connected surface.`,
        'BIOLOGICAL PRIOR',
        'Prefer naturally grown animal anatomy and biological tissues. Evolutionary structures should look grown from the creature itself. Avoid manufactured, mechanical, metallic, technological or worn structures unless explicitly required by the concept. Carapaces, chitin, bone, keratin, scales, mineralized skin, spines and biological plates are valid when grown as part of the creature.',
        'NON-TARGET PRESERVATION',
        bodyShapePresentationLock
            ? expandedFreedom
                ? 'Preserve non-target identity and core anatomy, not pixel-identical geometry. Coherent secondary changes may support the primary evolution through anatomical continuity, proportion adjustment, structural integration or target-linked visual propagation; they do not need to be strictly indispensable. Keep them subordinate and visibly derived from the primary mutation, within the existing pose and presentation. Do not create a second unrelated mutation or alter stance, facing, orientation, viewpoint or composition. If the target transformation changes the subject footprint, use only the authorized zoom-out instead of suppressing the mutation.'
                : 'Preserve non-target anatomy by default. Secondary changes are allowed only when necessary for biomechanical support, anatomical continuity, minimal proportion adjustment within the existing pose, structural integration or tightly derived propagation. Keep them subordinate and visibly derived from the primary mutation; do not redesign unrelated anatomy or alter pose, stance, facing, orientation, viewpoint or composition. If the target transformation changes the subject footprint, use only the authorized zoom-out instead of changing the creature presentation or suppressing the mutation.'
            : tailPresentationLock
                ? 'Preserve all non-tail anatomy exactly in its original presentation. Secondary changes are allowed only when necessary for local anatomical continuity, tail-root integration or tightly linked target material or colour propagation. Do not add supporting anatomy, rebalance posture or stance, redesign the torso or neck, or reposition limbs. If the tail needs more space, use only the authorized zoom-out.'
                : expandedFreedom
                ? 'Preserve non-target identity and core anatomy, not pixel-identical geometry. Coherent secondary changes may support the primary evolution through neighboring proportion changes, natural stance or posture rebalancing, supporting anatomy, structural integration and target-linked material or colour propagation; they do not need to be strictly indispensable. Keep them related to and less dominant than the primary mutation. Do not create a second unrelated mutation or violate the HARD INVARIANTS or TARGET STRUCTURE BOUNDARY. If the target transformation changes the subject footprint, use the authorized rebalancing and zoom-out instead of suppressing the mutation.'
                : 'Preserve non-target anatomy by default. Secondary changes are allowed only when necessary for biomechanical support, anatomical continuity, slight posture or stance rebalancing, secondary proportion adjustment, structural integration or tightly derived propagation. Keep them subordinate and visibly derived from the primary mutation; do not redesign unrelated anatomy. If the target transformation changes the subject footprint, use the authorized slight rebalancing and zoom-out instead of suppressing the mutation.',
        join(contract.preservationRules),
        'BACKGROUND / TECHNICAL RULES',
        'Flat uniform medium-gray background. Surface-visible bioluminescent markings or coloration already present on the creature are allowed. No external glow, aura, halo, bloom, light spill, fog or atmospheric effect. Single isolated creature. No text, objects or environmental scene.',
        'FAILURE CONDITIONS',
        join(contract.failureConditions),
        'External glow, aura, halo, bloom, background gradient or light spill are invalid results; surface-visible bioluminescent markings or coloration are allowed.',
    ].join('\n\n')
}

export function composeFluxEvolutionPrompt(input: ComposeFluxPromptInput): string {
    return composeFluxEvolutionPromptWithFreedom(input, true)
}

export function composeFluxEvolutionPromptV6(input: ComposeFluxPromptInput): string {
    return composeFluxEvolutionPromptWithFreedom(input, false)
}

function lockedTopologyInvariants(invariants: readonly string[]): readonly string[] {
    return invariants.map((invariant) => invariant.replace(
        ' Their relative visual positions may adapt naturally to authorized changes in body proportions or stance; no limb may migrate to a different anatomical region.',
        ' Keep every limb in its existing anatomical root and body region.',
    ))
}

function lockedTargetRules(contract: AnatomyContract): readonly string[] {
    // The locked shell owns presentation. Domain rules that explicitly grant a stance or camera
    // adjustment belong to the flexible FLUX composers, never to this diagnostic template.
    const rules = [...contract.targetAllowances, ...contract.preservationRules]
    if (contract.capability === 'BODY_PLAN_MUTATION') return rules
    return rules
        .filter((rule) => !/\b(?:stance|posture|orientation|viewpoint|camera|composition|rebalancing)\b/i.test(rule))
}

/**
 * Deterministic shell for the Seedream production contract. Structural mutations are behind a
 * server-side policy gate; when authorized, the prompt names the exact resulting topology.
 */
export function composeLockedDynamicFluxEvolutionPrompt(input: Omit<ComposeFluxPromptInput, 'lineage'>): string {
    const contract = input.anatomyContract
    const structural = contract.capability === 'BODY_PLAN_MUTATION'
    const tailPresentationLock = contract.target === 'TAIL'
    const tailStructural = isTailStructuralMutation(contract)
    const anatomyInvariants = tailStructural ? withoutTailInvariant(contract.topologyInvariants) : contract.topologyInvariants
    const target = EVOLUTION_TARGET_BY_ID[contract.target]
    const retryFraming = input.framingAttempt && input.framingAttempt > 0
        ? `RETRY FRAMING OVERRIDE (attempt ${input.framingAttempt + 1})\n\nMake the creature visibly smaller in frame. Use a wider camera and at least ${10 + input.framingAttempt * 5}% clear background margin around the complete silhouette. Do not crop, rotate or mirror the creature.`
        : null
    const targetRules = lockedTargetRules(contract)
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
            ...lockedTopologyInvariants(anatomyInvariants),
            ...(!tailStructural && structural && contract.structuralChange
                ? [`AUTHORIZED STRUCTURAL MUTATION: ${contract.structuralChange}`, 'Realize exactly this one topology change and no other topology change.']
                : []),
            'Keep the existing eye arrangement.',
            `Preserve the creature's distinctive identity: ${identity}.`,
        ].join('\n'),
        ...tailStructuralTopologySections(contract),
        `SELECTED TARGET: ${contract.target}`,
        [
            `The primary mutation is restricted to ${target.promptRegion}.`,
            'Structures belonging to this mutation must be anatomically integrated with and rooted in the selected target.',
            ...(targetRules.length ? ['Target-specific anatomical rules:', ...targetRules] : []),
            'Do not redesign unrelated anatomy.',
        ].join('\n'),
        ...tailSpecificPolicySections(contract),
        `NEW MUTATION — ${input.microConcept.conceptName}`,
        [
            input.microConcept.mutationIdea,
            'Visual details:',
            ...input.microConcept.visualDetails.map((detail) => `- ${detail}`),
            ...(input.microConcept.avoid?.length ? ['Avoid:', ...input.microConcept.avoid.map((item) => `- ${item}`)] : []),
            'These mutation details cannot override VIEWPOINT LOCK, STRICT FRAMING, ANATOMY LOCK or NON-TARGET PRESERVATION.',
        ].join('\n'),
        'BIOLOGICAL PRIOR',
        'Prefer living animal tissue and naturally grown anatomy.\n\nEvolutionary structures must look grown from the creature itself.\n\nNo metal, machinery, technology, manufactured accessories or artificial materials unless explicitly required by the mutation.',
        'NON-TARGET PRESERVATION',
        tailPresentationLock
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
            structural ? '- any topology change other than the authorized structural mutation' : '- unauthorized extra limbs',
            '- extra heads',
            '- extra faces',
            '- extra eyes',
            ...(tailPresentationLock ? ['- a tail interpreted as wings, dorsal fronds, back ornaments, unrelated fins or independently rooted appendages'] : []),
            '- artificial-looking structures',
            '- failure to make the requested mutation clearly visible',
            ...contract.failureConditions.map((condition) => `- ${condition}`),
        ].join('\n'),
    ].join('\n\n')
}
