import { BODY_AREAS, type BodyArea } from './body-areas.ts'
import { TRANSFORMATION_INTENSITIES, type CreatureTransformationConcept, type TransformationIntensity } from './concepts.ts'
import type { CreatureSemanticIdentity } from './contracts.ts'
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

export type ConceptProblem = {
    code: ConceptProblemCode
    message: string
    path?: string
}

export type ConceptValidationContext = {
    requestedVisualTrait: VisualTraitDefinition
    requestedIntensity: TransformationIntensity
    identity: CreatureSemanticIdentity
    previousTransformations?: readonly PreviousCreatureTransformationSummary[]
}

export type ConceptValidationResult =
    | { valid: true; concept: CreatureTransformationConcept }
    | { valid: false; problems: ConceptProblem[] }

type UnknownRecord = Record<string, unknown>

const CONCEPT_FIELDS = new Set([
    'schemaVersion', 'visualTrait', 'conceptName', 'evolutionaryFunction', 'primaryMutation',
    'secondaryMutations', 'identityToPreserve', 'forbiddenChanges', 'intensity',
])
const PRIMARY_MUTATION_FIELDS = new Set(['mutationArchetype', 'bodyAreas', 'morphology', 'material'])
const TECHNICAL_INSTRUCTION_PATTERN = /\b(?:png|jpe?g|webp|canvas|alpha|trasparen\w*|sfondo|background|dimension\w*|pixel|risoluzione|resolution|posa|pose|path|url|1024|1536)\b/i
const IDENTITY_BREAKING_PATTERN = /(?:nuova specie|cambio di specie|sostituzione del volto|anatomia umanoide|trasformazione totale|completamente diverso)/i
const PREVIOUS_TRANSFORMATION_REMOVAL_PATTERN = /(?:rimuov|elimin|cancell|sostituisc|remove|replace).*(?:mutazion|evoluzion|adaptation)/i

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

function normalize(value: string): string {
    return value.trim().toLocaleLowerCase('it-IT')
}

function preservesFeature(identityToPreserve: readonly string[], requiredFeature: string): boolean {
    const normalizedFeature = normalize(requiredFeature)
    return identityToPreserve.some((entry) => {
        const normalizedEntry = normalize(entry)
        return normalizedEntry.includes(normalizedFeature) || normalizedFeature.includes(normalizedEntry)
    })
}

export function validateCreatureTransformationConcept(candidate: unknown, context: ConceptValidationContext): ConceptValidationResult {
    const problems: ConceptProblem[] = []
    if (!isRecord(candidate)) {
        return { valid: false, problems: [makeProblem('INVALID_CONCEPT', 'Il concept deve essere un oggetto JSON.')] }
    }

    checkUnknownFields(candidate, CONCEPT_FIELDS, '', problems)
    if (candidate.schemaVersion !== 1) {
        problems.push(makeProblem('INVALID_SCHEMA_VERSION', 'schemaVersion deve essere 1.', 'schemaVersion'))
    }

    const visualTrait = readNonEmptyString(candidate, 'visualTrait', 'visualTrait', problems)
    if (visualTrait !== null && visualTrait !== context.requestedVisualTrait.id) {
        problems.push(makeProblem('INVALID_VISUAL_TRAIT', 'Il Visual Trait non corrisponde a quello richiesto.', 'visualTrait'))
    }
    const conceptName = readNonEmptyString(candidate, 'conceptName', 'conceptName', problems)
    const evolutionaryFunction = readNonEmptyString(candidate, 'evolutionaryFunction', 'evolutionaryFunction', problems)
    const secondaryMutations = readStringArray(candidate, 'secondaryMutations', 'secondaryMutations', problems)
    const identityToPreserve = readStringArray(candidate, 'identityToPreserve', 'identityToPreserve', problems)
    const forbiddenChanges = readStringArray(candidate, 'forbiddenChanges', 'forbiddenChanges', problems)

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
        if (mutationArchetype !== null && (!isMutationArchetype(mutationArchetype) || !context.requestedVisualTrait.allowedMutationArchetypes.includes(mutationArchetype))) {
            problems.push(makeProblem('INVALID_MUTATION_ARCHETYPE', 'Il mutation archetype non e ammesso dal Visual Trait richiesto.', 'primaryMutation.mutationArchetype'))
        }
        if (mutationArchetype !== null && morphology !== null && material !== null && bodyAreas !== null && isMutationArchetype(mutationArchetype)) {
            primaryMutation = { mutationArchetype, bodyAreas, morphology, material }
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

    if (problems.length || visualTrait === null || !primaryMutation || secondaryMutations === null || identityToPreserve === null || forbiddenChanges === null || intensity !== context.requestedIntensity) {
        return { valid: false, problems }
    }

    return {
        valid: true,
        concept: {
            schemaVersion: 1,
            visualTrait: context.requestedVisualTrait.id,
            conceptName: conceptName!,
            evolutionaryFunction: evolutionaryFunction!,
            primaryMutation,
            secondaryMutations,
            identityToPreserve,
            forbiddenChanges,
            intensity: context.requestedIntensity,
        },
    }
}
