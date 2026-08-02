import type { BodyArea } from './body-areas.ts'
import type { MutationArchetype } from './mutation-archetypes.ts'

export const VISUAL_TRAIT_IDS = Object.freeze([
    'IMPACT_ADAPTATION',
    'LOCOMOTION_ADAPTATION',
    'SENSORY_EXPANSION',
    'ENERGY_REGULATION',
    'AQUATIC_MORPHOLOGY',
] as const)

export type VisualTraitId = (typeof VISUAL_TRAIT_IDS)[number]

export type VisualTraitCreativeLimits = Readonly<{
    maxPrimaryBodyAreas: 1 | 2
    maxSecondaryMutations: 0 | 1 | 2 | 3
}>

export type VisualTraitDefinition = Readonly<{
    id: VisualTraitId
    displayName: string
    description: string
    allowedBodyAreas: readonly BodyArea[]
    allowedMutationArchetypes: readonly MutationArchetype[]
    creativeLimits: VisualTraitCreativeLimits
}>

function defineVisualTrait(definition: VisualTraitDefinition): VisualTraitDefinition {
    return Object.freeze({
        ...definition,
        allowedBodyAreas: Object.freeze([...definition.allowedBodyAreas]),
        allowedMutationArchetypes: Object.freeze([...definition.allowedMutationArchetypes]),
        creativeLimits: Object.freeze({ ...definition.creativeLimits }),
    })
}

export const VISUAL_TRAITS = Object.freeze([
    defineVisualTrait({
        id: 'IMPACT_ADAPTATION',
        displayName: 'Adattamento all’impatto',
        description: 'Sviluppa strutture che distribuiscono urti e pressioni senza cambiare identita alla creatura.',
        allowedBodyAreas: ['BACK', 'CHEST', 'FORELIMBS', 'SKIN_SURFACE'],
        allowedMutationArchetypes: ['LAYERED_PLATING', 'ELASTIC_CUSHIONING'],
        creativeLimits: { maxPrimaryBodyAreas: 2, maxSecondaryMutations: 3 },
    }),
    defineVisualTrait({
        id: 'LOCOMOTION_ADAPTATION',
        displayName: 'Locomozione potenziata',
        description: 'Sviluppa dettagli dedicati a spinta, stabilita e controllo del movimento.',
        allowedBodyAreas: ['FORELIMBS', 'HIND_LIMBS', 'TAIL', 'SKIN_SURFACE'],
        allowedMutationArchetypes: ['SPRING_TENDONS', 'GRIPPING_PADS', 'BALANCE_TAIL'],
        creativeLimits: { maxPrimaryBodyAreas: 2, maxSecondaryMutations: 3 },
    }),
    defineVisualTrait({
        id: 'SENSORY_EXPANSION',
        displayName: 'Espansione sensoriale',
        description: 'Sviluppa organi percettivi aggiuntivi mantenendo il volto riconoscibile.',
        allowedBodyAreas: ['HEAD_SURFACE', 'EYE_REGION', 'NECK', 'SKIN_SURFACE'],
        allowedMutationArchetypes: ['SENSORY_FRILLS', 'FOCUSED_OCELLI', 'VIBRATION_FILAMENTS'],
        creativeLimits: { maxPrimaryBodyAreas: 2, maxSecondaryMutations: 2 },
    }),
    defineVisualTrait({
        id: 'ENERGY_REGULATION',
        displayName: 'Regolazione energetica',
        description: 'Sviluppa strutture per gestire calore, accumulo e rilascio di energia.',
        allowedBodyAreas: ['NECK', 'BACK', 'CHEST', 'SKIN_SURFACE'],
        allowedMutationArchetypes: ['THERMAL_MEMBRANES', 'GLANDULAR_RESERVOIRS', 'VENTILATION_RIDGES'],
        creativeLimits: { maxPrimaryBodyAreas: 2, maxSecondaryMutations: 3 },
    }),
    defineVisualTrait({
        id: 'AQUATIC_MORPHOLOGY',
        displayName: 'Morfologia acquatica',
        description: 'Sviluppa superfici e profili adatti al movimento e alla sopravvivenza in acqua.',
        allowedBodyAreas: ['NECK', 'FORELIMBS', 'HIND_LIMBS', 'TAIL', 'SKIN_SURFACE'],
        allowedMutationArchetypes: ['HYDRODYNAMIC_WEBBING', 'STREAMLINED_RIDGES', 'FILTERING_FRONDS'],
        creativeLimits: { maxPrimaryBodyAreas: 2, maxSecondaryMutations: 3 },
    }),
] as const)

export const VISUAL_TRAIT_BY_ID: Readonly<Record<VisualTraitId, VisualTraitDefinition>> = Object.freeze(
    Object.fromEntries(VISUAL_TRAITS.map((trait) => [trait.id, trait])) as Record<VisualTraitId, VisualTraitDefinition>,
)
