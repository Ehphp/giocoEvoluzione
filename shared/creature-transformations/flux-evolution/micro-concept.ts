import type { EvolutionFunctionId, EvolutionTargetId } from '../evolution-targets.ts'
import { isBodyPlanMutationId, isEvolutionCapability, type BodyPlanMutationId, type EvolutionCapability } from './body-plan-mutations.ts'
import { isBodyPlanId, type BodyPlanId } from './body-plan-registry.ts'

export const FLUX_MICRO_CONCEPT_SCHEMA_VERSION = 'flux-micro-v2'

/** Historical snapshots written before the capability was part of the domain. */
const LEGACY_SCHEMA_VERSION = 'flux-micro-v1'

export type FluxMicroConcept = Readonly<{
    conceptName: string
    mutationIdea: string
    visualDetails: readonly string[]
    avoid?: readonly string[]
}>

export type FluxEvolutionSnapshot = FluxMicroConcept & Readonly<{
    schemaVersion: typeof FLUX_MICRO_CONCEPT_SCHEMA_VERSION
    evolutionTargetId: EvolutionTargetId
    evolutionFunction: EvolutionFunctionId
    capability: EvolutionCapability
    /** Present only on an authorized structural mutation. */
    bodyPlanMutationId?: BodyPlanMutationId
    /** The canonical body plan this generation establishes once adopted. */
    resultBodyPlanId?: BodyPlanId
    /** Provider audit metadata lives in the existing JSON snapshot; no DB column is needed. */
    providerSeed?: number
}>

type RecordValue = Record<string, unknown>

function record(value: unknown): value is RecordValue {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, maximum: number): string | null {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximum ? value.trim() : null
}

function textList(value: unknown, maximumItems: number, maximumLength: number): string[] | null {
    if (!Array.isArray(value) || value.length > maximumItems) return null
    const values = value.map((item) => text(item, maximumLength))
    return values.every((item): item is string => item !== null) ? values : null
}

/** Strict boundary between model output and deterministic generation code. */
export function parseFluxMicroConcept(value: unknown): FluxMicroConcept | null {
    if (!record(value) || Object.keys(value).some((key) => !['conceptName', 'mutationIdea', 'visualDetails', 'avoid'].includes(key))) return null
    const conceptName = text(value.conceptName, 120)
    const mutationIdea = text(value.mutationIdea, 800)
    const visualDetails = textList(value.visualDetails, 5, 300)
    const avoid = value.avoid === undefined ? undefined : textList(value.avoid, 4, 240)
    if (!conceptName || !mutationIdea || !visualDetails || !visualDetails.length || (value.avoid !== undefined && avoid === null)) return null
    return Object.freeze({ conceptName, mutationIdea, visualDetails: Object.freeze(visualDetails), ...(avoid?.length ? { avoid: Object.freeze(avoid) } : {}) })
}

export function createFluxEvolutionSnapshot(input: FluxMicroConcept & {
    evolutionTargetId: EvolutionTargetId
    evolutionFunction: EvolutionFunctionId
    capability: EvolutionCapability
    bodyPlanMutationId?: BodyPlanMutationId
    resultBodyPlanId?: BodyPlanId
    providerSeed?: number
}): FluxEvolutionSnapshot {
    return Object.freeze({
        schemaVersion: FLUX_MICRO_CONCEPT_SCHEMA_VERSION,
        evolutionTargetId: input.evolutionTargetId,
        evolutionFunction: input.evolutionFunction,
        capability: input.capability,
        conceptName: input.conceptName,
        mutationIdea: input.mutationIdea,
        visualDetails: Object.freeze([...input.visualDetails]),
        ...(input.avoid?.length ? { avoid: Object.freeze([...input.avoid]) } : {}),
        ...(input.bodyPlanMutationId ? { bodyPlanMutationId: input.bodyPlanMutationId } : {}),
        ...(input.resultBodyPlanId ? { resultBodyPlanId: input.resultBodyPlanId } : {}),
        ...(input.providerSeed === undefined ? {} : { providerSeed: input.providerSeed }),
    })
}

/** Accepts historical v1 snapshots so persisted evolutions stay readable. */
export function isFluxEvolutionSnapshot(value: unknown): value is FluxEvolutionSnapshot {
    if (!record(value)) return false
    if (value.schemaVersion !== FLUX_MICRO_CONCEPT_SCHEMA_VERSION && value.schemaVersion !== LEGACY_SCHEMA_VERSION) return false
    if (typeof value.evolutionTargetId !== 'string' || typeof value.evolutionFunction !== 'string') return false
    if (value.capability !== undefined && !isEvolutionCapability(value.capability)) return false
    if (value.bodyPlanMutationId !== undefined && !isBodyPlanMutationId(value.bodyPlanMutationId)) return false
    if (value.resultBodyPlanId !== undefined && !isBodyPlanId(value.resultBodyPlanId)) return false
    const providerSeed = value.providerSeed
    if (providerSeed !== undefined && (typeof providerSeed !== 'number' || !Number.isInteger(providerSeed) || providerSeed < 0)) return false
    return parseFluxMicroConcept({ conceptName: value.conceptName, mutationIdea: value.mutationIdea, visualDetails: value.visualDetails, ...(value.avoid === undefined ? {} : { avoid: value.avoid }) }) !== null
}

export function readFluxSnapshotCapability(snapshot: FluxEvolutionSnapshot): EvolutionCapability {
    return snapshot.capability ?? 'ANATOMICAL_MUTATION'
}

/** Reads the structural mutation an adopted version established, if any. */
export function readBodyPlanMutationId(conceptSnapshot: unknown): BodyPlanMutationId | null {
    if (!record(conceptSnapshot)) return null
    const value = conceptSnapshot.bodyPlanMutationId
    return isBodyPlanMutationId(value) && conceptSnapshot.capability === 'BODY_PLAN_MUTATION' ? value : null
}
