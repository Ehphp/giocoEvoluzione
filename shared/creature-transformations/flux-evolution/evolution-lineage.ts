import type { PreviousCreatureTransformationSummary } from '../creature-visual-versions.ts'
import { EVOLUTION_TARGET_BY_ID, evolutionTargetFamily, isEvolutionTargetId, type EvolutionTargetFamily, type EvolutionTargetId } from '../evolution-targets.ts'
import type { BodyPlanMutationId } from './body-plan-mutations.ts'

/**
 * Target-aware lineage.
 *
 * The source image is the primary visual truth; the history must never become a second,
 * competing description of the creature. So adopted evolutions are split in two: the state of
 * the anatomy being evolved now — which the new mutation has to continue — and the rest of the
 * lineage, which is already visible in the source and only has to survive untouched.
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
    /** Adopted evolutions of the same target or anatomical family, oldest first. */
    currentTargetState: readonly EvolutionLineageEntry[]
    /** Everything else already established on this individual. */
    otherEstablishedEvolutions: readonly EvolutionLineageEntry[]
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
    const entries = [...input.previousTransformations].map(toEntry).sort((left, right) => left.versionNumber - right.versionNumber)
    const sameFamily = entries.filter((entry) => entry.evolutionTargetId !== null && evolutionTargetFamily(entry.evolutionTargetId) === family)
    return Object.freeze({
        evolutionTargetId: input.evolutionTargetId,
        family,
        currentTargetState: Object.freeze(sameFamily),
        otherEstablishedEvolutions: Object.freeze(entries.filter((entry) => !sameFamily.includes(entry))),
    })
}

function describeEntry(entry: EvolutionLineageEntry): string {
    const region = entry.evolutionTargetId ? EVOLUTION_TARGET_BY_ID[entry.evolutionTargetId].promptRegion : 'earlier evolution'
    return `v${entry.versionNumber} · ${region}: ${entry.conceptName}${entry.mutationIdea ? ` (${entry.mutationIdea})` : ''}`
}

export function describeCurrentTargetState(context: EvolutionLineageContext): string {
    if (!context.currentTargetState.length) {
        return 'This target carries no adopted evolution yet: the new mutation is its first one, starting from the anatomy visible in the source image.'
    }
    return [
        `This target already carries: ${context.currentTargetState.map(describeEntry).join('; ')}.`,
        'That is the current state of this anatomy in the source image. Develop it further and build on it. Do not replace it, do not reset it to the base form and do not describe it again as if it were new.',
    ].join(' ')
}

export function describeOtherEstablishedEvolutions(context: EvolutionLineageContext): string {
    if (!context.otherEstablishedEvolutions.length) return 'No other adopted evolution exists on this creature yet.'
    return [
        `Already established elsewhere on this individual: ${context.otherEstablishedEvolutions.map(describeEntry).join('; ')}.`,
        'This lineage is already visible in the source image: preserve it, do not recreate it, do not develop it and do not reinterpret it as the new mutation.',
    ].join(' ')
}
