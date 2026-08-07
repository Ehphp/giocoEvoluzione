import type { BodyArea } from './body-areas.ts'
import type { MutationArchetype } from './mutation-archetypes.ts'
import { EVOLUTION_FUNCTION_VISUAL_TRAITS, getEvolutionConstraints } from './evolution-constraints.ts'
import { VISUAL_TRAIT_BY_ID, type VisualTraitId } from './visual-traits.ts'

export const EVOLUTION_TARGET_IDS = Object.freeze([
    'TAIL',
    'FORELIMBS',
    'HIND_LIMBS',
    'HEAD_AND_SENSES',
    'TORSO_AND_BACK',
    'SKIN',
] as const)

export type EvolutionTargetId = (typeof EVOLUTION_TARGET_IDS)[number]

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

export type EvolutionTargetDefinition = Readonly<{
    id: EvolutionTargetId
    label: string
    description: string
    primaryBodyAreas: readonly BodyArea[]
    supportingBodyAreas: readonly BodyArea[]
    compatibleVisualTraits: readonly VisualTraitId[]
}>

export type EvolutionTargetHistoryEntry = Readonly<{
    evolutionTargetId?: EvolutionTargetId | null
    evolutionFunction?: EvolutionFunctionId | null
    visualTraitId: VisualTraitId
    mutationArchetype?: MutationArchetype | null
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
        id: 'TAIL', label: 'Coda', description: 'Sviluppa la coda con un cambiamento locale e leggibile.',
        primaryBodyAreas: ['TAIL'], supportingBodyAreas: ['BACK', 'SKIN_SURFACE'],
        compatibleVisualTraits: ['LOCOMOTION_ADAPTATION', 'AQUATIC_MORPHOLOGY'],
    }),
    defineTarget({
        id: 'FORELIMBS', label: 'Arti anteriori', description: 'Rafforza o specializza gli arti anteriori.',
        primaryBodyAreas: ['FORELIMBS'], supportingBodyAreas: ['CHEST', 'SKIN_SURFACE'],
        compatibleVisualTraits: ['LOCOMOTION_ADAPTATION', 'AQUATIC_MORPHOLOGY'],
    }),
    defineTarget({
        id: 'HIND_LIMBS', label: 'Arti posteriori', description: 'Evolve gli arti posteriori mantenendo stabile la forma generale.',
        primaryBodyAreas: ['HIND_LIMBS'], supportingBodyAreas: ['CHEST', 'BACK', 'SKIN_SURFACE'],
        compatibleVisualTraits: ['IMPACT_ADAPTATION', 'LOCOMOTION_ADAPTATION', 'AQUATIC_MORPHOLOGY'],
    }),
    defineTarget({
        id: 'HEAD_AND_SENSES', label: 'Testa e sensi', description: 'Aggiunge dettagli percettivi senza cambiare volto e identita.',
        primaryBodyAreas: ['FACE', 'EYE_REGION', 'HEAD_SURFACE'], supportingBodyAreas: ['NECK', 'SKIN_SURFACE'],
        compatibleVisualTraits: ['SENSORY_EXPANSION'],
    }),
    defineTarget({
        id: 'TORSO_AND_BACK', label: 'Corpo e dorso', description: 'Sviluppa protezioni o strutture locali sul tronco.',
        primaryBodyAreas: ['BACK', 'CHEST'], supportingBodyAreas: ['NECK', 'SKIN_SURFACE'],
        compatibleVisualTraits: ['IMPACT_ADAPTATION', 'ENERGY_REGULATION'],
    }),
    defineTarget({
        id: 'SKIN', label: 'Pelle', description: 'Evolve la superficie cutanea senza aggiungere una nuova mutazione dominante altrove.',
        primaryBodyAreas: ['SKIN_SURFACE'], supportingBodyAreas: ['TAIL', 'FORELIMBS', 'HIND_LIMBS', 'NECK', 'BACK', 'CHEST'],
        compatibleVisualTraits: ['IMPACT_ADAPTATION', 'LOCOMOTION_ADAPTATION', 'SENSORY_EXPANSION', 'ENERGY_REGULATION', 'AQUATIC_MORPHOLOGY'],
    }),
] as const)

export const EVOLUTION_TARGET_BY_ID: Readonly<Record<EvolutionTargetId, EvolutionTargetDefinition>> = Object.freeze(
    Object.fromEntries(EVOLUTION_TARGETS.map((target) => [target.id, target])) as Record<EvolutionTargetId, EvolutionTargetDefinition>,
)

function stableIndex(value: string, length: number): number {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
    return (hash >>> 0) % length
}

export function resolveEvolutionDirection(input: {
    evolutionTargetId: EvolutionTargetId
    previousTransformations?: readonly EvolutionTargetHistoryEntry[]
    seed?: string
}): ResolvedEvolutionDirection | null {
    const target = EVOLUTION_TARGET_BY_ID[input.evolutionTargetId]
    const directions = EVOLUTION_FUNCTION_IDS.flatMap((evolutionFunction) => EVOLUTION_FUNCTION_VISUAL_TRAITS[evolutionFunction]
        .filter((visualTraitId) => target.compatibleVisualTraits.includes(visualTraitId))
        .map((visualTraitId) => ({ visualTraitId, evolutionFunction })))
    const compatible = directions.filter(({ visualTraitId, evolutionFunction }) => {
        const visualTrait = VISUAL_TRAIT_BY_ID[visualTraitId]
        return Boolean(visualTrait) && getEvolutionConstraints({
            evolutionTarget: target,
            visualTrait: visualTrait!,
            evolutionFunction,
            intensity: 2,
        }).isGeneratable
    })
    const unused = compatible.filter(({ visualTraitId, evolutionFunction }) => !input.previousTransformations?.some((previous) => (
        previous.evolutionTargetId === input.evolutionTargetId
        && previous.visualTraitId === visualTraitId
        && previous.evolutionFunction === evolutionFunction
    )))
    const candidates = unused.length ? unused : compatible
    return candidates.length ? candidates[stableIndex(`${input.evolutionTargetId}:${input.seed ?? ''}`, candidates.length)]! : null
}