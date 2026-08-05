import { BODY_AREAS, type BodyArea } from './body-areas.ts'
import { COLOR_EVOLUTION_MODES, TRANSFORMATION_INTENSITIES, type ColorEvolution, type ColorEvolutionMode, type CreatureTransformationConcept, type TransformationIntensity } from './concepts.ts'
import type { CreatureSemanticIdentity } from './contracts.ts'
import { EVOLUTION_FUNCTION_IDS, type EvolutionFunctionId, type EvolutionTargetDefinition } from './evolution-targets.ts'
import { MUTATION_ARCHETYPES, type MutationArchetype } from './mutation-archetypes.ts'
import type { VisualTraitDefinition } from './visual-traits.ts'
import type { PreviousCreatureTransformationSummary } from './creature-visual-versions.ts'

export type ConceptProblemCode =
    | 'INVALID_CONCEPT'
    | 'INVALID_SCHEMA_VERSION'
    | 'INVALID_VISUAL_TRAIT'
    | 'INVALID_INTENSITY'
    | 'INVALID_MUTATION_ARCHETYPE'
    | 'BODY_AREA_NOT_ALLOWED'
    | 'TOO_MANY_BODY_AREAS'
    | 'TOO_MANY_SECONDARY_MUTATIONS'
    | 'MISSING_PRIMARY_MUTATION'
    | 'MISSING_IDENTITY_PRESERVATION'
    | 'FORBIDDEN_TECHNICAL_INSTRUCTION'
    | 'CONTRADICTORY_INSTRUCTIONS'
    | 'IDENTITY_RISK_HIGH'
    | 'TRANSFORMATION_TOO_WEAK'
    | 'TRANSFORMATION_EXCESSIVE'
    | 'UNKNOWN_FIELD'
    | 'MISSING_REQUIRED_FIELD'
    | 'INVALID_FIELD_TYPE'
    | 'EMPTY_TEXT_FIELD'
    | 'PREVIOUS_TRANSFORMATION_REMOVED'
    | 'INVALID_EVOLUTION_TARGET'
    | 'INVALID_EVOLUTION_FUNCTION'
    | 'SUPPORTING_BODY_AREA_NOT_ALLOWED'
    | 'TOO_MANY_SUPPORTING_BODY_AREAS'
    | 'REPEATED_EVOLUTION_DIRECTION'
    | 'GLOBAL_MUTATION_NOT_ALLOWED'
    | 'INVALID_COLOR_EVOLUTION'
    | 'INVALID_COLOR_EVOLUTION_MODE'
    | 'COLOR_EVOLUTION_TOO_WEAK'
    | 'COLOR_EVOLUTION_INCOHERENT'

export type ConceptProblem = {
    code: ConceptProblemCode
    message: string
    path?: string
}

export type ConceptValidationContext = {
    requestedVisualTrait: VisualTraitDefinition
    requestedEvolutionTarget?: EvolutionTargetDefinition
    requestedEvolutionFunction?: EvolutionFunctionId
    requestedIntensity: TransformationIntensity
    identity: CreatureSemanticIdentity
    previousTransformations?: readonly PreviousCreatureTransformationSummary[]
}

export type ConceptValidationResult =
    | { valid: true; concept: CreatureTransformationConcept }
    | { valid: false; problems: ConceptProblem[] }

type UnknownRecord = Record<string, unknown>

const CONCEPT_FIELDS = new Set([
    'schemaVersion', 'visualTrait', 'evolutionTargetId', 'evolutionFunction', 'conceptName', 'evolutionaryFunction', 'primaryMutation',
    'secondaryMutations', 'identityToPreserve', 'forbiddenChanges', 'intensity',
    'colorEvolution',
])
const PRIMARY_MUTATION_FIELDS = new Set(['mutationArchetype', 'bodyAreas', 'supportingBodyAreas', 'morphology', 'material'])
const COLOR_EVOLUTION_FIELDS = new Set([
    'mode', 'dominantColor', 'secondaryColors', 'accentColors', 'surfaceEffects', 'affectedBodyAreas', 'intensity', 'biologicalRationale',
])
const COLOR_EVOLUTION_INTENSITIES = new Set([0, ...TRANSFORMATION_INTENSITIES])
const VISUALLY_SIGNIFICANT_COLOR_AREAS = new Set<BodyArea>(['NECK', 'BACK', 'CHEST', 'FORELIMBS', 'HIND_LIMBS', 'TAIL', 'SKIN_SURFACE'])
const TECHNICAL_INSTRUCTION_PATTERN = /\b(?:png|jpe?g|webp|canvas|alpha|trasparen\w*|sfondo|background|dimension\w*|pixel|risoluzione|resolution|posa|pose|path|url|1024|1536)\b/i
const IDENTITY_BREAKING_PATTERN = /(?:nuova specie|cambio di specie|sostituzione del volto|anatomia umanoide|trasformazione totale|completamente diverso)/i
const PREVIOUS_TRANSFORMATION_REMOVAL_PATTERN = /(?:rimuov|elimin|cancell|sostituisc|remove|replace).*(?:mutazion|evoluzion|adaptation)/i
const GLOBAL_MUTATION_PATTERN = /(?:intero corpo|corpo intero|globale|global|silhouette|proporzioni)/i

