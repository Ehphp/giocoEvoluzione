import { CONSERVATIVE_COLOR_EVOLUTION, type ColorEvolution, type CreatureTransformationConcept, type TransformationIntensity } from './concepts.ts'
import type { BodyArea } from './body-areas.ts'
import {
    type ConceptGeneratorMetadata,
    type CreatureConceptGenerationInput,
    type CreatureConceptGenerator,
    CreatureConceptGenerationError,
} from './concept-generator.ts'
import { getEvolutionConstraints } from './evolution-constraints.ts'
import { VISUAL_TRAIT_BY_ID, type VisualTraitId } from './visual-traits.ts'

type MockConceptVariant = Readonly<{
    conceptName: string
    evolutionaryFunction: string
    mutationArchetype: CreatureTransformationConcept['primaryMutation']['mutationArchetype']
    bodyAreas: readonly BodyArea[]
    morphology: string
    material: string
    secondaryMutations: readonly string[]
}>

type MockColorEvolutionProfile = Readonly<{
    dominantColor: string
    secondaryColors: readonly string[]
    accentColors: readonly string[]
    surfaceEffects: readonly string[]
    biologicalRationale: string
}>

const MOCK_CONCEPT_VARIANTS: Readonly<Record<VisualTraitId, readonly MockConceptVariant[]>> = Object.freeze({
    IMPACT_ADAPTATION: Object.freeze([
        Object.freeze({
            conceptName: 'Scudi flessibili',
            evolutionaryFunction: 'Distribuisce gli urti lungo una corazza mobile senza alterare la sagoma familiare.',
            mutationArchetype: 'LAYERED_PLATING',
            bodyAreas: ['BACK', 'CHEST'] as const,
            morphology: 'Lamine sovrapposte e arrotondate seguono il dorso e il petto con una curvatura compatta.',
            material: 'Cheratina opaca con bordi morbidi e riflessi naturali.',
            secondaryMutations: ['Giunti elastici tra le lamine', 'Cuscinetti protettivi sugli arti anteriori'],
        }),
        Object.freeze({
            conceptName: 'Cuscini di rimbalzo',
            evolutionaryFunction: 'Assorbe pressioni improvvise e restituisce stabilita durante gli atterraggi.',
            mutationArchetype: 'ELASTIC_CUSHIONING',
            bodyAreas: ['FORELIMBS', 'SKIN_SURFACE'] as const,
            morphology: 'Cuscinetti stratificati emergono lungo gli arti anteriori e si fondono con la pelle.',
            material: 'Tessuto fibroso compatto con venature ambrate appena visibili.',
            secondaryMutations: ['Anelli compressibili vicino alle articolazioni', 'Fasce cutanee a tensione variabile'],
        }),
    ]),
    LOCOMOTION_ADAPTATION: Object.freeze([
        Object.freeze({
            conceptName: 'Balzi canalizzati',
            evolutionaryFunction: 'Accumula energia nelle zampe posteriori per scatti brevi e controllati.',
            mutationArchetype: 'SPRING_TENDONS',
            bodyAreas: ['HIND_LIMBS', 'TAIL'] as const,
            morphology: 'Tendini arcuati disegnano linee elastiche sulle zampe e convergono verso la base della coda.',
            material: 'Fibre tese, lisce e leggermente lucide sotto la pelle.',
            secondaryMutations: ['Nodi di tensione alle caviglie', 'Fascia stabilizzante alla base della coda'],
        }),
        Object.freeze({
            conceptName: 'Presa radicata',
            evolutionaryFunction: 'Migliora l aderenza su superfici instabili senza appesantire il movimento.',
            mutationArchetype: 'GRIPPING_PADS',
            bodyAreas: ['FORELIMBS', 'HIND_LIMBS'] as const,
            morphology: 'Polpastrelli segmentati si aprono sotto le zampe formando superfici di presa compatte.',
            material: 'Tessuto gommoso naturale con sottili creste concentriche.',
            secondaryMutations: ['Microcreste orientabili', 'Bordi ammortizzati lungo le dita'],
        }),
    ]),
    SENSORY_EXPANSION: Object.freeze([
        Object.freeze({
            conceptName: 'Frange di corrente',
            evolutionaryFunction: 'Raccoglie variazioni dell aria e del terreno per anticipare movimenti vicini.',
            mutationArchetype: 'SENSORY_FRILLS',
            bodyAreas: ['HEAD_SURFACE', 'NECK'] as const,
            morphology: 'Frange sottili seguono la superficie del capo e sfumano nel collo senza coprire i tratti familiari.',
            material: 'Membrane semitraslucide con nervature morbide e colori coerenti.',
            secondaryMutations: ['Filamenti mobili sul collo', 'Pieghe percettive dietro il capo'],
        }),
        Object.freeze({
            conceptName: 'Punti di fuoco',
            evolutionaryFunction: 'Affina la lettura della distanza attraverso piccoli centri ottici complementari.',
            mutationArchetype: 'FOCUSED_OCELLI',
            bodyAreas: ['EYE_REGION'] as const,
            morphology: 'Piccoli ocelli laterali incorniciano la regione degli occhi senza sostituire lo sguardo originario.',
            material: 'Superficie madreperlacea con un nucleo scuro e discreto.',
            secondaryMutations: ['Anelli ottici attenuati', 'Sottili nervature protettive'],
        }),
    ]),
    ENERGY_REGULATION: Object.freeze([
        Object.freeze({
            conceptName: 'Vele termiche',
            evolutionaryFunction: 'Dissipa o conserva calore modulando la superficie esposta del corpo.',
            mutationArchetype: 'THERMAL_MEMBRANES',
            bodyAreas: ['NECK', 'CHEST'] as const,
            morphology: 'Membrane pieghevoli si aprono dal collo al petto in fasce brevi e armoniche.',
            material: 'Pelle sottile con una trama calda e vene soffuse.',
            secondaryMutations: ['Pieghe termiche richiudibili', 'Piccole valvole cutanee'],
        }),
        Object.freeze({
            conceptName: 'Riserve diffuse',
            evolutionaryFunction: 'Conserva energia in piccoli serbatoi distribuiti per sostenere periodi difficili.',
            mutationArchetype: 'GLANDULAR_RESERVOIRS',
            bodyAreas: ['BACK', 'SKIN_SURFACE'] as const,
            morphology: 'Noduli poco sporgenti seguono il dorso e si dissolvono gradualmente nella pelle.',
            material: 'Tessuto ceroso e morbido con sfumature profonde ma naturali.',
            secondaryMutations: ['Canali di rilascio graduato', 'Placche protettive molto sottili'],
        }),
    ]),
    AQUATIC_MORPHOLOGY: Object.freeze([
        Object.freeze({
            conceptName: 'Remi a ventaglio',
            evolutionaryFunction: 'Aumenta la spinta in acqua mantenendo gesti terrestri riconoscibili.',
            mutationArchetype: 'HYDRODYNAMIC_WEBBING',
            bodyAreas: ['FORELIMBS', 'HIND_LIMBS'] as const,
            morphology: 'Membrane raccolte tra le dita si aprono a ventaglio durante la nuotata e restano discrete a riposo.',
            material: 'Tessuto elastico umido con venature delicate e bordi arrotondati.',
            secondaryMutations: ['Bordi natatori rinforzati', 'Piega idrodinamica vicino alle dita'],
        }),
        Object.freeze({
            conceptName: 'Coda di corrente',
            evolutionaryFunction: 'Riduce la resistenza e migliora la direzione nelle correnti lente.',
            mutationArchetype: 'STREAMLINED_RIDGES',
            bodyAreas: ['TAIL', 'SKIN_SURFACE'] as const,
            morphology: 'Creste basse accompagnano la coda e proseguono in linee fluide lungo la pelle.',
            material: 'Scaglie lisce con riflessi d acqua e una grana compatta.',
            secondaryMutations: ['Solchi per deviare il flusso', 'Bordo caudale piu flessibile'],
        }),
    ]),
})

