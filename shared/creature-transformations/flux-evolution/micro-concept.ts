import type { EvolutionFunctionId, EvolutionTargetId } from '../evolution-targets.ts'

export type FluxMicroConcept = Readonly<{
    conceptName: string
    mutationIdea: string
    visualDetails: readonly string[]
    avoid?: readonly string[]
}>

export type FluxEvolutionSnapshot = FluxMicroConcept & Readonly<{
    schemaVersion: 'flux-micro-v1'
    evolutionTargetId: EvolutionTargetId
    evolutionFunction: EvolutionFunctionId
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

export function createFluxEvolutionSnapshot(input: FluxMicroConcept & { evolutionTargetId: EvolutionTargetId, evolutionFunction: EvolutionFunctionId, providerSeed?: number }): FluxEvolutionSnapshot {
    return Object.freeze({
        schemaVersion: 'flux-micro-v1',
        evolutionTargetId: input.evolutionTargetId,
        evolutionFunction: input.evolutionFunction,
        conceptName: input.conceptName,
        mutationIdea: input.mutationIdea,
        visualDetails: Object.freeze([...input.visualDetails]),
        ...(input.avoid?.length ? { avoid: Object.freeze([...input.avoid]) } : {}),
        ...(input.providerSeed === undefined ? {} : { providerSeed: input.providerSeed }),
    })
}

export function isFluxEvolutionSnapshot(value: unknown): value is FluxEvolutionSnapshot {
    if (!record(value) || value.schemaVersion !== 'flux-micro-v1' || typeof value.evolutionTargetId !== 'string' || typeof value.evolutionFunction !== 'string') return false
    const providerSeed = value.providerSeed
    if (providerSeed !== undefined && (typeof providerSeed !== 'number' || !Number.isInteger(providerSeed) || providerSeed < 0)) return false
    return parseFluxMicroConcept({ conceptName: value.conceptName, mutationIdea: value.mutationIdea, visualDetails: value.visualDetails, ...(value.avoid === undefined ? {} : { avoid: value.avoid }) }) !== null
}