function isRecord(value: unknown): value is UnknownRecord {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function makeProblem(code: ConceptProblemCode, message: string, path?: string): ConceptProblem {
    return path ? { code, message, path } : { code, message }
}

function readNonEmptyString(record: UnknownRecord, field: string, path: string, problems: ConceptProblem[]): string | null {
    const value = record[field]
    if (value === undefined) {
        problems.push(makeProblem('MISSING_REQUIRED_FIELD', `Il campo ${path} e obbligatorio.`, path))
        return null
    }
    if (typeof value !== 'string') {
        problems.push(makeProblem('INVALID_FIELD_TYPE', `Il campo ${path} deve essere una stringa.`, path))
        return null
    }
    const trimmed = value.trim()
    if (!trimmed) {
        problems.push(makeProblem('EMPTY_TEXT_FIELD', `Il campo ${path} non puo essere vuoto.`, path))
        return null
    }
    return trimmed
}

function readStringArray(record: UnknownRecord, field: string, path: string, problems: ConceptProblem[]): string[] | null {
    const value = record[field]
    if (value === undefined) {
        problems.push(makeProblem('MISSING_REQUIRED_FIELD', `Il campo ${path} e obbligatorio.`, path))
        return null
    }
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
        problems.push(makeProblem('INVALID_FIELD_TYPE', `Il campo ${path} deve contenere solo stringhe non vuote.`, path))
        return null
    }
    return value.map((entry) => entry.trim())
}

function checkUnknownFields(record: UnknownRecord, allowedFields: Set<string>, prefix: string, problems: ConceptProblem[]) {
    for (const field of Object.keys(record)) {
        if (!allowedFields.has(field)) {
            problems.push(makeProblem('UNKNOWN_FIELD', `Il campo ${prefix}${field} non e previsto dal contratto.`, `${prefix}${field}`))
        }
    }
}

function isBodyArea(value: string): value is BodyArea {
    return BODY_AREAS.includes(value as BodyArea)
}

function isMutationArchetype(value: string): value is MutationArchetype {
    return MUTATION_ARCHETYPES.includes(value as MutationArchetype)
}

function isEvolutionFunction(value: string): value is EvolutionFunctionId {
    return EVOLUTION_FUNCTION_IDS.includes(value as EvolutionFunctionId)
}

function isColorEvolutionMode(value: string): value is ColorEvolutionMode {
    return COLOR_EVOLUTION_MODES.includes(value as ColorEvolutionMode)
}

function normalize(value: string): string {
    return value.trim().toLocaleLowerCase('it-IT')
}

function normalizeStructuralFeature(value: string): string {
    return normalize(value).replace(/\b(corpo|body)\s+(?:verde|lime|turchese|teal|blu|blue|viola|indaco|indigo)\b/g, '$1')
}

function preservesFeature(identityToPreserve: readonly string[], requiredFeature: string): boolean {
    const normalizedFeature = normalizeStructuralFeature(requiredFeature)
    return identityToPreserve.some((entry) => {
        const normalizedEntry = normalizeStructuralFeature(entry)
        return normalizedEntry.includes(normalizedFeature) || normalizedFeature.includes(normalizedEntry)
    })
}

