import type { BodyArea } from './body-areas.ts'
import { VISUAL_TRAIT_BY_ID, type VisualTraitId } from './visual-traits.ts'

/**
 * Visually interpretable evolution targets.
 *
 * The taxonomy is written for an image model, not for an anatomy textbook: it never asks the
 * model to tell a forelimb from a hind limb, and it keeps "change the volume of the body" apart
 * from "add a structure anchored to the back". Targets beyond the six core ones exist for body
 * plans that actually have that anatomy — see `body-plan-registry.ts`, which declares which
 * targets a body plan offers.
 */
export const EVOLUTION_TARGET_IDS = Object.freeze([
    'TAIL',
    'LIMBS_AND_FEET',
    'HEAD_AND_CROWN',
    'BODY_SHAPE',
    'DORSAL_STRUCTURES',
    'SKIN_AND_COVERING',
    'WINGS',
    'TENTACLES',
] as const)

export type EvolutionTargetId = (typeof EVOLUTION_TARGET_IDS)[number]

/**
 * Lineage grouping. Two targets in the same family describe the same anatomical system, so an
 * evolution of one continues the state established by the other instead of contradicting it.
 */
export const EVOLUTION_TARGET_FAMILIES = Object.freeze(['TAIL', 'LIMBS', 'HEAD', 'BODY_VOLUME', 'DORSAL', 'COVERING'] as const)

export type EvolutionTargetFamily = (typeof EVOLUTION_TARGET_FAMILIES)[number]

export const EVOLUTION_FUNCTION_IDS = Object.freeze([
    'BALANCE',
    'PROPULSION',
    'GRIP',
    'DEFENSE',
    'PERCEPTION',
    'THERMOREGULATION',
    'ENERGY_STORAGE',
    'IMPACT_ABSORPTION',
    'AQUATIC_ADAPTATION',
] as const)

export type EvolutionFunctionId = (typeof EVOLUTION_FUNCTION_IDS)[number]

export const EVOLUTION_FUNCTION_VISUAL_TRAITS: Readonly<Record<EvolutionFunctionId, readonly VisualTraitId[]>> = Object.freeze({
    BALANCE: Object.freeze(['LOCOMOTION_ADAPTATION'] as const),
    PROPULSION: Object.freeze(['LOCOMOTION_ADAPTATION', 'AQUATIC_MORPHOLOGY'] as const),
    GRIP: Object.freeze(['LOCOMOTION_ADAPTATION'] as const),
    DEFENSE: Object.freeze(['IMPACT_ADAPTATION'] as const),
    PERCEPTION: Object.freeze(['SENSORY_EXPANSION'] as const),
    THERMOREGULATION: Object.freeze(['ENERGY_REGULATION'] as const),
    ENERGY_STORAGE: Object.freeze(['ENERGY_REGULATION'] as const),
    IMPACT_ABSORPTION: Object.freeze(['IMPACT_ADAPTATION'] as const),
    AQUATIC_ADAPTATION: Object.freeze(['AQUATIC_MORPHOLOGY'] as const),
})

export type EvolutionTargetDefinition = Readonly<{
    id: EvolutionTargetId
    label: string
    description: string
    family: EvolutionTargetFamily
    /** The region an image model is told to work on, in prompt language. */
    promptRegion: string
    primaryBodyAreas: readonly BodyArea[]
    supportingBodyAreas: readonly BodyArea[]
    compatibleVisualTraits: readonly VisualTraitId[]
}>

export type EvolutionTargetHistoryEntry = Readonly<{
    evolutionTargetId?: EvolutionTargetId | null
    evolutionFunction?: EvolutionFunctionId | null
    visualTraitId: VisualTraitId
}>

export type ResolvedEvolutionDirection = Readonly<{
    visualTraitId: VisualTraitId
    evolutionFunction: EvolutionFunctionId
}>

function defineTarget(definition: EvolutionTargetDefinition): EvolutionTargetDefinition {
    return Object.freeze({
        ...definition,
        primaryBodyAreas: Object.freeze([...definition.primaryBodyAreas]),
        supportingBodyAreas: Object.freeze([...definition.supportingBodyAreas]),
        compatibleVisualTraits: Object.freeze([...definition.compatibleVisualTraits]),
    })
}

