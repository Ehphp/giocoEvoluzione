import type { CreatureSemanticIdentity } from '../contracts.ts'
import type { PreviousCreatureTransformationSummary } from '../creature-visual-versions.ts'
import type { EvolutionTargetId } from '../evolution-targets.ts'
import type { AnatomyContract } from './anatomy-contract.ts'
import type { FluxMicroConcept } from './micro-concept.ts'

export type ComposeFluxPromptInput = Readonly<{
    identity: CreatureSemanticIdentity
    evolutionTargetId: EvolutionTargetId
    anatomyContract: AnatomyContract
    microConcept: FluxMicroConcept
    previousTransformations: readonly PreviousCreatureTransformationSummary[]
}>

function join(items: readonly string[]): string {
    return items.filter(Boolean).join(' ')
}

export function composeFluxEvolutionPrompt(input: ComposeFluxPromptInput): string {
    const previous = input.previousTransformations.map((entry) => `${entry.evolutionTargetId ?? entry.visualTraitId}: ${entry.conceptName}${entry.mutationIdea ? ` (${entry.mutationIdea})` : ''}`)
    return [
        'SOURCE / SAME INDIVIDUAL',
        'EDIT THE SUPPLIED SOURCE IMAGE. This is the exact same creature and the exact same individual. Keep the same pose, framing, composition and illustrated style.',
        'HARD ANATOMY CONTRACT',
        join(input.anatomyContract.invariants),
        join(input.anatomyContract.targetRules),
        `SELECTED TARGET: ${input.evolutionTargetId}. Only this target may receive the new dominant mutation.`,
        'MICRO CONCEPT',
        `${input.microConcept.conceptName}: ${input.microConcept.mutationIdea}. Visual details: ${input.microConcept.visualDetails.join('; ')}.${input.microConcept.avoid?.length ? ` Avoid: ${input.microConcept.avoid.join('; ')}.` : ''}`,
        'PREVIOUS MUTATIONS TO PRESERVE',
        previous.length ? `Keep prior adopted mutations visible. Develop an existing mutation on this target rather than replacing it. ${previous.join('; ')}.` : 'There are no prior adopted mutations.',
        'IDENTITY TO PRESERVE',
        `Preserve ${input.identity.identityFeatures.join('; ')}. ${input.identity.description}`,
        'BACKGROUND / TECHNICAL RULES',
        'Flat uniform medium-gray background. No gradient, glow, aura, halo, bloom, light spill, fog or atmospheric effect. Single isolated creature. No text, objects or environmental scene.',
        'FAILURE CONDITIONS',
        join(input.anatomyContract.failureConditions),
        'Glow, aura, halo, bloom, background gradient, light spill, unrelated anatomy changes, or unnecessary pose/composition changes are invalid results.',
    ].join('\n\n')
}
