import type { BodyArea } from './body-areas.ts'
import type { ColorEvolution, ColorEvolutionMode, TransformationIntensity } from './concepts.ts'
import type { EvolutionFunctionId, EvolutionTargetDefinition } from './evolution-targets.ts'
import type { VisualTraitDefinition, VisualTraitId } from './visual-traits.ts'

export type ColorEvolutionIntensity = 0 | TransformationIntensity

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

export const VISUALLY_SIGNIFICANT_COLOR_BODY_AREAS = Object.freeze([
    'NECK',
    'BACK',
    'CHEST',
    'FORELIMBS',
    'HIND_LIMBS',
    'TAIL',
    'SKIN_SURFACE',
] as const satisfies readonly BodyArea[])

export type EvolutionConstraintReasonCode =
    | 'EVOLUTION_TARGET_TRAIT_INCOMPATIBLE'
    | 'EVOLUTION_FUNCTION_TRAIT_INCOMPATIBLE'
    | 'NO_ALLOWED_PRIMARY_BODY_AREA'

export type EvolutionConstraintReason = Readonly<{
    code: EvolutionConstraintReasonCode
    message: string
}>

export type ColorEvolutionConstraints = Readonly<{
    required: boolean
    allowedModes: readonly ColorEvolutionMode[]
    allowedIntensities: Readonly<Record<ColorEvolutionMode, readonly ColorEvolutionIntensity[]>>
    requiresAffectedBodyAreasForModes: readonly Exclude<ColorEvolutionMode, 'PRESERVE'>[]
    requiresVisuallySignificantAreaForModes: readonly Exclude<ColorEvolutionMode, 'PRESERVE'>[]
    requiresSkinSurfaceForModes: readonly Exclude<ColorEvolutionMode, 'PRESERVE'>[]
    visuallySignificantBodyAreas: readonly BodyArea[]
}>

export type EvolutionConstraints = Readonly<{
    isTargeted: boolean
    isGeneratable: boolean
    structuralReasons: readonly EvolutionConstraintReason[]
    allowedPrimaryBodyAreas: readonly BodyArea[]
    allowedSupportingBodyAreas: readonly BodyArea[]
    allowedColorBodyAreas: readonly BodyArea[]
    colorEvolution: ColorEvolutionConstraints
}>

export type ColorEvolutionConstraintViolation =
    | 'MODE_NOT_ALLOWED'
    | 'INTENSITY_NOT_ALLOWED'
    | 'AFFECTED_BODY_AREA_NOT_ALLOWED'
    | 'PRESERVE_PAYLOAD_NOT_EMPTY'
    | 'AFFECTED_BODY_AREA_REQUIRED'
    | 'VISUALLY_SIGNIFICANT_AREA_REQUIRED'
    | 'SKIN_SURFACE_REQUIRED'

export type GetEvolutionConstraintsInput = Readonly<{
    evolutionTarget?: EvolutionTargetDefinition
    visualTrait: VisualTraitDefinition
    evolutionFunction?: EvolutionFunctionId
    intensity: TransformationIntensity
}>

function intersection<T>(left: readonly T[], right: readonly T[]): T[] {
    return left.filter((value) => right.includes(value))
}

function freeze<T>(values: readonly T[]): readonly T[] {
    return Object.freeze([...values])
}

function allowedColorModes(input: {
    intensity: TransformationIntensity
    allowedColorBodyAreas: readonly BodyArea[]
    visuallySignificantBodyAreas: readonly BodyArea[]
}): readonly ColorEvolutionMode[] {
    const canUseNonPreserve = input.allowedColorBodyAreas.length > 0
        && (input.intensity < 2 || input.visuallySignificantBodyAreas.length > 0)
        && (input.intensity < 3 || input.allowedColorBodyAreas.includes('SKIN_SURFACE'))
    const modes: ColorEvolutionMode[] = ['PRESERVE']
    if (canUseNonPreserve && input.intensity <= 2) modes.push('EXPAND')
    if (canUseNonPreserve && input.intensity >= 2) modes.push('SHIFT')
    return freeze(modes)
}

