import type { PreviousCreatureTransformationSummary } from '../creature-visual-versions.ts'
import {
    EVOLUTION_TARGET_BY_ID,
    evolutionTargetFamily,
    isEvolutionTargetId,
    type EvolutionTargetFamily,
    type EvolutionTargetId,
} from '../evolution-targets.ts'
import type { BodyPlanMutationId } from './body-plan-mutations.ts'

/**
 * Minimal Flux lineage: source image = visual state; lineage = semantic/topological continuity.
 *
 * The source image is the primary visual truth; history must never become a competing visual
 * specification. The prompt receives only the latest semantic state of the exact target when a
 * continuation needs it. Permanent topology is supplied separately by the anatomy contract.
 */
export type EvolutionLineageEntry = Readonly<{
    versionNumber: number
    evolutionTargetId: EvolutionTargetId | null
    conceptName: string
    mutationIdea?: string
    bodyPlanMutationId?: BodyPlanMutationId
}>

export type EvolutionLineageContext = Readonly<{
    evolutionTargetId: EvolutionTargetId
    family: EvolutionTargetFamily
    /** Latest adopted semantic state of this exact target, if a continuation needs it. */
    currentTargetState: EvolutionLineageEntry | null
}>

function toEntry(summary: PreviousCreatureTransformationSummary): EvolutionLineageEntry {
    return Object.freeze({
        versionNumber: summary.versionNumber,
        evolutionTargetId: isEvolutionTargetId(summary.evolutionTargetId) ? summary.evolutionTargetId : null,
        conceptName: summary.conceptName,
        ...(summary.mutationIdea ? { mutationIdea: summary.mutationIdea } : {}),
        ...(summary.bodyPlanMutationId ? { bodyPlanMutationId: summary.bodyPlanMutationId } : {}),
    })
}

export function buildEvolutionLineageContext(input: {
    evolutionTargetId: EvolutionTargetId
    previousTransformations: readonly PreviousCreatureTransformationSummary[]
}): EvolutionLineageContext {
    const family = evolutionTargetFamily(input.evolutionTargetId)
    const entries = [...input.previousTransformations]
        .map(toEntry)
        .sort((left, right) => left.versionNumber - right.versionNumber)
    const latestTargetState =
        entries.filter((entry) => entry.evolutionTargetId === input.evolutionTargetId).at(-1) ?? null
    return Object.freeze({ evolutionTargetId: input.evolutionTargetId, family, currentTargetState: latestTargetState })
}

/**
 * Bounded history used only to reject a repeated micro-concept. It remains outside prompt
 * lineage, so visual preservation can never become cumulative.
 */
export function recentTargetMutationReferences(input: {
    evolutionTargetId: EvolutionTargetId
    previousTransformations: readonly PreviousCreatureTransformationSummary[]
    limit?: number
}): readonly EvolutionLineageEntry[] {
    const limit = input.limit ?? 3
    return Object.freeze(
        input.previousTransformations
            .map(toEntry)
            .filter((entry) => entry.evolutionTargetId === input.evolutionTargetId)
            .sort((left, right) => right.versionNumber - left.versionNumber)
            .slice(0, limit),
    )
}

function describeEntry(entry: EvolutionLineageEntry): string {
    const region = entry.evolutionTargetId
        ? EVOLUTION_TARGET_BY_ID[entry.evolutionTargetId].promptRegion
        : 'earlier evolution'
    return `v${entry.versionNumber} - ${region}: ${entry.conceptName}${entry.mutationIdea ? ` (${entry.mutationIdea})` : ''}`
}

export function describeCurrentTargetState(context: EvolutionLineageContext): string {
    if (!context.currentTargetState) {
        return 'This target carries no adopted evolution yet: the new mutation is its first one, starting from the anatomy visible in the source image.'
    }
    return [
        `This target already carries: ${describeEntry(context.currentTargetState)}.`,
        'This is minimal semantic continuity only; the supplied source image remains the complete visual state. Keep the evolved state as a substrate and introduce a new, substantial, independently readable morphological mutation on this target. Do not reset or erase the established adaptation, but do not merely enlarge, decorate, refine or recolour it.',
    ].join(' ')
}
