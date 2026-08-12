import { resolveColorEvolution, resolveElementalAffinity, type ColorEvolution, type CreatureTransformationConcept, type ElementalAffinity } from './concepts.ts'
import type { CreatureSemanticIdentity } from './contracts.ts'
import type { PreviousCreatureTransformationSummary } from './creature-visual-versions.ts'
import { getEvolutionConstraints, type EvolutionConstraints } from './evolution-constraints.ts'
import { EVOLUTION_TARGET_BY_ID } from './evolution-targets.ts'
import type { BackgroundGenerationMode } from './image-generation.ts'
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

export type CreaturePromptTemplateVersion = typeof CREATURE_PROMPT_TEMPLATE_VERSION | 'creature-transformation-v2-experimental' | 'creature-transformation-v3-expressive'

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
    backgroundGenerationMode: BackgroundGenerationMode
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

function colorEvolutionInstruction(colorEvolution: ColorEvolution, constraints: EvolutionConstraints): string {
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
        `Apply it visibly across the ${formatPromptList(bodyAreas)} with ${effects}.${constraints.isTargeted ? ` Allowed chromatic body areas: ${formatPromptList(constraints.allowedColorBodyAreas.map((area) => BODY_AREA_PROMPT_LABELS[area]))}.` : ''}`,
        `Chromatic intensity ${colorEvolution.intensity}: the change must be readable in the full image, harmonise with the material, and express this biological function: ${withTerminalPunctuation(colorEvolution.biologicalRationale)}`,
    ].join(' ')
}

function elementalAffinityInstruction(elementalAffinity: ElementalAffinity): string {
    if (elementalAffinity.type === 'NONE') return ''
    return `Elemental affinity: ${elementalAffinity.type}. Manifest it physically through the requested primary mutation: ${withTerminalPunctuation(elementalAffinity.expression)} The elemental affinity must be expressed through the requested mutation. Do not transform unrelated body regions and do not redesign the creature globally around the element.`
}

function backgroundInstruction(backgroundGenerationMode: BackgroundGenerationMode): string {
    if (backgroundGenerationMode === 'NATIVE_TRANSPARENCY') {
        return 'Use a transparent background. Do not render a checkerboard transparency pattern, scenery, floor, shadow, reflection, glow, aura, particles, smoke, fog, mist, vignette, or coloured rim lighting.'
    }
    return 'BACKGROUND FOR AUTOMATIC CUTOUT: Render the creature against one perfectly uniform, solid, opaque and matte background. Choose a single background color that is absent from the creature and maximally different from every part of its body in both hue and brightness. Prefer a vivid chroma color such as magenta, cyan or orange, selecting whichever color has the greatest contrast with the creature dominant palette. The background must contain no gradient, texture, floor, horizon line, scenery, decorative elements, cast shadow, contact shadow, reflection, glow, aura, particles, sparks, smoke, fog, mist or vignette. Use neutral and even studio lighting. Do not allow the background color to spill onto the creature. Do not add colored rim lighting around its silhouette. Keep the entire creature visible, centered and sharply focused, with approximately 10-15% empty background around every extremity. Preserve crisp and clearly separated edges around claws, horns, spikes, fins, wings, tentacles, leaves and other thin anatomical details. Do not render transparency and do not render a checkerboard transparency pattern. The background will be removed by a dedicated post-processing stage.'
}

export function composeCreatureTransformationPromptTemplateV1(input: PromptTemplateV1Input): CreaturePromptSections {
    const { concept, identity, renderSpecification, visualTrait, backgroundGenerationMode } = input
    const colorEvolution = resolveColorEvolution(concept)
    const elementalAffinity = resolveElementalAffinity(concept)
    const constraints = getEvolutionConstraints({
        evolutionTarget: concept.evolutionTargetId ? EVOLUTION_TARGET_BY_ID[concept.evolutionTargetId] : undefined,
        visualTrait,
        evolutionFunction: concept.evolutionFunction,
        intensity: concept.intensity,
    })
    const bodyAreas = concept.primaryMutation.bodyAreas.map((area) => BODY_AREA_PROMPT_LABELS[area])
    const supportingBodyAreas = concept.primaryMutation.supportingBodyAreas?.map((area) => BODY_AREA_PROMPT_LABELS[area]) ?? []
    const primaryMutation = MUTATION_ARCHETYPE_PROMPT_LABELS[concept.primaryMutation.mutationArchetype]
    const anatomicalFocus = concept.evolutionTargetId
        ? `Chosen anatomical focus: ${formatPromptList(bodyAreas)}. Make this one local, incremental addition the dominant new visual change; do not add a major mutation to another region.${supportingBodyAreas.length ? ` The only permitted supporting anatomy is ${formatPromptList(supportingBodyAreas)}.` : ''}`
        : ''
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
            anatomicalFocus,
            `Primary mutation: ${withTerminalPunctuation(`${primaryMutation} on the ${formatPromptList(bodyAreas)}`)}`,
            sentence('Morphology', concept.primaryMutation.morphology),
            sentence('Material', concept.primaryMutation.material),
            concept.secondaryMutations.length
                ? listSentence('Secondary mutations', concept.secondaryMutations)
                : 'Secondary mutations: none.',
            sentence('Transformation intensity', INTENSITY_PROMPT_LABELS[concept.intensity]),
            colorEvolutionInstruction(colorEvolution, constraints),
            elementalAffinityInstruction(elementalAffinity),
        ].filter(Boolean).join(' '),
        preservation: [
            listSentence('Preserve these concept commitments', preservedFeatures),
            'Keep the face and expression recognisable.',
            concept.evolutionTargetId ? 'Keep the pose, proportions, overall silhouette, and every non-target body region visually stable.' : '',
            colorEvolution.mode === 'PRESERVE'
                ? 'Preserve the established palette and body proportions.'
                : 'Preserve the body proportions while making the requested colour evolution clearly visible.',
            renderSpecification.preservePose ? 'Preserve the pose.' : '',
            renderSpecification.preserveComposition ? 'Preserve the composition.' : '',
        ].filter(Boolean).join(' '),
        prohibitions: [
            listSentence('Avoid', concept.forbiddenChanges),
            'Do not change the species or the individual.',
            concept.evolutionTargetId ? 'Do not replace prior adaptations or introduce a new major mutation outside the chosen anatomical focus.' : '',
            'Do not add text, scenes, or unrequested objects.',
            'Do not reinterpret the creature as photorealistic.',
            describeVisualTraitLimits(visualTrait),
        ].filter(Boolean).join(' '),
        style: [
            sentence('Visual style', identity.styleDefinition),
            'Keep an illustrated treatment coherent with the creature.',
            'Integrate the mutation naturally into its anatomy.',
            'Use controlled detail.',
        ].join(' '),
        technical: [
            `Output a ${renderSpecification.outputMimeType === 'image/png' ? 'PNG' : renderSpecification.outputMimeType} image at ${renderSpecification.width} × ${renderSpecification.height} pixels.`,
            'Show the complete creature centred with a clear, well-separated silhouette and free margin around every body part.',
            backgroundInstruction(backgroundGenerationMode),
            'Do not crop any part of the creature.',
            renderSpecification.preservePose ? 'Preserve the pose.' : '',
            renderSpecification.preserveComposition ? 'Preserve the composition.' : '',
            renderSpecification.preserveCanvasMargins ? 'Keep the canvas margins intact.' : '',
        ].filter(Boolean).join(' '),
    }
}