export const EVOLUTION_TARGETS = Object.freeze([
    defineTarget({
        id: 'TAIL',
        label: 'Coda',
        description: 'Sviluppa la coda esistente: lunghezza, massa, punta, pinne e strutture ancorate ad essa.',
        family: 'TAIL',
        promptRegion: 'the existing tail',
        primaryBodyAreas: ['TAIL'],
        supportingBodyAreas: ['BACK', 'SKIN_SURFACE'],
        compatibleVisualTraits: ['LOCOMOTION_ADAPTATION', 'AQUATIC_MORPHOLOGY'],
    }),
    defineTarget({
        id: 'LIMBS_AND_FEET',
        label: 'Arti e zampe',
        description: 'Evolve gli arti come sistema unico: lunghezza, massa, articolazioni, piedi, artigli e membrane.',
        family: 'LIMBS',
        promptRegion: 'the existing limbs and feet, treated as one system',
        primaryBodyAreas: ['FORELIMBS', 'HIND_LIMBS'],
        supportingBodyAreas: ['CHEST', 'BACK', 'SKIN_SURFACE'],
        compatibleVisualTraits: ['LOCOMOTION_ADAPTATION', 'IMPACT_ADAPTATION', 'AQUATIC_MORPHOLOGY'],
    }),
    defineTarget({
        id: 'HEAD_AND_CROWN',
        label: 'Testa e corona',
        description: 'Sviluppa corna, palchi, antenne, creste, orecchie e strutture craniali o sensoriali.',
        family: 'HEAD',
        promptRegion: 'the existing head, its crown and its sensory structures',
        primaryBodyAreas: ['HEAD_SURFACE', 'EYE_REGION', 'FACE'],
        supportingBodyAreas: ['NECK', 'SKIN_SURFACE'],
        compatibleVisualTraits: ['SENSORY_EXPANSION'],
    }),
    defineTarget({
        id: 'BODY_SHAPE',
        label: 'Forma del corpo',
        description: 'Cambia volume, proporzioni, torace, schiena e distribuzione delle masse del tronco.',
        family: 'BODY_VOLUME',
        promptRegion: 'the overall body shape: trunk length, volume, chest, back line and mass distribution',
        primaryBodyAreas: ['CHEST', 'BACK'],
        supportingBodyAreas: ['NECK', 'SKIN_SURFACE'],
        compatibleVisualTraits: ['IMPACT_ADAPTATION', 'ENERGY_REGULATION'],
    }),
    defineTarget({
        id: 'DORSAL_STRUCTURES',
        label: 'Strutture dorsali',
        description: 'Aggiunge o sviluppa spine, creste, pinne, placche, membrane e gobbe ancorate al dorso.',
        family: 'DORSAL',
        promptRegion: 'structures anchored to the back and spine',
        primaryBodyAreas: ['BACK'],
        supportingBodyAreas: ['NECK', 'TAIL', 'SKIN_SURFACE'],
        compatibleVisualTraits: ['IMPACT_ADAPTATION', 'ENERGY_REGULATION'],
    }),
    defineTarget({
        id: 'SKIN_AND_COVERING',
        label: 'Pelle e rivestimento',
        description: 'Evolve superficie, materiale, texture e pattern del rivestimento su tutta l anatomia esistente.',
        family: 'COVERING',
        promptRegion: 'the skin and body covering across the existing anatomy',
        primaryBodyAreas: ['SKIN_SURFACE'],
        supportingBodyAreas: ['TAIL', 'FORELIMBS', 'HIND_LIMBS', 'NECK', 'BACK', 'CHEST'],
        compatibleVisualTraits: ['IMPACT_ADAPTATION', 'LOCOMOTION_ADAPTATION', 'SENSORY_EXPANSION', 'ENERGY_REGULATION', 'AQUATIC_MORPHOLOGY'],
    }),
    defineTarget({
        id: 'WINGS',
        label: 'Ali',
        description: 'Evolve le ali esistenti: apertura, membrane, nervature e profilo di volo.',
        family: 'LIMBS',
        promptRegion: 'the existing wings',
        primaryBodyAreas: ['WINGS'],
        supportingBodyAreas: ['BACK', 'CHEST', 'SKIN_SURFACE'],
        compatibleVisualTraits: ['LOCOMOTION_ADAPTATION', 'IMPACT_ADAPTATION'],
    }),
    defineTarget({
        id: 'TENTACLES',
        label: 'Tentacoli',
        description: 'Evolve i tentacoli esistenti: lunghezza, sezione, ventose e appendici terminali.',
        family: 'LIMBS',
        promptRegion: 'the existing tentacles, treated as one system',
        primaryBodyAreas: ['TENTACLES'],
        supportingBodyAreas: ['CHEST', 'SKIN_SURFACE'],
        compatibleVisualTraits: ['LOCOMOTION_ADAPTATION', 'AQUATIC_MORPHOLOGY'],
    }),
] as const)