function readColorEvolution(candidate: UnknownRecord, context: ConceptValidationContext, problems: ConceptProblem[]): ColorEvolution | undefined {
    if (candidate.colorEvolution === undefined) return undefined
    if (!isRecord(candidate.colorEvolution)) {
        problems.push(makeProblem('INVALID_COLOR_EVOLUTION', 'colorEvolution deve essere un oggetto completo.', 'colorEvolution'))
        return undefined
    }

    const evolution = candidate.colorEvolution
    checkUnknownFields(evolution, COLOR_EVOLUTION_FIELDS, 'colorEvolution.', problems)
    const mode = readNonEmptyString(evolution, 'mode', 'colorEvolution.mode', problems)
    const dominantColor = readNonEmptyString(evolution, 'dominantColor', 'colorEvolution.dominantColor', problems)
    const secondaryColors = readStringArray(evolution, 'secondaryColors', 'colorEvolution.secondaryColors', problems)
    const accentColors = readStringArray(evolution, 'accentColors', 'colorEvolution.accentColors', problems)
    const surfaceEffects = readStringArray(evolution, 'surfaceEffects', 'colorEvolution.surfaceEffects', problems)
    const biologicalRationale = readNonEmptyString(evolution, 'biologicalRationale', 'colorEvolution.biologicalRationale', problems)
    const intensity = evolution.intensity
    if (!COLOR_EVOLUTION_INTENSITIES.has(intensity as number)) {
        problems.push(makeProblem('INVALID_COLOR_EVOLUTION', 'colorEvolution.intensity deve essere 0, 1, 2 o 3.', 'colorEvolution.intensity'))
    }
    if (mode !== null && !isColorEvolutionMode(mode)) {
        problems.push(makeProblem('INVALID_COLOR_EVOLUTION_MODE', 'colorEvolution.mode deve essere PRESERVE, EXPAND o SHIFT.', 'colorEvolution.mode'))
    }

    let affectedBodyAreas: BodyArea[] | null = null
    if (!Array.isArray(evolution.affectedBodyAreas) || evolution.affectedBodyAreas.some((area) => typeof area !== 'string')) {
        problems.push(makeProblem('INVALID_COLOR_EVOLUTION', 'colorEvolution.affectedBodyAreas deve contenere solo aree corporee valide.', 'colorEvolution.affectedBodyAreas'))
    } else {
        affectedBodyAreas = []
        for (const [index, area] of evolution.affectedBodyAreas.entries()) {
            const targetAllowsArea = !context.requestedEvolutionTarget
                || context.requestedEvolutionTarget.primaryBodyAreas.includes(area as BodyArea)
                || context.requestedEvolutionTarget.supportingBodyAreas.includes(area as BodyArea)
            if (!isBodyArea(area) || !context.requestedVisualTrait.allowedBodyAreas.includes(area) || !targetAllowsArea) {
                problems.push(makeProblem('INVALID_COLOR_EVOLUTION', `L area cromatica ${area} non e ammessa dal Visual Trait richiesto.`, `colorEvolution.affectedBodyAreas.${index}`))
            } else {
                affectedBodyAreas.push(area)
            }
        }
    }

    if (isColorEvolutionMode(mode ?? '') && typeof intensity === 'number' && affectedBodyAreas !== null) {
        if (mode === 'PRESERVE') {
            if (intensity !== 0 || affectedBodyAreas.length || secondaryColors?.length || accentColors?.length || surfaceEffects?.length) {
                problems.push(makeProblem('COLOR_EVOLUTION_INCOHERENT', 'PRESERVE non puo richiedere nuovi colori, effetti o zone cromatiche.', 'colorEvolution'))
            }
        } else {
            if (intensity !== context.requestedIntensity) {
                problems.push(makeProblem('COLOR_EVOLUTION_INCOHERENT', 'L intensita cromatica deve corrispondere all intensita della trasformazione.', 'colorEvolution.intensity'))
            }
            if (!affectedBodyAreas.length || (intensity >= 2 && !affectedBodyAreas.some((area) => VISUALLY_SIGNIFICANT_COLOR_AREAS.has(area)))) {
                problems.push(makeProblem('COLOR_EVOLUTION_TOO_WEAK', 'Il cambiamento cromatico deve interessare porzioni corporee leggibili nell immagine completa.', 'colorEvolution.affectedBodyAreas'))
            }
            if ((mode === 'SHIFT' && intensity < 2) || (mode === 'EXPAND' && intensity === 3)) {
                problems.push(makeProblem('COLOR_EVOLUTION_INCOHERENT', 'SHIFT richiede intensita 2 o 3, mentre l intensita 3 richiede SHIFT della palette dominante.', 'colorEvolution.mode'))
            }
            if (intensity === 3 && !affectedBodyAreas.includes('SKIN_SURFACE')) {
                problems.push(makeProblem('COLOR_EVOLUTION_TOO_WEAK', 'All intensita 3 il cambio della palette dominante deve essere visibile sull insieme del corpo.', 'colorEvolution.affectedBodyAreas'))
            }
        }
    }

    if (mode === null || dominantColor === null || secondaryColors === null || accentColors === null || surfaceEffects === null || biologicalRationale === null || affectedBodyAreas === null || !isColorEvolutionMode(mode) || !COLOR_EVOLUTION_INTENSITIES.has(intensity as number)) {
        return undefined
    }
    return { mode, dominantColor, secondaryColors, accentColors, surfaceEffects, affectedBodyAreas, intensity: intensity as ColorEvolution['intensity'], biologicalRationale }
}

