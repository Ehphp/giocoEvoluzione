import type { CreatureSemanticIdentity } from '../contracts.ts'
import { EVOLUTION_TARGET_BY_ID } from '../evolution-targets.ts'
import type { AnatomyContract } from './anatomy-contract.ts'
import { describeCurrentTargetState, describeOtherEstablishedEvolutions, describeUnclassifiedLegacyEvolutions, type EvolutionLineageContext } from './evolution-lineage.ts'
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
        'OTHER ESTABLISHED EVOLUTIONS',
        describeOtherEstablishedEvolutions(input.lineage),
        'LEGACY EVOLUTIONS WITH UNKNOWN TARGET',
        describeUnclassifiedLegacyEvolutions(input.lineage),
        'NEW MUTATION',
        `${input.microConcept.conceptName}: ${input.microConcept.mutationIdea}. Visual details: ${input.microConcept.visualDetails.join('; ')}.${describeAvoid(input.microConcept.avoid)}`,
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
