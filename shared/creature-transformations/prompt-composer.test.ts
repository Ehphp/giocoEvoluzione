import { describe, expect, it } from 'vitest'

import { BODY_AREAS } from './body-areas.ts'
import { TRANSFORMATION_INTENSITIES, type CreatureTransformationConcept, type TransformationIntensity } from './concepts.ts'
import { TEST_CREATURE_IDENTITY, createValidConcept } from './concept-test-fixtures.ts'
import {
    composeCreatureTransformationPrompt,
    CREATURE_PROMPT_TEMPLATE_VERSION,
    CREATURE_PROMPT_TEMPLATE_VERSION_EXPERIMENTAL,
    CreaturePromptCompositionError,
    type CreaturePromptTemplateVersion,
} from './prompt-composer.ts'
import {
    BODY_AREA_PROMPT_LABELS,
    INTENSITY_PROMPT_LABELS,
    MUTATION_ARCHETYPE_PROMPT_LABELS,
    VISUAL_TRAIT_PROMPT_LABELS,
} from './prompt-labels.ts'
import { MockCreatureConceptGenerator } from './mock-concept-generator.ts'
import { MUTATION_ARCHETYPES } from './mutation-archetypes.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION, type CreatureRenderSpecification } from './render-specifications.ts'
import { VISUAL_TRAIT_BY_ID, VISUAL_TRAIT_IDS, type VisualTraitId } from './visual-traits.ts'

const generator = new MockCreatureConceptGenerator()

function compose(concept: CreatureTransformationConcept, identity = TEST_CREATURE_IDENTITY) {
    return composeCreatureTransformationPrompt({
        identity,
        concept,
        renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
        templateVersion: CREATURE_PROMPT_TEMPLATE_VERSION,
    })
}

async function composeMock(traitId: VisualTraitId, intensity: TransformationIntensity, seed: string) {
    const concept = await generator.generateConcept({
        identity: TEST_CREATURE_IDENTITY,
        visualTrait: VISUAL_TRAIT_BY_ID[traitId],
        intensity,
        seed,
    })
    return { concept, composed: compose(concept) }
}

function getErrorCode(action: () => unknown): string {
    try {
        action()
    } catch (error) {
        expect(error).toBeInstanceOf(CreaturePromptCompositionError)
        return (error as CreaturePromptCompositionError).code
    }
    throw new Error('Expected the prompt composition to fail.')
}