export function getEvolutionConstraints(input: GetEvolutionConstraintsInput): EvolutionConstraints {
    const target = input.evolutionTarget
    const allowedPrimaryBodyAreas = target
        ? intersection(target.primaryBodyAreas, input.visualTrait.allowedBodyAreas)
        : [...input.visualTrait.allowedBodyAreas]
    const allowedSupportingBodyAreas = target
        ? intersection(target.supportingBodyAreas, input.visualTrait.allowedBodyAreas)
        : []
    const allowedColorBodyAreas = target
        ? intersection([...target.primaryBodyAreas, ...target.supportingBodyAreas], input.visualTrait.allowedBodyAreas)
        : [...input.visualTrait.allowedBodyAreas]
    const visuallySignificantBodyAreas = intersection(allowedColorBodyAreas, VISUALLY_SIGNIFICANT_COLOR_BODY_AREAS)
    const structuralReasons: EvolutionConstraintReason[] = []

    if (target && target.compatibleVisualTraits && !target.compatibleVisualTraits.includes(input.visualTrait.id)) {
        structuralReasons.push({
            code: 'EVOLUTION_TARGET_TRAIT_INCOMPATIBLE',
            message: 'Il Visual Trait non e compatibile con il target anatomico scelto.',
        })
    }
    if (target && (!input.evolutionFunction || !EVOLUTION_FUNCTION_VISUAL_TRAITS[input.evolutionFunction].includes(input.visualTrait.id))) {
        structuralReasons.push({
            code: 'EVOLUTION_FUNCTION_TRAIT_INCOMPATIBLE',
            message: 'La funzione evolutiva non produce il Visual Trait richiesto.',
        })
    }
    if (!allowedPrimaryBodyAreas.length) {
        structuralReasons.push({
            code: 'NO_ALLOWED_PRIMARY_BODY_AREA',
            message: 'Target anatomico e Visual Trait non condividono un area primaria valida.',
        })
    }

    const allowedModes = allowedColorModes({
        intensity: input.intensity,
        allowedColorBodyAreas,
        visuallySignificantBodyAreas,
    })
    const nonPreserveModes = allowedModes.filter((mode): mode is Exclude<ColorEvolutionMode, 'PRESERVE'> => mode !== 'PRESERVE')
    const requiresVisuallySignificantArea = input.intensity >= 2 ? nonPreserveModes : []
    const requiresSkinSurface = input.intensity === 3 && allowedModes.includes('SHIFT') ? ['SHIFT'] as const : []

    return Object.freeze({
        isTargeted: Boolean(target),
        isGeneratable: !structuralReasons.length,
        structuralReasons: freeze(structuralReasons),
        allowedPrimaryBodyAreas: freeze(allowedPrimaryBodyAreas),
        allowedSupportingBodyAreas: freeze(allowedSupportingBodyAreas),
        allowedColorBodyAreas: freeze(allowedColorBodyAreas),
        colorEvolution: Object.freeze({
            required: Boolean(target),
            allowedModes,
            allowedIntensities: Object.freeze({
                PRESERVE: Object.freeze([0] as const),
                EXPAND: allowedModes.includes('EXPAND') ? Object.freeze([input.intensity] as const) : Object.freeze([] as const),
                SHIFT: allowedModes.includes('SHIFT') ? Object.freeze([input.intensity] as const) : Object.freeze([] as const),
            }),
            requiresAffectedBodyAreasForModes: freeze(nonPreserveModes),
            requiresVisuallySignificantAreaForModes: freeze(requiresVisuallySignificantArea),
            requiresSkinSurfaceForModes: freeze(requiresSkinSurface),
            visuallySignificantBodyAreas: freeze(visuallySignificantBodyAreas),
        }),
    })
}

export function getColorEvolutionConstraintViolations(
    evolution: ColorEvolution,
    constraints: EvolutionConstraints,
): readonly ColorEvolutionConstraintViolation[] {
    const violations: ColorEvolutionConstraintViolation[] = []
    const color = constraints.colorEvolution
    if (!color.allowedModes.includes(evolution.mode)) violations.push('MODE_NOT_ALLOWED')
    if (!color.allowedIntensities[evolution.mode].includes(evolution.intensity)) violations.push('INTENSITY_NOT_ALLOWED')
    if (evolution.affectedBodyAreas.some((area) => !constraints.allowedColorBodyAreas.includes(area))) {
        violations.push('AFFECTED_BODY_AREA_NOT_ALLOWED')
    }
    if (evolution.mode === 'PRESERVE') {
        if (evolution.affectedBodyAreas.length || evolution.secondaryColors.length || evolution.accentColors.length || evolution.surfaceEffects.length) {
            violations.push('PRESERVE_PAYLOAD_NOT_EMPTY')
        }
        return freeze(violations)
    }
    if (!evolution.affectedBodyAreas.length) violations.push('AFFECTED_BODY_AREA_REQUIRED')
    if (color.requiresVisuallySignificantAreaForModes.includes(evolution.mode)
        && !evolution.affectedBodyAreas.some((area) => color.visuallySignificantBodyAreas.includes(area))) {
        violations.push('VISUALLY_SIGNIFICANT_AREA_REQUIRED')
    }
    if (color.requiresSkinSurfaceForModes.includes(evolution.mode) && !evolution.affectedBodyAreas.includes('SKIN_SURFACE')) {
        violations.push('SKIN_SURFACE_REQUIRED')
    }
    return freeze(violations)
}