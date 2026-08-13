import type { BodyArea } from './body-areas.ts'

/**
 * Functional families a mutation can belong to. They label the biological purpose of an
 * evolution for the domain and for adoption metadata; the concrete morphology is decided by the
 * micro-concept and by the anatomy contract of the selected target.
 */
export const VISUAL_TRAIT_IDS = Object.freeze([
    'IMPACT_ADAPTATION',
    'LOCOMOTION_ADAPTATION',
    'SENSORY_EXPANSION',
    'ENERGY_REGULATION',
    'AQUATIC_MORPHOLOGY',
] as const)

export type VisualTraitId = (typeof VISUAL_TRAIT_IDS)[number]

export type VisualTraitDefinition = Readonly<{
    id: VisualTraitId
    displayName: string
    description: string
    allowedBodyAreas: readonly BodyArea[]
}>

function defineVisualTrait(definition: VisualTraitDefinition): VisualTraitDefinition {
    return Object.freeze({
        ...definition,
        allowedBodyAreas: Object.freeze([...definition.allowedBodyAreas]),
    })
}

export const VISUAL_TRAITS = Object.freeze([
    defineVisualTrait({
        id: 'IMPACT_ADAPTATION',
        displayName: 'Adattamento all’impatto',
        description: 'Strutture che distribuiscono urti e pressioni.',
        allowedBodyAreas: ['BACK', 'CHEST', 'FORELIMBS', 'HIND_LIMBS', 'WINGS', 'SKIN_SURFACE'],
    }),
    defineVisualTrait({
        id: 'LOCOMOTION_ADAPTATION',
        displayName: 'Locomozione potenziata',
        description: 'Dettagli dedicati a spinta, stabilita e controllo del movimento.',
        allowedBodyAreas: ['FORELIMBS', 'HIND_LIMBS', 'WINGS', 'TENTACLES', 'TAIL', 'SKIN_SURFACE'],
    }),
    defineVisualTrait({
        id: 'SENSORY_EXPANSION',
        displayName: 'Espansione sensoriale',
        description: 'Organi percettivi e strutture craniali aggiuntive.',
        allowedBodyAreas: ['HEAD_SURFACE', 'EYE_REGION', 'FACE', 'NECK', 'SKIN_SURFACE'],
    }),
    defineVisualTrait({
        id: 'ENERGY_REGULATION',
        displayName: 'Regolazione energetica',
        description: 'Strutture per gestire calore, accumulo e rilascio di energia.',
        allowedBodyAreas: ['NECK', 'BACK', 'CHEST', 'SKIN_SURFACE'],
    }),
    defineVisualTrait({
        id: 'AQUATIC_MORPHOLOGY',
        displayName: 'Morfologia acquatica',
        description: 'Superfici e profili adatti al movimento in acqua.',
        allowedBodyAreas: ['NECK', 'FORELIMBS', 'HIND_LIMBS', 'TENTACLES', 'TAIL', 'SKIN_SURFACE'],
    }),
] as const)

export const VISUAL_TRAIT_BY_ID: Readonly<Record<VisualTraitId, VisualTraitDefinition>> = Object.freeze(
    Object.fromEntries(VISUAL_TRAITS.map((trait) => [trait.id, trait])) as Record<VisualTraitId, VisualTraitDefinition>,
)