export const EVOLUTION_TARGET_BY_ID: Readonly<Record<EvolutionTargetId, EvolutionTargetDefinition>> = Object.freeze(
    Object.fromEntries(EVOLUTION_TARGETS.map((target) => [target.id, target])) as Record<EvolutionTargetId, EvolutionTargetDefinition>,
)

export function isEvolutionTargetId(value: unknown): value is EvolutionTargetId {
    return typeof value === 'string' && (EVOLUTION_TARGET_IDS as readonly string[]).includes(value)
}

export function evolutionTargetFamily(evolutionTargetId: EvolutionTargetId): EvolutionTargetFamily {
    return EVOLUTION_TARGET_BY_ID[evolutionTargetId].family
}

/** A direction is generatable when target, visual trait and function share a primary body area. */
export function isGeneratableEvolutionDirection(input: {
    evolutionTargetId: EvolutionTargetId
    visualTraitId: VisualTraitId
    evolutionFunction: EvolutionFunctionId
}): boolean {
    const target = EVOLUTION_TARGET_BY_ID[input.evolutionTargetId]
    const visualTrait = VISUAL_TRAIT_BY_ID[input.visualTraitId]
    if (!target || !visualTrait) return false
    if (!target.compatibleVisualTraits.includes(input.visualTraitId)) return false
    if (!EVOLUTION_FUNCTION_VISUAL_TRAITS[input.evolutionFunction].includes(input.visualTraitId)) return false
    return target.primaryBodyAreas.some((area) => visualTrait.allowedBodyAreas.includes(area))
}

function stableIndex(value: string, length: number): number {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
    return (hash >>> 0) % length
}

/**
 * Picks the functional direction of a target deterministically, preferring a direction this
 * creature has not used on that target yet. The direction is metadata for the concept and for
 * adoption; it never narrows what the target is visually allowed to change.
 */
export function resolveEvolutionDirection(input: {
    evolutionTargetId: EvolutionTargetId
    previousTransformations?: readonly EvolutionTargetHistoryEntry[]
    seed?: string
}): ResolvedEvolutionDirection | null {
    const compatible = EVOLUTION_FUNCTION_IDS.flatMap((evolutionFunction) => EVOLUTION_FUNCTION_VISUAL_TRAITS[evolutionFunction]
        .filter((visualTraitId) => isGeneratableEvolutionDirection({ evolutionTargetId: input.evolutionTargetId, visualTraitId, evolutionFunction }))
        .map((visualTraitId) => ({ visualTraitId, evolutionFunction })))
    const unused = compatible.filter(({ visualTraitId, evolutionFunction }) => !input.previousTransformations?.some((previous) => (
        previous.evolutionTargetId === input.evolutionTargetId
        && previous.visualTraitId === visualTraitId
        && previous.evolutionFunction === evolutionFunction
    )))
    const candidates = unused.length ? unused : compatible
    return candidates.length ? candidates[stableIndex(`${input.evolutionTargetId}:${input.seed ?? ''}`, candidates.length)]! : null
}
