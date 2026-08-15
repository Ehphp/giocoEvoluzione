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

export function composeFluxEvolutionPrompt(input: ComposeFluxPromptInput): string {
    const contract = input.anatomyContract
    const target = EVOLUTION_TARGET_BY_ID[contract.target]
    const structural = contract.capability === 'BODY_PLAN_MUTATION' && contract.structuralChange
    const mutableAppearance = input.identity.mutableVisualFeatures.length
        ? input.identity.mutableVisualFeatures.join('; ')
        : 'current surface appearance and coloration'
    return [
        'CURRENT SOURCE IMAGE',
        'Edit the supplied source image as the complete visual truth. Keep its viewpoint and composition. Preserve its pose by default, while allowing the slight stance or posture rebalancing expressly authorized below. A minimal reframing or subject-scale adjustment is authorized only when necessary to keep the complete creature and its mutated target inside the canvas.',
        'STRICT FRAMING',
        'FRAMING IS STRICT: show the entire creature from the highest anatomical point to every foot, claw, tail tip, wing tip, horn, shell edge and appendage. Nothing may touch or cross the canvas boundary. Keep the creature centered with at least 8-10% clear background margin on every side. If the mutation makes the creature larger or wider, zoom the camera out instead of cropping any anatomy. The full silhouette must remain fully visible inside the frame.',
        ...(input.framingAttempt && input.framingAttempt > 0 ? [`RETRY FRAMING OVERRIDE (attempt ${input.framingAttempt + 1}): make the creature visibly smaller in frame. Use a wider camera and extra clear background on every side; full body and every appendage must remain inside the canvas.`] : []),
        'HARD INVARIANTS',
        join(contract.topologyInvariants),
        `This must remain the same creature and the same individual, with recognisable identity: ${input.identity.identityFeatures.join('; ')}. ${input.identity.description}`,
        'Keep the same illustrated style and the flat uniform medium-gray technical background defined below.',
        'PRIMARY MUTATION AUTHORITY',
        `SELECTED TARGET: ${contract.target} — ${target.promptRegion}. This is the primary evolutionary focus. Within this target, the NEW MUTATION takes precedence over preserving local geometry, proportions, biological material, local silhouette and surface detail. Preservation rules protect identity, topology and non-target anatomy; they must not weaken, miniaturize or cosmetically reduce the requested target transformation. Keep the mutation anatomically focused on this target, but make its change substantial, clearly readable and morphologically significant. Here, local means a circumscribed anatomical origin, not a small, conservative or surface-level edit.`,
        'TARGET FREEDOM',
        join(contract.targetAllowances),
        'MINIMUM VISUAL DELTA',
        'The selected target must show a clear, unequivocal difference that reads at normal gameplay scale. When the NEW MUTATION is morphological, texture, colour, markings, plates, ridges or other surface details alone do not satisfy it: the primary change must visibly alter the target form described by the concept.',
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
        'NON-TARGET PRESERVATION',
        'Preserve non-target anatomy by default. Secondary changes are allowed only when necessary for biomechanical support, anatomical continuity, slight posture or stance rebalancing, secondary proportion adjustment, structural integration or tightly derived propagation. Keep them subordinate and visibly derived from the primary mutation; do not redesign unrelated anatomy. If the target transformation changes the subject footprint, use the authorized slight rebalancing and zoom-out instead of suppressing the mutation.',
        join(contract.preservationRules),
        'BACKGROUND / TECHNICAL RULES',
        'Flat uniform medium-gray background. Surface-visible bioluminescent markings or coloration already present on the creature are allowed. No external glow, aura, halo, bloom, light spill, fog or atmospheric effect. Single isolated creature. No text, objects or environmental scene.',
        'FAILURE CONDITIONS',
        join(contract.failureConditions),
        'External glow, aura, halo, bloom, background gradient or light spill are invalid results; surface-visible bioluminescent markings or coloration are allowed.',
    ].join('\n\n')
}