const INTENSITY_DESCRIPTION: Readonly<Record<TransformationIntensity, string>> = Object.freeze({
    1: 'La mutazione resta sottile e facilmente leggibile.',
    2: 'La mutazione e chiara ma resta integrata nella forma originaria.',
    3: 'La mutazione e pronunciata, mantenendo proporzioni e identita riconoscibili.',
})

const TARGET_INTENSITY_DESCRIPTION: Readonly<Record<TransformationIntensity, string>> = Object.freeze({
    1: 'La mutazione resta sottile e localizzata nell area anatomica scelta.',
    2: 'La mutazione e chiara ma resta localizzata nell area anatomica scelta.',
    3: 'La mutazione e pronunciata ma resta localizzata nell area anatomica scelta.',
})

const MOCK_COLOR_EVOLUTION_PROFILES: Readonly<Record<VisualTraitId, MockColorEvolutionProfile>> = Object.freeze({
    IMPACT_ADAPTATION: Object.freeze({ dominantColor: 'deep moss green', secondaryColors: ['forest jade'], accentColors: ['warm amber'], surfaceEffects: ['impact-responsive amber veining'], biologicalRationale: 'I pigmenti nelle placche cheratiniche rendono visibili i percorsi di dissipazione degli urti.' }),
    LOCOMOTION_ADAPTATION: Object.freeze({ dominantColor: 'cool teal', secondaryColors: ['spring green'], accentColors: ['burnished gold'], surfaceEffects: ['directional gradients along the moving limbs'], biologicalRationale: 'La distribuzione dei pigmenti segue fibre e tendini per rendere leggibile la tensione necessaria agli scatti.' }),
    SENSORY_EXPANSION: Object.freeze({ dominantColor: 'midnight indigo', secondaryColors: ['violet'], accentColors: ['soft cyan'], surfaceEffects: ['subtle iridescence and sensory bioluminescence'], biologicalRationale: 'Cellule cromatofore e membrane percettive amplificano segnali luminosi utili alla nuova funzione sensoriale.' }),
    ENERGY_REGULATION: Object.freeze({ dominantColor: 'sunset copper', secondaryColors: ['deep burgundy'], accentColors: ['golden amber'], surfaceEffects: ['heat gradients and gentle bioluminescent veins'], biologicalRationale: 'La variazione dei pigmenti e delle vene termiche segnala accumulo, conservazione e rilascio di energia.' }),
    AQUATIC_MORPHOLOGY: Object.freeze({ dominantColor: 'ocean blue', secondaryColors: ['sea green'], accentColors: ['silver'], surfaceEffects: ['water-like iridescence along the scales'], biologicalRationale: 'Strati di scaglie idrodinamiche rifrangono la luce e favoriscono mimetismo e leggibilita in acqua.' }),
})

