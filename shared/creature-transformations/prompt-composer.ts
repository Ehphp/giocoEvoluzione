import type { CreatureTransformationConcept } from './concepts.ts'
import type { CreatureSemanticIdentity } from './contracts.ts'
import type { PreviousCreatureTransformationSummary } from './creature-visual-versions.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION, type CreatureRenderSpecification } from './render-specifications.ts'
import {
    composeCreatureTransformationPromptTemplateV1,
    CREATURE_PROMPT_TEMPLATE_VERSION,
    type CreaturePromptSections,
    type CreaturePromptTemplateVersion,
} from './prompt-template-v1.ts'
import {
    composeCreatureTransformationPromptTemplateV2Experimental,
    CREATURE_PROMPT_TEMPLATE_VERSION_EXPERIMENTAL,
} from './prompt-template-v2-experimental.ts'
import { normalizePromptText, uniquePromptItems } from './prompt-normalization.ts'
import { VISUAL_TRAIT_BY_ID } from './visual-traits.ts'

export type { CreaturePromptSections, CreaturePromptTemplateVersion }
export { CREATURE_PROMPT_TEMPLATE_VERSION, CREATURE_PROMPT_TEMPLATE_VERSION_EXPERIMENTAL }

export type ComposeCreatureTransformationPromptInput = Readonly<{
    identity: CreatureSemanticIdentity
    concept: CreatureTransformationConcept
    renderSpecification: CreatureRenderSpecification
    templateVersion: CreaturePromptTemplateVersion
    previousTransformations?: readonly PreviousCreatureTransformationSummary[]
}>

export type ComposedCreatureTransformationPrompt = Readonly<{
    prompt: string
    templateVersion: CreaturePromptTemplateVersion
    sections: CreaturePromptSections
}>

export type CreaturePromptCompositionErrorCode =
    | 'UNSUPPORTED_TEMPLATE_VERSION'
    | 'INVALID_IDENTITY'
    | 'INCONSISTENT_CONCEPT_IDENTITY'
    | 'UNSUPPORTED_RENDER_SPECIFICATION'
    | 'UNSUPPORTED_VISUAL_TRAIT'
    | 'EMPTY_COMPOSED_SECTION'

export class CreaturePromptCompositionError extends Error {
    readonly code: CreaturePromptCompositionErrorCode

    constructor(code: CreaturePromptCompositionErrorCode, message: string) {
        super(message)
        this.name = 'CreaturePromptCompositionError'
        this.code = code
    }
}

const SECTION_ORDER: readonly [keyof CreaturePromptSections, ...Array<keyof CreaturePromptSections>] = [
    'identity',
    'transformation',
    'preservation',
    'prohibitions',
    'style',
    'technical',
]

const SECTION_HEADINGS: Readonly<Record<keyof CreaturePromptSections, string>> = Object.freeze({
    identity: 'IDENTITY',
    transformation: 'TRANSFORMATION',
    preservation: 'PRESERVE',
    prohibitions: 'AVOID',
    style: 'STYLE',
    technical: 'TECHNICAL',
})

function normalizedIdentityFeatures(identity: CreatureSemanticIdentity): string[] {
    if (!normalizePromptText(identity.description) || !normalizePromptText(identity.styleDefinition)) {
        throw new CreaturePromptCompositionError('INVALID_IDENTITY', 'L identita richiede descrizione e stile non vuoti.')
    }
    if (identity.identityFeatures.some((feature) => !normalizePromptText(feature))) {
        throw new CreaturePromptCompositionError('INVALID_IDENTITY', 'Le caratteristiche identitarie non possono essere vuote.')
    }

    const identityFeatures = uniquePromptItems(identity.identityFeatures)
    if (!identityFeatures.length) {
        throw new CreaturePromptCompositionError('INVALID_IDENTITY', 'L identita richiede almeno una caratteristica riconoscibile.')
    }
    return identityFeatures
}

function conceptPreservesIdentity(concept: CreatureTransformationConcept, identityFeatures: readonly string[]): boolean {
    const normalizeStructuralFeature = (feature: string) => feature.toLowerCase().replace(/\b(corpo|body)\s+(?:verde|lime|turchese|teal|blu|blue|viola|indaco|indigo)\b/g, '$1')
    const preserved = uniquePromptItems(concept.identityToPreserve).map(normalizeStructuralFeature)
    return identityFeatures.every((feature) => {
        const normalizedFeature = normalizeStructuralFeature(feature)
        return preserved.some((preservedFeature) => (
            preservedFeature.includes(normalizedFeature) || normalizedFeature.includes(preservedFeature)
        ))
    })
}

function isSupportedRenderSpecification(renderSpecification: CreatureRenderSpecification): boolean {
    const current = CURRENT_CREATURE_RENDER_SPECIFICATION
    return renderSpecification.version === current.version
        && renderSpecification.width === current.width
        && renderSpecification.height === current.height
        && renderSpecification.outputMimeType === current.outputMimeType
        && renderSpecification.transparentBackground === current.transparentBackground
        && renderSpecification.preservePose === current.preservePose
        && renderSpecification.preserveComposition === current.preserveComposition
        && renderSpecification.preserveCanvasMargins === current.preserveCanvasMargins
}

function formatPrompt(sections: CreaturePromptSections): string {
    return SECTION_ORDER
        .map((section) => `${SECTION_HEADINGS[section]}\n${sections[section]}`)
        .join('\n\n')
}

export function composeCreatureTransformationPrompt(
    input: ComposeCreatureTransformationPromptInput,
): ComposedCreatureTransformationPrompt {
    if (input.templateVersion !== CREATURE_PROMPT_TEMPLATE_VERSION && input.templateVersion !== CREATURE_PROMPT_TEMPLATE_VERSION_EXPERIMENTAL) {
        throw new CreaturePromptCompositionError('UNSUPPORTED_TEMPLATE_VERSION', 'La versione del template prompt non e supportata.')
    }

    const identityFeatures = normalizedIdentityFeatures(input.identity)
    if (!conceptPreservesIdentity(input.concept, identityFeatures)) {
        throw new CreaturePromptCompositionError('INCONSISTENT_CONCEPT_IDENTITY', 'Il concept non preserva le caratteristiche identitarie richieste.')
    }
    if (!isSupportedRenderSpecification(input.renderSpecification)) {
        throw new CreaturePromptCompositionError('UNSUPPORTED_RENDER_SPECIFICATION', 'La render specification non e supportata dal template.')
    }

    const visualTrait = VISUAL_TRAIT_BY_ID[input.concept.visualTrait]
    if (!visualTrait) {
        throw new CreaturePromptCompositionError('UNSUPPORTED_VISUAL_TRAIT', 'Il Visual Trait del concept non appartiene al catalogo.')
    }

    const templateInput = {
        ...input,
        identity: { ...input.identity, identityFeatures },
        visualTrait,
    }
    const sections = input.templateVersion === CREATURE_PROMPT_TEMPLATE_VERSION
        ? composeCreatureTransformationPromptTemplateV1(templateInput)
        : composeCreatureTransformationPromptTemplateV2Experimental(templateInput)
    for (const section of SECTION_ORDER) {
        if (!normalizePromptText(sections[section])) {
            throw new CreaturePromptCompositionError('EMPTY_COMPOSED_SECTION', `La sezione ${SECTION_HEADINGS[section]} non puo essere vuota.`)
        }
    }

    return {
        prompt: formatPrompt(sections),
        templateVersion: input.templateVersion,
        sections,
    }
}