describe('composeCreatureTransformationPrompt', () => {
    it('is deterministic and concatenates six non-empty sections in the canonical order', () => {
        const first = compose(createValidConcept())
        const second = compose(createValidConcept())

        expect(first).toEqual(second)
        expect(Object.values(first.sections).every(Boolean)).toBe(true)
        expect(first.prompt).toBe([
            `IDENTITY\n${first.sections.identity}`,
            `TRANSFORMATION\n${first.sections.transformation}`,
            `PRESERVE\n${first.sections.preservation}`,
            `AVOID\n${first.sections.prohibitions}`,
            `STYLE\n${first.sections.style}`,
            `TECHNICAL\n${first.sections.technical}`,
        ].join('\n\n'))
    })

    it('covers every catalog value with a descriptive prompt label', () => {
        for (const visualTraitId of VISUAL_TRAIT_IDS) expect(VISUAL_TRAIT_PROMPT_LABELS[visualTraitId]).toBeTruthy()
        for (const bodyArea of BODY_AREAS) expect(BODY_AREA_PROMPT_LABELS[bodyArea]).toBeTruthy()
        for (const mutationArchetype of MUTATION_ARCHETYPES) expect(MUTATION_ARCHETYPE_PROMPT_LABELS[mutationArchetype]).toBeTruthy()
        for (const intensity of TRANSFORMATION_INTENSITIES) expect(INTENSITY_PROMPT_LABELS[intensity]).toBeTruthy()
    })

    it('includes the identity, concept, preservation, style, prohibitions and technical requirements', () => {
        const concept = createValidConcept()
        const result = compose(concept)

        expect(result.sections.identity).toContain(TEST_CREATURE_IDENTITY.description)
        expect(result.sections.identity).toContain(TEST_CREATURE_IDENTITY.styleDefinition)
        expect(result.sections.transformation).toContain(concept.conceptName)
        expect(result.sections.transformation).toContain(concept.primaryMutation.morphology)
        expect(result.sections.transformation).toContain(concept.secondaryMutations[0])
        expect(result.sections.preservation).toContain(concept.identityToPreserve[0])
        expect(result.sections.prohibitions).toContain(concept.forbiddenChanges[0])
        expect(result.sections.style).toContain(TEST_CREATURE_IDENTITY.styleDefinition)
        expect(result.sections.technical).toContain('PNG')
        expect(result.sections.technical).toContain('1024 × 1536')
        expect(result.sections.technical).toContain('transparent background')
        expect(result.sections.technical).toContain('canvas margins')
    })

    it('does not expose technical catalog identifiers or internal creature identity fields', async () => {
        const { concept, composed } = await composeMock('SENSORY_EXPANSION', 2, 'identifier-check')

        expect(composed.prompt).not.toContain(TEST_CREATURE_IDENTITY.creatureId)
        expect(composed.prompt).not.toContain(TEST_CREATURE_IDENTITY.baseCreatureKey)
        expect(composed.prompt).not.toContain(concept.visualTrait)
        expect(composed.prompt).not.toContain(concept.primaryMutation.mutationArchetype)
        for (const bodyArea of concept.primaryMutation.bodyAreas) expect(composed.prompt).not.toContain(bodyArea)
    })

    it('normalizes duplicate and empty entries without collapsing distinct creative text', () => {
        const identity = {
            ...TEST_CREATURE_IDENTITY,
            identityFeatures: [' Palette turchese ', 'palette TURCHESE', 'Coda corta', 'coda corta', 'Coda'],
        }
        const concept: CreatureTransformationConcept = {
            ...createValidConcept(),
            identityToPreserve: [...identity.identityFeatures],
            secondaryMutations: [' Giunto laterale ', 'GIUNTO LATERALE', 'Giunto laterale esteso'],
            primaryMutation: { ...createValidConcept().primaryMutation, material: ' Tessuto fibroso  ' },
        }
        const result = compose(concept, identity)

        expect(result.sections.preservation).toContain('Palette turchese, Coda corta, and Coda.')
        expect(result.sections.transformation).toContain('Secondary mutations: Giunto laterale and Giunto laterale esteso.')
        expect(result.sections.transformation).toContain('Material: Tessuto fibroso.')
    })

    it('rejects unsupported versions, malformed identity, incoherent concepts and render specifications', () => {
        expect(getErrorCode(() => composeCreatureTransformationPrompt({
            identity: TEST_CREATURE_IDENTITY,
            concept: createValidConcept(),
            renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
            templateVersion: 'creature-transformation-v2' as CreaturePromptTemplateVersion,
        }))).toBe('UNSUPPORTED_TEMPLATE_VERSION')
        expect(getErrorCode(() => compose(createValidConcept(), { ...TEST_CREATURE_IDENTITY, description: '  ' }))).toBe('INVALID_IDENTITY')
        expect(getErrorCode(() => compose({ ...createValidConcept(), identityToPreserve: ['palette turchese'] }))).toBe('INCONSISTENT_CONCEPT_IDENTITY')
        expect(getErrorCode(() => composeCreatureTransformationPrompt({
            identity: TEST_CREATURE_IDENTITY,
            concept: createValidConcept(),
            renderSpecification: { ...CURRENT_CREATURE_RENDER_SPECIFICATION, width: 512 } as unknown as CreatureRenderSpecification,
            templateVersion: CREATURE_PROMPT_TEMPLATE_VERSION,
        }))).toBe('UNSUPPORTED_RENDER_SPECIFICATION')
    })

    it('keeps prompt modules free of gameplay, provider, network, storage and environment references', () => {
        const promptSources = import.meta.glob('./prompt-*.ts', {
            eager: true,
            query: '?raw',
            import: 'default',
        }) as Record<string, string>

        for (const [filePath, source] of Object.entries(promptSources)) {
            if (filePath.endsWith('.test.ts')) continue

            expect(source).not.toMatch(/from\s+['"][^'"]*(?:game-rules|src\/game)(?:\/|['"])/)
            expect(source).not.toMatch(/@supabase|fetch\(|axios|https?:\/\/|process\.env|import\.meta\.env|storage|api key|provider|sdk/i)
            expect(source).not.toMatch(/Math\.random|new Date\(|Date\.now/)
        }
    })

    it('matches the v1 impact prompt snapshot', async () => {
        const { composed } = await composeMock('IMPACT_ADAPTATION', 1, 'impact-snapshot')

        expect(composed.prompt).toMatchInlineSnapshot(`
"IDENTITY
Depict the same individual shown in the source image. Description: Piccola creatura turchese con volto a mezzaluna e coda corta. Recognisable identity features: volto a mezzaluna, palette turchese, and coda corta. Established visual style: Illustrazione organica con linee morbide e materiali naturali.

TRANSFORMATION
Concept: Cuscini di rimbalzo. Evolutionary function: Assorbe pressioni improvvise e restituisce stabilita durante gli atterraggi. La mutazione resta sottile e facilmente leggibile. Primary mutation: elastic impact cushioning on the front limbs and skin surface. Morphology: Cuscinetti stratificati emergono lungo gli arti anteriori e si fondono con la pelle. La mutazione resta sottile e facilmente leggibile. Material: Tessuto fibroso compatto con venature ambrate appena visibili. Secondary mutations: Anelli compressibili vicino alle articolazioni. Transformation intensity: subtle but clearly visible.

PRESERVE
Preserve these concept commitments: volto a mezzaluna, palette turchese, coda corta, and Specie, silhouette e palette cromatica riconoscibili. Keep the face and expression recognisable. Preserve the established palette and body proportions. Preserve the pose. Preserve the composition.

AVOID
Avoid: Cambio di specie, Sostituzione del volto, Anatomia umanoide, Trasformazione totale, and Armi, abiti o accessori artificiali. Do not change the species or the individual. Do not add text, scenes, or unrequested objects. Do not reinterpret the creature as photorealistic. Keep the protective response to impacts within its approved scope: at most 2 primary body areas and up to 3 secondary mutations.

STYLE
Visual style: Illustrazione organica con linee morbide e materiali naturali. Keep an illustrated treatment coherent with the creature. Integrate the mutation naturally into its anatomy. Use controlled detail.

TECHNICAL
Output a PNG image at 1024 × 1536 pixels. Use a transparent background. Preserve the pose. Preserve the composition. Keep the canvas margins intact."
`)
    })

    it('matches the v1 sensory prompt snapshot', async () => {
        const { composed } = await composeMock('SENSORY_EXPANSION', 2, 'sensory-snapshot')

        expect(composed.prompt).toMatchInlineSnapshot(`
"IDENTITY
Depict the same individual shown in the source image. Description: Piccola creatura turchese con volto a mezzaluna e coda corta. Recognisable identity features: volto a mezzaluna, palette turchese, and coda corta. Established visual style: Illustrazione organica con linee morbide e materiali naturali.

TRANSFORMATION
Concept: Frange di corrente. Evolutionary function: Raccoglie variazioni dell aria e del terreno per anticipare movimenti vicini. La mutazione e chiara ma resta integrata nella forma originaria. Primary mutation: perceptive frills on the surface of the head and neck. Morphology: Frange sottili seguono la superficie del capo e sfumano nel collo senza coprire i tratti familiari. La mutazione e chiara ma resta integrata nella forma originaria. Material: Membrane semitraslucide con nervature morbide e colori coerenti. Secondary mutations: Filamenti mobili sul collo and Pieghe percettive dietro il capo. Transformation intensity: substantial and balanced.

PRESERVE
Preserve these concept commitments: volto a mezzaluna, palette turchese, coda corta, and Specie, silhouette e palette cromatica riconoscibili. Keep the face and expression recognisable. Preserve the established palette and body proportions. Preserve the pose. Preserve the composition.

AVOID
Avoid: Cambio di specie, Sostituzione del volto, Anatomia umanoide, Trasformazione totale, and Armi, abiti o accessori artificiali. Do not change the species or the individual. Do not add text, scenes, or unrequested objects. Do not reinterpret the creature as photorealistic. Keep the expanded perception within its approved scope: at most 2 primary body areas and up to 2 secondary mutations.

STYLE
Visual style: Illustrazione organica con linee morbide e materiali naturali. Keep an illustrated treatment coherent with the creature. Integrate the mutation naturally into its anatomy. Use controlled detail.

TECHNICAL
Output a PNG image at 1024 × 1536 pixels. Use a transparent background. Preserve the pose. Preserve the composition. Keep the canvas margins intact."
`)
    })

    it('matches the v1 aquatic prompt snapshot', async () => {
        const { composed } = await composeMock('AQUATIC_MORPHOLOGY', 3, 'aquatic-snapshot')

        expect(composed.prompt).toMatchInlineSnapshot(`
"IDENTITY
Depict the same individual shown in the source image. Description: Piccola creatura turchese con volto a mezzaluna e coda corta. Recognisable identity features: volto a mezzaluna, palette turchese, and coda corta. Established visual style: Illustrazione organica con linee morbide e materiali naturali.

TRANSFORMATION
Concept: Remi a ventaglio. Evolutionary function: Aumenta la spinta in acqua mantenendo gesti terrestri riconoscibili. La mutazione e pronunciata, mantenendo proporzioni e identita riconoscibili. Primary mutation: hydrodynamic webbing on the front limbs and rear limbs. Morphology: Membrane raccolte tra le dita si aprono a ventaglio durante la nuotata e restano discrete a riposo. La mutazione e pronunciata, mantenendo proporzioni e identita riconoscibili. Material: Tessuto elastico umido con venature delicate e bordi arrotondati. Secondary mutations: Bordi natatori rinforzati and Piega idrodinamica vicino alle dita. Transformation intensity: pronounced while preserving identity.

PRESERVE
Preserve these concept commitments: volto a mezzaluna, palette turchese, coda corta, and Specie, silhouette e palette cromatica riconoscibili. Keep the face and expression recognisable. Preserve the established palette and body proportions. Preserve the pose. Preserve the composition.

AVOID
Avoid: Cambio di specie, Sostituzione del volto, Anatomia umanoide, Trasformazione totale, and Armi, abiti o accessori artificiali. Do not change the species or the individual. Do not add text, scenes, or unrequested objects. Do not reinterpret the creature as photorealistic. Keep the aquatic body shaping within its approved scope: at most 2 primary body areas and up to 3 secondary mutations.

STYLE
Visual style: Illustrazione organica con linee morbide e materiali naturali. Keep an illustrated treatment coherent with the creature. Integrate the mutation naturally into its anatomy. Use controlled detail.

TECHNICAL
Output a PNG image at 1024 × 1536 pixels. Use a transparent background. Preserve the pose. Preserve the composition. Keep the canvas margins intact."
`)
    })

    it('matches the isolated v2 experimental preservation snapshot without changing v1', () => {
        const experimental = composeCreatureTransformationPrompt({
            identity: TEST_CREATURE_IDENTITY,
            concept: createValidConcept(),
            renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
            templateVersion: CREATURE_PROMPT_TEMPLATE_VERSION_EXPERIMENTAL,
        })

        expect(experimental.templateVersion).toBe(CREATURE_PROMPT_TEMPLATE_VERSION_EXPERIMENTAL)
        expect(experimental.sections.preservation).toMatchInlineSnapshot(`
"Preserve these concept commitments: volto a mezzaluna, palette turchese, and coda corta. Keep the face and expression recognisable. Preserve the established palette and body proportions. Preserve the pose. Preserve the composition. Keep the face and eyes unchanged unless the requested body area explicitly requires them. Keep the same pose, overall silhouette, and dominant palette."
`)
        expect(experimental.prompt).not.toMatch(/provider|openai|gameplay|player_creatures/i)
        expect(experimental.sections.transformation).toContain(createValidConcept().conceptName)
    })
})

describe('experimental prompt with prior adopted transformations', () => {
    it('instructs the image pipeline to preserve rather than repeat prior visual evolution', () => {
        const composed = composeCreatureTransformationPrompt({
            identity: TEST_CREATURE_IDENTITY,
            concept: createValidConcept(),
            renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
            templateVersion: CREATURE_PROMPT_TEMPLATE_VERSION_EXPERIMENTAL,
            previousTransformations: [{ versionNumber: 2, visualTraitId: 'IMPACT_ADAPTATION', conceptName: 'Scudi flessibili' }],
        })
        expect(composed.prompt).toContain('Preserve prior adopted transformations')
        expect(composed.prompt).toContain('Do not remove or repeat them')
    })
})
