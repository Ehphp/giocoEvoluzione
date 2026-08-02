import type { BodyArea } from './body-areas.ts'
import type { TransformationIntensity } from './concepts.ts'
import type { MutationArchetype } from './mutation-archetypes.ts'
import type { VisualTraitDefinition, VisualTraitId } from './visual-traits.ts'

export const VISUAL_TRAIT_PROMPT_LABELS: Readonly<Record<VisualTraitId, string>> = Object.freeze({
    IMPACT_ADAPTATION: 'protective response to impacts',
    LOCOMOTION_ADAPTATION: 'enhanced movement',
    SENSORY_EXPANSION: 'expanded perception',
    ENERGY_REGULATION: 'energy regulation',
    AQUATIC_MORPHOLOGY: 'aquatic body shaping',
})

export const BODY_AREA_PROMPT_LABELS: Readonly<Record<BodyArea, string>> = Object.freeze({
    HEAD_SURFACE: 'surface of the head',
    EYE_REGION: 'eye region',
    FACE: 'face',
    NECK: 'neck',
    BACK: 'back',
    CHEST: 'chest',
    FORELIMBS: 'front limbs',
    HIND_LIMBS: 'rear limbs',
    TAIL: 'tail',
    SKIN_SURFACE: 'skin surface',
})

export const MUTATION_ARCHETYPE_PROMPT_LABELS: Readonly<Record<MutationArchetype, string>> = Object.freeze({
    LAYERED_PLATING: 'layered protective plating',
    ELASTIC_CUSHIONING: 'elastic impact cushioning',
    SPRING_TENDONS: 'spring-like tendons',
    GRIPPING_PADS: 'gripping pads',
    BALANCE_TAIL: 'a balance-supporting tail structure',
    SENSORY_FRILLS: 'perceptive frills',
    FOCUSED_OCELLI: 'focused auxiliary eye spots',
    VIBRATION_FILAMENTS: 'vibration-sensitive filaments',
    THERMAL_MEMBRANES: 'thermal regulating membranes',
    GLANDULAR_RESERVOIRS: 'glandular energy reservoirs',
    VENTILATION_RIDGES: 'ventilation ridges',
    HYDRODYNAMIC_WEBBING: 'hydrodynamic webbing',
    STREAMLINED_RIDGES: 'streamlined ridges',
    FILTERING_FRONDS: 'filtering fronds',
})

export const INTENSITY_PROMPT_LABELS: Readonly<Record<TransformationIntensity, string>> = Object.freeze({
    1: 'subtle but clearly visible',
    2: 'substantial and balanced',
    3: 'pronounced while preserving identity',
})

export function describeVisualTraitLimits(visualTrait: VisualTraitDefinition): string {
    return `Keep the ${VISUAL_TRAIT_PROMPT_LABELS[visualTrait.id]} within its approved scope: at most ${visualTrait.creativeLimits.maxPrimaryBodyAreas} primary body areas and up to ${visualTrait.creativeLimits.maxSecondaryMutations} secondary mutations.`
}

