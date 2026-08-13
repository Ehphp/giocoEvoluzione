import type { CreatureSemanticIdentity } from '../contracts.ts'
import { EVOLUTION_TARGET_BY_ID } from '../evolution-targets.ts'
import type { AnatomyContract } from './anatomy-contract.ts'
import { describeCurrentTargetState, describeOtherEstablishedEvolutions, type EvolutionLineageContext } from './evolution-lineage.ts'
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

export function composeFluxEvolutionPrompt(input: ComposeFluxPromptInput): string {
    const contract = input.anatomyContract
    const target = EVOLUTION_TARGET_BY_ID[contract.target]
    const structural = contract.capability === 'BODY_PLAN_MUTATION' && contract.structuralChange
    return [
        'CURRENT SOURCE IMAGE',
        'Edit the supplied source image. This is the same creature and the same individual. Keep the same pose, framing, composition and illustrated style. The source image is the only truth about how this creature currently looks.',
        'STRICT FRAMING',
        'FRAMING IS STRICT: show the entire creature from the highest anatomical point to every foot, claw, tail tip, wing tip, horn, shell edge and appendage. Nothing may touch or cross the canvas boundary. Keep the creature centered with at least 8-10% clear background margin on every side. If the mutation makes the creature larger or wider, zoom the camera out instead of cropping any anatomy. The full silhouette must remain fully visible inside the frame.',
        ...(input.framingAttempt && input.framingAttempt > 0 ? [`RETRY FRAMING OVERRIDE (attempt ${input.framingAttempt + 1}): make the creature visibly smaller in frame. Use a wider camera and extra clear background on every side; full body and every appendage must remain inside the canvas.`] : []),
        'ANATOMY CONTRACT',
        join(contract.topologyInvariants),
        `SELECTED TARGET: ${contract.target} — ${target.promptRegion}. This is the primary evolutionary driver: make the primary mutation clearly readable there. Coherent, subordinate secondary adaptations may extend to connected anatomy, posture, proportions, surfaces or structures only when they functionally or visually integrate that primary mutation. Do not redesign unrelated regions.`,
        'TARGET FREEDOM',
        join(contract.targetAllowances),
        ...(structural ? ['AUTHORIZED BODY-PLAN MUTATION', contract.structuralChange!] : []),
        'CURRENT TARGET STATE',
        describeCurrentTargetState(input.lineage),
        'OTHER ESTABLISHED EVOLUTIONS',
        describeOtherEstablishedEvolutions(input.lineage),
        'NEW MUTATION',
        `${input.microConcept.conceptName}: ${input.microConcept.mutationIdea}. Visual details: ${input.microConcept.visualDetails.join('; ')}.${input.microConcept.avoid?.length ? ` Avoid: ${input.microConcept.avoid.join('; ')}.` : ''}`,
        'PRESERVE',
        join(contract.preservationRules),
        `Preserve the identity of this individual: ${input.identity.identityFeatures.join('; ')}. ${input.identity.description}`,
        'BACKGROUND / TECHNICAL RULES',
        'Flat uniform medium-gray background. No gradient, glow, aura, halo, bloom, light spill, fog or atmospheric effect. Single isolated creature. No text, objects or environmental scene.',
        'FAILURE CONDITIONS',
        join(contract.failureConditions),
        'Glow, aura, halo, bloom, background gradient or light spill are invalid results.',
    ].join('\n\n')
}