export function validateCreatureTransformationConcept(candidate: unknown, context: ConceptValidationContext): ConceptValidationResult {
    const problems: ConceptProblem[] = []
    const requestedTarget = context.requestedEvolutionTarget
    if (!isRecord(candidate)) {
        return { valid: false, problems: [makeProblem('INVALID_CONCEPT', 'Il concept deve essere un oggetto JSON.')] }
    }

    checkUnknownFields(candidate, CONCEPT_FIELDS, '', problems)
    if (candidate.schemaVersion !== (requestedTarget ? 2 : 1)) {
        problems.push(makeProblem('INVALID_SCHEMA_VERSION', requestedTarget ? 'Le evoluzioni anatomiche richiedono schemaVersion 2.' : 'I concept legacy richiedono schemaVersion 1.', 'schemaVersion'))
    }

    const visualTrait = readNonEmptyString(candidate, 'visualTrait', 'visualTrait', problems)
    if (visualTrait !== null && visualTrait !== context.requestedVisualTrait.id) {
        problems.push(makeProblem('INVALID_VISUAL_TRAIT', 'Il Visual Trait non corrisponde a quello richiesto.', 'visualTrait'))
    }
    const evolutionTargetId = candidate.evolutionTargetId
    const evolutionFunction = candidate.evolutionFunction
    if (requestedTarget) {
        if (evolutionTargetId !== requestedTarget.id) {
            problems.push(makeProblem('INVALID_EVOLUTION_TARGET', 'Il target anatomico non corrisponde alla scelta della track.', 'evolutionTargetId'))
        }
        if (typeof evolutionFunction !== 'string' || !isEvolutionFunction(evolutionFunction)) {
            problems.push(makeProblem('INVALID_EVOLUTION_FUNCTION', 'La funzione evolutiva non appartiene al catalogo.', 'evolutionFunction'))
        } else if (context.requestedEvolutionFunction && evolutionFunction !== context.requestedEvolutionFunction) {
            problems.push(makeProblem('INVALID_EVOLUTION_FUNCTION', 'La funzione evolutiva non corrisponde alla direzione risolta.', 'evolutionFunction'))
        }
        if (visualTrait !== null && !requestedTarget.compatibleVisualTraits.includes(visualTrait as VisualTraitDefinition['id'])) {
            problems.push(makeProblem('INVALID_VISUAL_TRAIT', 'Il Visual Trait non e compatibile con il target anatomico.', 'visualTrait'))
        }
    }
    const conceptName = readNonEmptyString(candidate, 'conceptName', 'conceptName', problems)
    const evolutionaryFunction = readNonEmptyString(candidate, 'evolutionaryFunction', 'evolutionaryFunction', problems)
    const secondaryMutations = readStringArray(candidate, 'secondaryMutations', 'secondaryMutations', problems)
    const identityToPreserve = readStringArray(candidate, 'identityToPreserve', 'identityToPreserve', problems)
    const forbiddenChanges = readStringArray(candidate, 'forbiddenChanges', 'forbiddenChanges', problems)
    const colorEvolution = readColorEvolution(candidate, context, problems)

    const intensity = candidate.intensity
    if (!TRANSFORMATION_INTENSITIES.includes(intensity as TransformationIntensity) || intensity !== context.requestedIntensity) {
        problems.push(makeProblem('INVALID_INTENSITY', 'L intensita deve corrispondere al valore richiesto.', 'intensity'))
    }

    let primaryMutation: CreatureTransformationConcept['primaryMutation'] | null = null
    if (!isRecord(candidate.primaryMutation)) {
        problems.push(makeProblem('MISSING_PRIMARY_MUTATION', 'primaryMutation deve essere un oggetto completo.', 'primaryMutation'))
    } else {
        const mutation = candidate.primaryMutation
        checkUnknownFields(mutation, PRIMARY_MUTATION_FIELDS, 'primaryMutation.', problems)
        const mutationArchetype = readNonEmptyString(mutation, 'mutationArchetype', 'primaryMutation.mutationArchetype', problems)
        const morphology = readNonEmptyString(mutation, 'morphology', 'primaryMutation.morphology', problems)
        const material = readNonEmptyString(mutation, 'material', 'primaryMutation.material', problems)
        let bodyAreas: BodyArea[] | null = null
        let supportingBodyAreas: BodyArea[] | undefined

        if (!Array.isArray(mutation.bodyAreas) || !mutation.bodyAreas.length || mutation.bodyAreas.some((area) => typeof area !== 'string')) {
            problems.push(makeProblem('MISSING_PRIMARY_MUTATION', 'primaryMutation.bodyAreas deve contenere almeno un area valida.', 'primaryMutation.bodyAreas'))
        } else {
            bodyAreas = []
            for (const [index, bodyArea] of mutation.bodyAreas.entries()) {
                if (!isBodyArea(bodyArea)) {
                    problems.push(makeProblem('BODY_AREA_NOT_ALLOWED', `L area ${bodyArea} non appartiene al catalogo.`, `primaryMutation.bodyAreas.${index}`))
                } else if (!context.requestedVisualTrait.allowedBodyAreas.includes(bodyArea)) {
                    problems.push(makeProblem('BODY_AREA_NOT_ALLOWED', `L area ${bodyArea} non e ammessa dal Visual Trait richiesto.`, `primaryMutation.bodyAreas.${index}`))
                } else {
                    bodyAreas.push(bodyArea)
                }
            }
        }

        if (bodyAreas !== null && bodyAreas.length > context.requestedVisualTrait.creativeLimits.maxPrimaryBodyAreas) {
            problems.push(makeProblem('TOO_MANY_BODY_AREAS', 'La mutazione primaria supera il limite di aree corporee.', 'primaryMutation.bodyAreas'))
        }
        if (requestedTarget && bodyAreas !== null) {
            if ((Array.isArray(mutation.bodyAreas) ? mutation.bodyAreas.length : 0) !== 1) {
                problems.push(makeProblem('TOO_MANY_BODY_AREAS', 'Un evoluzione anatomica deve avere una sola area primaria.', 'primaryMutation.bodyAreas'))
            } else if (!requestedTarget.primaryBodyAreas.includes(bodyAreas[0]!)) {
                problems.push(makeProblem('BODY_AREA_NOT_ALLOWED', 'L area primaria non appartiene al target anatomico scelto.', 'primaryMutation.bodyAreas.0'))
            }
        }
        if (mutation.supportingBodyAreas !== undefined) {
            if (!Array.isArray(mutation.supportingBodyAreas) || mutation.supportingBodyAreas.some((area) => typeof area !== 'string')) {
                problems.push(makeProblem('SUPPORTING_BODY_AREA_NOT_ALLOWED', 'Le aree di supporto devono contenere solo aree corporee valide.', 'primaryMutation.supportingBodyAreas'))
            } else {
                supportingBodyAreas = []
                for (const [index, supportingArea] of mutation.supportingBodyAreas.entries()) {
                    if (!isBodyArea(supportingArea) || !requestedTarget?.supportingBodyAreas.includes(supportingArea)) {
                        problems.push(makeProblem('SUPPORTING_BODY_AREA_NOT_ALLOWED', `L area di supporto ${supportingArea} non e ammessa dal target scelto.`, `primaryMutation.supportingBodyAreas.${index}`))
                    } else {
                        supportingBodyAreas.push(supportingArea)
                    }
                }
                if (supportingBodyAreas.length > 1) {
                    problems.push(makeProblem('TOO_MANY_SUPPORTING_BODY_AREAS', 'L evoluzione puo avere al massimo una area di supporto.', 'primaryMutation.supportingBodyAreas'))
                }
            }
        }
        if (mutationArchetype !== null && (!isMutationArchetype(mutationArchetype) || !context.requestedVisualTrait.allowedMutationArchetypes.includes(mutationArchetype))) {
            problems.push(makeProblem('INVALID_MUTATION_ARCHETYPE', 'Il mutation archetype non e ammesso dal Visual Trait richiesto.', 'primaryMutation.mutationArchetype'))
        }
        if (mutationArchetype !== null && morphology !== null && material !== null && bodyAreas !== null && isMutationArchetype(mutationArchetype)) {
            primaryMutation = { mutationArchetype, bodyAreas, ...(supportingBodyAreas?.length ? { supportingBodyAreas } : {}), morphology, material }
        }
    }

    if (secondaryMutations !== null && secondaryMutations.length > context.requestedVisualTrait.creativeLimits.maxSecondaryMutations) {
        problems.push(makeProblem('TOO_MANY_SECONDARY_MUTATIONS', 'Le mutazioni secondarie superano il limite del Visual Trait.', 'secondaryMutations'))
    }
    if (identityToPreserve !== null) {
        if (!identityToPreserve.length) {
            problems.push(makeProblem('MISSING_IDENTITY_PRESERVATION', 'identityToPreserve deve contenere almeno una caratteristica.', 'identityToPreserve'))
        }
        for (const identityFeature of context.identity.identityFeatures) {
            if (!preservesFeature(identityToPreserve, identityFeature)) {
                problems.push(makeProblem('MISSING_IDENTITY_PRESERVATION', `Manca la caratteristica identitaria obbligatoria: ${identityFeature}.`, 'identityToPreserve'))
            }
        }
    }

    const creativeText = [
        conceptName, evolutionaryFunction, primaryMutation?.morphology ?? null, primaryMutation?.material ?? null,
        ...(secondaryMutations ?? []), ...(identityToPreserve ?? []), ...(forbiddenChanges ?? []),
        colorEvolution?.dominantColor ?? null, ...(colorEvolution?.secondaryColors ?? []), ...(colorEvolution?.accentColors ?? []),
        ...(colorEvolution?.surfaceEffects ?? []), colorEvolution?.biologicalRationale ?? null,
    ].filter((value): value is string => value !== null)
    if (creativeText.some((value) => TECHNICAL_INSTRUCTION_PATTERN.test(value))) {
        problems.push(makeProblem('FORBIDDEN_TECHNICAL_INSTRUCTION', 'Il concept creativo non puo contenere istruzioni di formato, canvas o trasparenza.'))
    }
    const positiveText = [conceptName, evolutionaryFunction, primaryMutation?.morphology ?? null, primaryMutation?.material ?? null, ...(secondaryMutations ?? [])]
        .filter((value): value is string => value !== null)
        .join(' ')
    if (IDENTITY_BREAKING_PATTERN.test(positiveText)) {
        problems.push(makeProblem('CONTRADICTORY_INSTRUCTIONS', 'La mutazione propone un cambiamento incompatibile con l identita della creatura.'))
    }
    if (context.previousTransformations?.length && PREVIOUS_TRANSFORMATION_REMOVAL_PATTERN.test([...positiveText, ...(forbiddenChanges ?? [])].join(' '))) {
        problems.push(makeProblem('PREVIOUS_TRANSFORMATION_REMOVED', 'Il concept non puo dichiarare la rimozione o sostituzione di evoluzioni precedenti.'))
    }
    if (requestedTarget && GLOBAL_MUTATION_PATTERN.test(positiveText)) {
        problems.push(makeProblem('GLOBAL_MUTATION_NOT_ALLOWED', 'Una evoluzione anatomica non puo ridisegnare corpo intero, silhouette o proporzioni.', 'primaryMutation.morphology'))
    }
    if (requestedTarget && typeof evolutionFunction === 'string' && primaryMutation && context.previousTransformations?.some((previous) => (
        previous.evolutionTargetId === requestedTarget.id
        && previous.evolutionFunction === evolutionFunction
        && previous.visualTraitId === context.requestedVisualTrait.id
        && previous.mutationArchetype === primaryMutation.mutationArchetype
    ))) {
        problems.push(makeProblem('REPEATED_EVOLUTION_DIRECTION', 'La combinazione target, funzione e archetipo e gia stata adottata.', 'primaryMutation.mutationArchetype'))
    }

    if (problems.length || visualTrait === null || !primaryMutation || secondaryMutations === null || identityToPreserve === null || forbiddenChanges === null || intensity !== context.requestedIntensity) {
        return { valid: false, problems }
    }

    return {
        valid: true,
        concept: {
            schemaVersion: requestedTarget ? 2 : candidate.schemaVersion as 1,
            visualTrait: context.requestedVisualTrait.id,
            ...(requestedTarget && typeof evolutionFunction === 'string' && isEvolutionFunction(evolutionFunction)
                ? { evolutionTargetId: requestedTarget.id, evolutionFunction }
                : {}),
            conceptName: conceptName!,
            evolutionaryFunction: evolutionaryFunction!,
            primaryMutation,
            secondaryMutations,
            identityToPreserve,
            forbiddenChanges,
            intensity: context.requestedIntensity,
            ...(colorEvolution ? { colorEvolution } : {}),
        },
    }
}
