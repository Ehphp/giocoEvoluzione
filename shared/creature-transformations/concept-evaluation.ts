import { resolveColorEvolution, type CreatureTransformationConcept } from './concepts.ts'
import type { CreatureSemanticIdentity } from './contracts.ts'
import type { ConceptProblem } from './concept-validation.ts'
import { getColorEvolutionConstraintViolations, getEvolutionConstraints } from './evolution-constraints.ts'
import { EVOLUTION_TARGET_BY_ID } from './evolution-targets.ts'
import { VISUAL_TRAIT_BY_ID } from './visual-traits.ts'

export type IdentityRisk = 'LOW' | 'MEDIUM' | 'HIGH'
export type TransformationStrength = 'WEAK' | 'BALANCED' | 'EXCESSIVE'

export type ConceptEvaluationContext = {
    identity: CreatureSemanticIdentity
}

export type ConceptEvaluation = {
    acceptable: boolean
    identityRisk: IdentityRisk
    transformationStrength: TransformationStrength
    problems: ConceptProblem[]
}

const IDENTITY_BREAKING_PATTERN = /(?:nuova specie|cambio di specie|sostituzione del volto|anatomia umanoide|trasformazione totale|completamente diverso)/i
const DECORATIVE_PATTERN = /(?:decorativ\w*|ornament\w*|solo colore|puramente estetico)/i
const SILHOUETTE_PATTERN = /(?:silhouette|proporzioni|corpo intero|struttura corporea)/i

function normalize(value: string): string {
    return value.trim().toLocaleLowerCase('it-IT')
}

function preservesFeature(identityToPreserve: readonly string[], feature: string): boolean {
    const normalizedFeature = normalize(feature)
    return identityToPreserve.some((entry) => {
        const normalizedEntry = normalize(entry)
        return normalizedEntry.includes(normalizedFeature) || normalizedFeature.includes(normalizedEntry)
    })
}

function getCreativeText(concept: CreatureTransformationConcept): string {
    const colorEvolution = resolveColorEvolution(concept)
    return [concept.conceptName, concept.evolutionaryFunction, concept.primaryMutation.morphology, concept.primaryMutation.material, ...concept.secondaryMutations, colorEvolution.dominantColor, ...colorEvolution.secondaryColors, ...colorEvolution.accentColors, ...colorEvolution.surfaceEffects, colorEvolution.biologicalRationale].join(' ')
}

function evaluateColorEvolution(concept: CreatureTransformationConcept): ConceptProblem[] {
    const visualTrait = VISUAL_TRAIT_BY_ID[concept.visualTrait]
    if (!visualTrait) return [{ code: 'INVALID_VISUAL_TRAIT', message: 'Il Visual Trait del concept non appartiene al catalogo.' }]
    const constraints = getEvolutionConstraints({
        evolutionTarget: concept.evolutionTargetId ? EVOLUTION_TARGET_BY_ID[concept.evolutionTargetId] : undefined,
        visualTrait,
        evolutionFunction: concept.evolutionFunction,
        intensity: concept.intensity,
    })
    if (constraints.colorEvolution.required && concept.colorEvolution === undefined) {
        return [{ code: 'COLOR_EVOLUTION_INCOHERENT', message: 'L evoluzione anatomica richiede un cambiamento cromatico esplicito.' }]
    }
    const colorEvolution = resolveColorEvolution(concept)
    return getColorEvolutionConstraintViolations(colorEvolution, constraints).map((violation) => {
        const weak = violation === 'AFFECTED_BODY_AREA_REQUIRED' || violation === 'VISUALLY_SIGNIFICANT_AREA_REQUIRED' || violation === 'SKIN_SURFACE_REQUIRED'
        const message = weak
            ? 'Il cambio cromatico richiesto non interessa una porzione corporea abbastanza leggibile.'
            : 'Il cambio cromatico non rispetta i vincoli dell evoluzione richiesta.'
        return { code: weak ? 'COLOR_EVOLUTION_TOO_WEAK' : 'COLOR_EVOLUTION_INCOHERENT', message }
    })
}

function evaluateIdentityRisk(concept: CreatureTransformationConcept, context: ConceptEvaluationContext, creativeText: string): IdentityRisk {
    const sensitiveAreas = concept.primaryMutation.bodyAreas.filter((area) => area === 'FACE' || area === 'EYE_REGION' || area === 'HEAD_SURFACE')
    const missingFeature = context.identity.identityFeatures.some((feature) => !preservesFeature(concept.identityToPreserve, feature))
    const invasiveCombination = sensitiveAreas.length >= 2 && concept.intensity === 3 && concept.secondaryMutations.length >= 2

    if (IDENTITY_BREAKING_PATTERN.test(creativeText) || concept.primaryMutation.bodyAreas.includes('FACE') || missingFeature || invasiveCombination) {
        return 'HIGH'
    }
    if (sensitiveAreas.length > 0 || concept.primaryMutation.bodyAreas.length === 2 || concept.intensity === 3 || concept.secondaryMutations.length >= 2) {
        return 'MEDIUM'
    }
    return 'LOW'
}

function evaluateTransformationStrength(concept: CreatureTransformationConcept, creativeText: string): TransformationStrength {
    const hasOnlySurfaceChange = concept.primaryMutation.bodyAreas.length === 1 && concept.primaryMutation.bodyAreas[0] === 'SKIN_SURFACE'
    const isWeak = concept.primaryMutation.morphology.length < 18
        || DECORATIVE_PATTERN.test(creativeText)
        || (hasOnlySurfaceChange && !concept.secondaryMutations.length && concept.intensity === 1)
    const isExcessive = (concept.primaryMutation.bodyAreas.length >= 2 && concept.secondaryMutations.length >= 3 && concept.intensity === 3)
        || SILHOUETTE_PATTERN.test(creativeText)

    if (isExcessive) return 'EXCESSIVE'
    return isWeak ? 'WEAK' : 'BALANCED'
}

export function evaluateCreatureTransformationConcept(concept: CreatureTransformationConcept, context: ConceptEvaluationContext): ConceptEvaluation {
    const creativeText = getCreativeText(concept)
    const identityRisk = evaluateIdentityRisk(concept, context, creativeText)
    const transformationStrength = evaluateTransformationStrength(concept, creativeText)
    const problems: ConceptProblem[] = evaluateColorEvolution(concept)

    if (identityRisk === 'HIGH') problems.push({ code: 'IDENTITY_RISK_HIGH', message: 'Il concept rischia di compromettere l identita riconoscibile della creatura.' })
    if (transformationStrength === 'WEAK') problems.push({ code: 'TRANSFORMATION_TOO_WEAK', message: 'La mutazione e troppo decorativa o poco leggibile.' })
    if (transformationStrength === 'EXCESSIVE') problems.push({ code: 'TRANSFORMATION_EXCESSIVE', message: 'La mutazione supera la forza visiva adatta alla creatura.' })

    return {
        acceptable: identityRisk !== 'HIGH' && transformationStrength === 'BALANCED' && !problems.length,
        identityRisk,
        transformationStrength,
        problems,
    }
}