function stableHash(value: string): number {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) {
        hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
    }
    return hash >>> 0
}

function getControlledTrait(input: CreatureConceptGenerationInput) {
    const controlledTrait = VISUAL_TRAIT_BY_ID[input.visualTrait.id]
    if (controlledTrait !== input.visualTrait) {
        throw new CreatureConceptGenerationError(
            'CATALOG_CONFIGURATION_INVALID',
            'Il Visual Trait del generatore deve provenire dal catalogo controllato.',
        )
    }
    return controlledTrait
}

function createColorEvolution(input: CreatureConceptGenerationInput, variant: MockConceptVariant, bodyAreas: readonly BodyArea[] = variant.bodyAreas): ColorEvolution {
    // Three out of four deterministic concepts exercise chromatic evolution; the remaining one proves the conservative path.
    if (stableHash(`color:${input.visualTrait.id}:${input.intensity}:${input.seed ?? ''}`) % 4 === 0) return CONSERVATIVE_COLOR_EVOLUTION
    const constraints = getEvolutionConstraints({
        evolutionTarget: input.evolutionTarget,
        visualTrait: input.visualTrait,
        evolutionFunction: input.evolutionFunction,
        intensity: input.intensity,
    })
    const mode = input.intensity === 3 ? 'SHIFT' : 'EXPAND'
    if (!constraints.colorEvolution.allowedModes.includes(mode)) return CONSERVATIVE_COLOR_EVOLUTION
    const profile = MOCK_COLOR_EVOLUTION_PROFILES[input.visualTrait.id]
    const affectedBodyAreas = [...new Set([
        ...bodyAreas,
        ...(input.intensity >= 2 ? ['SKIN_SURFACE' as const] : []),
    ])].filter((area) => constraints.allowedColorBodyAreas.includes(area))
    return {
        mode,
        dominantColor: profile.dominantColor,
        secondaryColors: [...profile.secondaryColors],
        accentColors: [...profile.accentColors],
        surfaceEffects: [...profile.surfaceEffects],
        affectedBodyAreas,
        intensity: input.intensity,
        biologicalRationale: profile.biologicalRationale,
    }
}

