import { resolveColorEvolution, type ColorEvolution, type CreatureTransformationConcept } from './concepts.ts'
import type { CreatureSemanticIdentity } from './contracts.ts'
import type { PreviousCreatureTransformationSummary } from './creature-visual-versions.ts'
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

export type CreaturePromptTemplateVersion = typeof CREATURE_PROMPT_TEMPLATE_VERSION | 'creature-transformation-v2-experimental'

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
    previousTransformations?: readonly PreviousCreatureTransformationSummary[]
}>

function sentence(label: string, value: string): string {
    return `${label}: ${withTerminalPunctuation(value)}`
}

function listSentence(label: string, values: readonly string[]): string {
    return `${label}: ${withTerminalPunctuation(formatPromptList(values))}`
}

function preserveStructuralCommitment(value: string, colorEvolution: ColorEvolution): string | null {
    if (colorEvolution.mode === 'PRESERVE') return value
    if (/(?:palette|colou?r|cromatic)/i.test(value)) return null
    return value.replace(/\b(corpo|body)\s+(?:verde|lime|turchese|teal|blu|blue|viola|indaco|indigo)\b/gi, '$1')
}

function colorEvolutionInstruction(colorEvolution: ColorEvolution): string {
    if (colorEvolution.mode === 'PRESERVE') {
        return 'Color evolution: preserve the established palette; do not introduce a new dominant colour.'
    }
    const bodyAreas = colorEvolution.affectedBodyAreas.map((area) => BODY_AREA_PROMPT_LABELS[area])
    const effects = colorEvolution.surfaceEffects.length ? formatPromptList(colorEvolution.surfaceEffects) : 'harmonious material-linked tonal transitions'
    const secondaryColors = colorEvolution.secondaryColors.length ? formatPromptList(colorEvolution.secondaryColors) : 'none'
    const accentColors = colorEvolution.accentColors.length ? formatPromptList(colorEvolution.accentColors) : 'none'
    const change = colorEvolution.mode === 'SHIFT'
        ? 'Replace the established dominant palette with this intentionally evolved palette'
        : 'Expand the established palette with these intentionally evolved colours'
    return [
        `${change}: dominant ${colorEvolution.dominantColor}; secondary colours ${secondaryColors}; accents ${accentColors}.`,
        `Apply it visibly across the ${formatPromptList(bodyAreas)} with ${effects}.`,
        `Chromatic intensity ${colorEvolution.intensity}: the change must be readable in the full image, harmonise with the material, and express this biological function: ${withTerminalPunctuation(colorEvolution.biologicalRationale)}`,
    ].join(' ')
}

export function composeCreatureTransformationPromptTemplateV1(input: PromptTemplateV1Input): CreaturePromptSections {
    const { concept, identity, renderSpecification, visualTrait } = input
    const colorEvolution = resolveColorEvolution(concept)
    const bodyAreas = concept.primaryMutation.bodyAreas.map((area) => BODY_AREA_PROMPT_LABELS[area])
    const primaryMutation = MUTATION_ARCHETYPE_PROMPT_LABELS[concept.primaryMutation.mutationArchetype]
    const preservedFeatures = uniquePromptItems([
        ...concept.identityToPreserve,
        ...identity.identityFeatures,
    ].map((feature) => preserveStructuralCommitment(feature, colorEvolution)).filter((feature): feature is string => feature !== null))

    return {
        identity: [
            'Depict the same individual shown in the source image.',
            sentence('Description', identity.description),
            listSentence('Recognisable structural identity features', identity.identityFeatures),
            listSentence('Current mutable visual appearance', identity.mutableVisualFeatures),
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
            colorEvolutionInstruction(colorEvolution),
        ].join(' '),
        preservation: [
            listSentence('Preserve these concept commitments', preservedFeatures),
            'Keep the face and expression recognisable.',
            colorEvolution.mode === 'PRESERVE'
                ? 'Preserve the established palette and body proportions.'
                : 'Preserve the body proportions while making the requested colour evolution clearly visible.',
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
