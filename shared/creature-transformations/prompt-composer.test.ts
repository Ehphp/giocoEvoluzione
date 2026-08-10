import { describe, expect, it } from 'vitest'

import { BODY_AREAS } from './body-areas.ts'
import { TRANSFORMATION_INTENSITIES, type CreatureTransformationConcept, type TransformationIntensity } from './concepts.ts'
import { TEST_CREATURE_IDENTITY, createValidConcept } from './concept-test-fixtures.ts'
import {
    composeCreatureTransformationPrompt,
    CREATURE_PROMPT_TEMPLATE_VERSION,
    CREATURE_PROMPT_TEMPLATE_VERSION_EXPERIMENTAL,
    CREATURE_PROMPT_TEMPLATE_VERSION_EXPRESSIVE,
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

function compose(
    concept: CreatureTransformationConcept,
    identity = TEST_CREATURE_IDENTITY,
    backgroundGenerationMode: 'SOLID_FOR_POST_PROCESSING' | 'NATIVE_TRANSPARENCY' = 'SOLID_FOR_POST_PROCESSING',
) {
    return composeCreatureTransformationPrompt({
        identity,
        concept,
        renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
        templateVersion: CREATURE_PROMPT_TEMPLATE_VERSION,
        backgroundGenerationMode,
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
        expect(result.sections.technical).toContain('BACKGROUND FOR AUTOMATIC CUTOUT')
        expect(result.sections.technical).toContain('canvas margins')
    })

    it('uses a solid cutout background without a generic transparent-background request', () => {
        const technical = compose(createValidConcept()).sections.technical

        expect(technical).toContain('perfectly uniform, solid, opaque and matte background')
        expect(technical).not.toContain('Use a transparent background')
        for (const forbidden of ['gradient', 'shadow', 'glow', 'particles', 'checkerboard', 'spill onto the creature']) {
            expect(technical).toContain(forbidden)
        }
    })

    it('keeps native transparency instructions separate from browser post-processing', () => {
        const technical = compose(createValidConcept(), TEST_CREATURE_IDENTITY, 'NATIVE_TRANSPARENCY').sections.technical

        expect(technical).toContain('Use a transparent background')
        expect(technical).not.toContain('BACKGROUND FOR AUTOMATIC CUTOUT')
    })

    it('makes a requested palette shift visible without retaining contradictory preservation instructions', () => {
        const concept: CreatureTransformationConcept = {
            ...createValidConcept(),
            colorEvolution: {
                mode: 'SHIFT', dominantColor: 'ocean blue', secondaryColors: ['sea green'], accentColors: ['silver'],
                surfaceEffects: ['iridescent hydrodynamic gradients'], affectedBodyAreas: ['BACK', 'SKIN_SURFACE'], intensity: 2,
                biologicalRationale: 'Le scaglie adattate rifrangono la luce per mimetismo e gestione del calore da impatto.',
            },
        }
        const v1 = compose(concept)
        const v2 = composeCreatureTransformationPrompt({
            identity: TEST_CREATURE_IDENTITY, concept, renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
            templateVersion: CREATURE_PROMPT_TEMPLATE_VERSION_EXPERIMENTAL,
        })

        expect(v1.sections.transformation).toContain('Replace the established dominant palette')
        expect(v1.sections.transformation).toContain('ocean blue')
        expect(v1.prompt).not.toContain('Preserve the established palette')
        expect(v2.sections.preservation).toContain('Follow the requested colour evolution')
        expect(v2.sections.preservation).not.toContain('Keep the dominant palette')
        expect(v1.sections.preservation).toContain('Keep the face and expression recognisable')
    })

    it('keeps the target dominant while allowing a causal supporting consequence in the expressive policy', () => {
        const result = composeCreatureTransformationPrompt({
            identity: TEST_CREATURE_IDENTITY, concept: createValidConcept(), renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
            templateVersion: CREATURE_PROMPT_TEMPLATE_VERSION_EXPRESSIVE,
        })

        expect(result.templateVersion).toBe(CREATURE_PROMPT_TEMPLATE_VERSION_EXPRESSIVE)
        expect(result.sections.transformation).toContain('dominant, unmistakable new visual change')
        expect(result.sections.transformation).toContain('coherent supporting consequence')
        expect(result.sections.prohibitions).toContain('erase prior adaptations')
        expect(result.sections.preservation).toContain('recognisable overall silhouette')
    })

    it('preserves the palette for legacy concepts with no colour-evolution field', () => {
        const result = compose(createValidConcept())

        expect(result.sections.transformation).toContain('Color evolution: preserve the established palette')
        expect(result.sections.preservation).toContain('Preserve the established palette and body proportions')
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
            identityFeatures: [' Volto a mezzaluna ', 'volto A MEZZALUNA', 'Coda corta', 'coda corta', 'Coda'],
        }
        const concept: CreatureTransformationConcept = {
            ...createValidConcept(),
            identityToPreserve: [...identity.identityFeatures],
            secondaryMutations: [' Giunto laterale ', 'GIUNTO LATERALE', 'Giunto laterale esteso'],
            primaryMutation: { ...createValidConcept().primaryMutation, material: ' Tessuto fibroso  ' },
        }
        const result = compose(concept, identity)

        expect(result.sections.preservation).toContain('Volto a mezzaluna, Coda corta, and Coda.')
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
          Depict the same individual shown in the source image. Description: Piccola creatura turchese con volto a mezzaluna e coda corta. Recognisable structural identity features: volto a mezzaluna and coda corta. Current mutable visual appearance: corpo turchese and palette turchese. Established visual style: Illustrazione organica con linee morbide e materiali naturali.

          TRANSFORMATION
          Concept: Cuscini di rimbalzo. Evolutionary function: Assorbe pressioni improvvise e restituisce stabilita durante gli atterraggi. La mutazione resta sottile e facilmente leggibile. Primary mutation: elastic impact cushioning on the front limbs and skin surface. Morphology: Cuscinetti stratificati emergono lungo gli arti anteriori e si fondono con la pelle. La mutazione resta sottile e facilmente leggibile. Material: Tessuto fibroso compatto con venature ambrate appena visibili. Secondary mutations: Anelli compressibili vicino alle articolazioni. Transformation intensity: subtle but clearly visible. Expand the established palette with these intentionally evolved colours: dominant deep moss green; secondary colours forest jade; accents warm amber. Apply it visibly across the front limbs and skin surface with impact-responsive amber veining. Chromatic intensity 1: the change must be readable in the full image, harmonise with the material, and express this biological function: I pigmenti nelle placche cheratiniche rendono visibili i percorsi di dissipazione degli urti.

          PRESERVE
          Preserve these concept commitments: volto a mezzaluna, coda corta, and Specie e silhouette riconoscibili. Keep the face and expression recognisable. Preserve the body proportions while making the requested colour evolution clearly visible. Preserve the pose. Preserve the composition.

          AVOID
          Avoid: Cambio di specie, Sostituzione del volto, Anatomia umanoide, Trasformazione totale, and Armi, abiti o accessori artificiali. Do not change the species or the individual. Do not add text, scenes, or unrequested objects. Do not reinterpret the creature as photorealistic. Keep the protective response to impacts within its approved scope: at most 2 primary body areas and up to 3 secondary mutations.

          STYLE
          Visual style: Illustrazione organica con linee morbide e materiali naturali. Keep an illustrated treatment coherent with the creature. Integrate the mutation naturally into its anatomy. Use controlled detail.

          TECHNICAL
          Output a PNG image at 1024 × 1536 pixels. Show the complete creature centred with a clear, well-separated silhouette and free margin around every body part. BACKGROUND FOR AUTOMATIC CUTOUT: Render the creature against one perfectly uniform, solid, opaque and matte background. Choose a single background color that is absent from the creature and maximally different from every part of its body in both hue and brightness. Prefer a vivid chroma color such as magenta, cyan or orange, selecting whichever color has the greatest contrast with the creature dominant palette. The background must contain no gradient, texture, floor, horizon line, scenery, decorative elements, cast shadow, contact shadow, reflection, glow, aura, particles, sparks, smoke, fog, mist or vignette. Use neutral and even studio lighting. Do not allow the background color to spill onto the creature. Do not add colored rim lighting around its silhouette. Keep the entire creature visible, centered and sharply focused, with approximately 10-15% empty background around every extremity. Preserve crisp and clearly separated edges around claws, horns, spikes, fins, wings, tentacles, leaves and other thin anatomical details. Do not render transparency and do not render a checkerboard transparency pattern. The background will be removed by a dedicated post-processing stage. Do not crop any part of the creature. Preserve the pose. Preserve the composition. Keep the canvas margins intact."
        `)
    })

    it('matches the v1 sensory prompt snapshot', async () => {
        const { composed } = await composeMock('SENSORY_EXPANSION', 2, 'sensory-snapshot')

        expect(composed.prompt).toMatchInlineSnapshot(`
          "IDENTITY
          Depict the same individual shown in the source image. Description: Piccola creatura turchese con volto a mezzaluna e coda corta. Recognisable structural identity features: volto a mezzaluna and coda corta. Current mutable visual appearance: corpo turchese and palette turchese. Established visual style: Illustrazione organica con linee morbide e materiali naturali.

          TRANSFORMATION
          Concept: Frange di corrente. Evolutionary function: Raccoglie variazioni dell aria e del terreno per anticipare movimenti vicini. La mutazione e chiara ma resta integrata nella forma originaria. Primary mutation: perceptive frills on the surface of the head and neck. Morphology: Frange sottili seguono la superficie del capo e sfumano nel collo senza coprire i tratti familiari. La mutazione e chiara ma resta integrata nella forma originaria. Material: Membrane semitraslucide con nervature morbide e colori coerenti. Secondary mutations: Filamenti mobili sul collo and Pieghe percettive dietro il capo. Transformation intensity: substantial and balanced. Expand the established palette with these intentionally evolved colours: dominant midnight indigo; secondary colours violet; accents soft cyan. Apply it visibly across the surface of the head, neck, and skin surface with subtle iridescence and sensory bioluminescence. Chromatic intensity 2: the change must be readable in the full image, harmonise with the material, and express this biological function: Cellule cromatofore e membrane percettive amplificano segnali luminosi utili alla nuova funzione sensoriale.

          PRESERVE
          Preserve these concept commitments: volto a mezzaluna, coda corta, and Specie e silhouette riconoscibili. Keep the face and expression recognisable. Preserve the body proportions while making the requested colour evolution clearly visible. Preserve the pose. Preserve the composition.

          AVOID
          Avoid: Cambio di specie, Sostituzione del volto, Anatomia umanoide, Trasformazione totale, and Armi, abiti o accessori artificiali. Do not change the species or the individual. Do not add text, scenes, or unrequested objects. Do not reinterpret the creature as photorealistic. Keep the expanded perception within its approved scope: at most 2 primary body areas and up to 2 secondary mutations.

          STYLE
          Visual style: Illustrazione organica con linee morbide e materiali naturali. Keep an illustrated treatment coherent with the creature. Integrate the mutation naturally into its anatomy. Use controlled detail.

          TECHNICAL
          Output a PNG image at 1024 × 1536 pixels. Show the complete creature centred with a clear, well-separated silhouette and free margin around every body part. BACKGROUND FOR AUTOMATIC CUTOUT: Render the creature against one perfectly uniform, solid, opaque and matte background. Choose a single background color that is absent from the creature and maximally different from every part of its body in both hue and brightness. Prefer a vivid chroma color such as magenta, cyan or orange, selecting whichever color has the greatest contrast with the creature dominant palette. The background must contain no gradient, texture, floor, horizon line, scenery, decorative elements, cast shadow, contact shadow, reflection, glow, aura, particles, sparks, smoke, fog, mist or vignette. Use neutral and even studio lighting. Do not allow the background color to spill onto the creature. Do not add colored rim lighting around its silhouette. Keep the entire creature visible, centered and sharply focused, with approximately 10-15% empty background around every extremity. Preserve crisp and clearly separated edges around claws, horns, spikes, fins, wings, tentacles, leaves and other thin anatomical details. Do not render transparency and do not render a checkerboard transparency pattern. The background will be removed by a dedicated post-processing stage. Do not crop any part of the creature. Preserve the pose. Preserve the composition. Keep the canvas margins intact."
        `)
    })

    it('matches the v1 aquatic prompt snapshot', async () => {
        const { composed } = await composeMock('AQUATIC_MORPHOLOGY', 3, 'aquatic-snapshot')

        expect(composed.prompt).toMatchInlineSnapshot(`
          "IDENTITY
          Depict the same individual shown in the source image. Description: Piccola creatura turchese con volto a mezzaluna e coda corta. Recognisable structural identity features: volto a mezzaluna and coda corta. Current mutable visual appearance: corpo turchese and palette turchese. Established visual style: Illustrazione organica con linee morbide e materiali naturali.

          TRANSFORMATION
          Concept: Remi a ventaglio. Evolutionary function: Aumenta la spinta in acqua mantenendo gesti terrestri riconoscibili. La mutazione e pronunciata, mantenendo proporzioni e identita riconoscibili. Primary mutation: hydrodynamic webbing on the front limbs and rear limbs. Morphology: Membrane raccolte tra le dita si aprono a ventaglio durante la nuotata e restano discrete a riposo. La mutazione e pronunciata, mantenendo proporzioni e identita riconoscibili. Material: Tessuto elastico umido con venature delicate e bordi arrotondati. Secondary mutations: Bordi natatori rinforzati and Piega idrodinamica vicino alle dita. Transformation intensity: pronounced while preserving identity. Replace the established dominant palette with this intentionally evolved palette: dominant ocean blue; secondary colours sea green; accents silver. Apply it visibly across the front limbs, rear limbs, and skin surface with water-like iridescence along the scales. Chromatic intensity 3: the change must be readable in the full image, harmonise with the material, and express this biological function: Strati di scaglie idrodinamiche rifrangono la luce e favoriscono mimetismo e leggibilita in acqua.

          PRESERVE
          Preserve these concept commitments: volto a mezzaluna, coda corta, and Specie e silhouette riconoscibili. Keep the face and expression recognisable. Preserve the body proportions while making the requested colour evolution clearly visible. Preserve the pose. Preserve the composition.

          AVOID
          Avoid: Cambio di specie, Sostituzione del volto, Anatomia umanoide, Trasformazione totale, and Armi, abiti o accessori artificiali. Do not change the species or the individual. Do not add text, scenes, or unrequested objects. Do not reinterpret the creature as photorealistic. Keep the aquatic body shaping within its approved scope: at most 2 primary body areas and up to 3 secondary mutations.

          STYLE
          Visual style: Illustrazione organica con linee morbide e materiali naturali. Keep an illustrated treatment coherent with the creature. Integrate the mutation naturally into its anatomy. Use controlled detail.

          TECHNICAL
          Output a PNG image at 1024 × 1536 pixels. Show the complete creature centred with a clear, well-separated silhouette and free margin around every body part. BACKGROUND FOR AUTOMATIC CUTOUT: Render the creature against one perfectly uniform, solid, opaque and matte background. Choose a single background color that is absent from the creature and maximally different from every part of its body in both hue and brightness. Prefer a vivid chroma color such as magenta, cyan or orange, selecting whichever color has the greatest contrast with the creature dominant palette. The background must contain no gradient, texture, floor, horizon line, scenery, decorative elements, cast shadow, contact shadow, reflection, glow, aura, particles, sparks, smoke, fog, mist or vignette. Use neutral and even studio lighting. Do not allow the background color to spill onto the creature. Do not add colored rim lighting around its silhouette. Keep the entire creature visible, centered and sharply focused, with approximately 10-15% empty background around every extremity. Preserve crisp and clearly separated edges around claws, horns, spikes, fins, wings, tentacles, leaves and other thin anatomical details. Do not render transparency and do not render a checkerboard transparency pattern. The background will be removed by a dedicated post-processing stage. Do not crop any part of the creature. Preserve the pose. Preserve the composition. Keep the canvas margins intact."
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
        expect(experimental.sections.preservation).toMatchInlineSnapshot(`"Preserve these concept commitments: volto a mezzaluna and coda corta. Keep the face and expression recognisable. Preserve the established palette and body proportions. Preserve the pose. Preserve the composition. Keep the face and eyes unchanged unless the requested body area explicitly requires them. Keep the same pose and overall silhouette. Keep the dominant palette."`)
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