export class MockCreatureConceptGenerator implements CreatureConceptGenerator {
    readonly metadata: ConceptGeneratorMetadata = Object.freeze({
        generator: 'mock-creature-concept-generator',
        isMock: true,
    })

    async generateConcept(input: CreatureConceptGenerationInput): Promise<CreatureTransformationConcept> {
        const visualTrait = getControlledTrait(input)
        const variants = MOCK_CONCEPT_VARIANTS[visualTrait.id]
        if (!variants?.length) {
            throw new CreatureConceptGenerationError(
                'CATALOG_CONFIGURATION_INVALID',
                `Manca un concept mock per ${visualTrait.id}.`,
            )
        }

        const variant = variants[stableHash(`${visualTrait.id}:${input.intensity}:${input.seed ?? ''}`) % variants.length]
        const target = input.evolutionTarget
        const constraints = getEvolutionConstraints({
            evolutionTarget: target,
            visualTrait,
            evolutionFunction: input.evolutionFunction,
            intensity: input.intensity,
        })
        if (target && !constraints.isGeneratable) {
            throw new CreatureConceptGenerationError(
                'CATALOG_CONFIGURATION_INVALID',
                'Il target anatomico mock non ha una direzione generabile.',
            )
        }
        const intensityDescription = target ? TARGET_INTENSITY_DESCRIPTION[input.intensity] : INTENSITY_DESCRIPTION[input.intensity]
        const primaryBodyAreas = target
            ? [constraints.allowedPrimaryBodyAreas[stableHash(`${target.id}:${input.seed ?? ''}`) % constraints.allowedPrimaryBodyAreas.length]!]
            : [...variant.bodyAreas]
        const supportingBodyAreas = target
            ? variant.bodyAreas.filter((area) => constraints.allowedSupportingBodyAreas.includes(area)).slice(0, 1)
            : []
        const secondaryCount = Math.min(input.intensity, variant.secondaryMutations.length, visualTrait.creativeLimits.maxSecondaryMutations, target ? 1 : Infinity)

        return {
            schemaVersion: target ? 2 : 1,
            visualTrait: visualTrait.id,
            ...(target && input.evolutionTargetId === target.id && input.evolutionFunction
                ? { evolutionTargetId: target.id, evolutionFunction: input.evolutionFunction }
                : {}),
            conceptName: variant.conceptName,
            evolutionaryFunction: `${variant.evolutionaryFunction} ${intensityDescription}`,
            primaryMutation: {
                mutationArchetype: variant.mutationArchetype,
                bodyAreas: primaryBodyAreas,
                ...(supportingBodyAreas.length ? { supportingBodyAreas } : {}),
                morphology: `${variant.morphology} ${intensityDescription}`,
                material: variant.material,
            },
            secondaryMutations: [...variant.secondaryMutations.slice(0, secondaryCount)],
            identityToPreserve: [...input.identity.identityFeatures, 'Specie e silhouette riconoscibili'],
            forbiddenChanges: [
                'Cambio di specie',
                'Sostituzione del volto',
                'Anatomia umanoide',
                'Trasformazione totale',
                'Armi, abiti o accessori artificiali',
            ],
            intensity: input.intensity,
            colorEvolution: createColorEvolution(input, variant, [...primaryBodyAreas, ...supportingBodyAreas]),
            elementalAffinity: { type: 'NONE', expression: '' },
        }
    }
}
