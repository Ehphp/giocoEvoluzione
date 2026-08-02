import type { CreatureTransformationConcept } from './concepts.ts'
import type { CreatureSemanticIdentity } from './contracts.ts'
import type { CreatureRenderSpecification } from './render-specifications.ts'
import type { VisualTraitDefinition } from './visual-traits.ts'
import {
    BODY_AREA_PROMPT_LABELS,
    describeVisualTraitLimits,
    INTENSITY_PROMPT_LABELS,
    MUTATION_ARCHETYPE_PROMPT_LABELS,
} from './prompt-labels.ts'
import { formatPromptList, uniquePromptItems, withTerminalPunctuation } from './prompt-normalization.ts'

export const CREATURE_PROMPT_TEMPLATE_VERSION = 'creature-transformation-v1' as const

export type CreaturePromptTemplateVersion = typeof CREATURE_PROMPT_TEMPLATE_VERSION

export type CreaturePromptSections = {
    identity: string
    transformation: string
    preservation: string
    prohibitions: string
    style: string
    technical: string
}

export type PromptTemplateV1Input = Readonly<{
    identity: CreatureSemanticIdentity
    concept: CreatureTransformationConcept
    renderSpecification: CreatureRenderSpecification
    visualTrait: VisualTraitDefinition
}>

function sentence(label: string, value: string): string {
    return `${label}: ${withTerminalPunctuation(value)}`
}

function listSentence(label: string, values: readonly string[]): string {
    return `${label}: ${withTerminalPunctuation(formatPromptList(values))}`
}

export function composeCreatureTransformationPromptTemplateV1(input: PromptTemplateV1Input): CreaturePromptSections {
    const { concept, identity, renderSpecification, visualTrait } = input
    const bodyAreas = concept.primaryMutation.bodyAreas.map((area) => BODY_AREA_PROMPT_LABELS[area])
    const primaryMutation = MUTATION_ARCHETYPE_PROMPT_LABELS[concept.primaryMutation.mutationArchetype]
    const preservedFeatures = uniquePromptItems([
        ...concept.identityToPreserve,
        ...identity.identityFeatures,
    ])

    return {
        identity: [
            'Depict the same individual shown in the source image.',
            sentence('Description', identity.description),
            listSentence('Recognisable identity features', identity.identityFeatures),
            sentence('Established visual style', identity.styleDefinition),
        ].join(' '),
        transformation: [
            sentence('Concept', concept.conceptName),
            sentence('Evolutionary function', concept.evolutionaryFunction),
            `Primary mutation: ${withTerminalPunctuation(`${primaryMutation} on the ${formatPromptList(bodyAreas)}`)}`,
            sentence('Morphology', concept.primaryMutation.morphology),
            sentence('Material', concept.primaryMutation.material),
            concept.secondaryMutations.length
                ? listSentence('Secondary mutations', concept.secondaryMutations)
                : 'Secondary mutations: none.',
            sentence('Transformation intensity', INTENSITY_PROMPT_LABELS[concept.intensity]),
        ].join(' '),
        preservation: [
            listSentence('Preserve these concept commitments', preservedFeatures),
            'Keep the face and expression recognisable.',
            'Preserve the established palette and body proportions.',
            renderSpecification.preservePose ? 'Preserve the pose.' : '',
            renderSpecification.preserveComposition ? 'Preserve the composition.' : '',
        ].filter(Boolean).join(' '),
        prohibitions: [
            listSentence('Avoid', concept.forbiddenChanges),
            'Do not change the species or the individual.',
            'Do not add text, scenes, or unrequested objects.',
            'Do not reinterpret the creature as photorealistic.',
            describeVisualTraitLimits(visualTrait),
        ].join(' '),
        style: [
            sentence('Visual style', identity.styleDefinition),
            'Keep an illustrated treatment coherent with the creature.',
            'Integrate the mutation naturally into its anatomy.',
            'Use controlled detail.',
        ].join(' '),
        technical: [
            `Output a ${renderSpecification.outputMimeType === 'image/png' ? 'PNG' : renderSpecification.outputMimeType} image at ${renderSpecification.width} × ${renderSpecification.height} pixels.`,
            renderSpecification.transparentBackground ? 'Use a transparent background.' : '',
            renderSpecification.preservePose ? 'Preserve the pose.' : '',
            renderSpecification.preserveComposition ? 'Preserve the composition.' : '',
            renderSpecification.preserveCanvasMargins ? 'Keep the canvas margins intact.' : '',
        ].filter(Boolean).join(' '),
    }
}
