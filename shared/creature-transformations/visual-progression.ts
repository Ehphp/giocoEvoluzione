import type { VisualTraitId } from './visual-traits.ts'
import type { EvolutionTargetId } from './evolution-targets.ts'

/**
 * Application-level event received after a match is already definitive. It is
 * deliberately free of competitive-rule types and gene identifiers.
 */
export type MatchCompletionEvent = Readonly<{
    gameId: string
    profileId: string
    creatureId: string
    outcome: 'WIN' | 'LOSS' | 'DRAW'
    completedAt: string
}>

export type CreatureVisualProgressTrackStatus =
    'ACTIVE' | 'READY' | 'GENERATING' | 'POST_PROCESSING' | 'GENERATED' | 'COMPLETED' | 'CANCELLED'

export type CreatureVisualProgressTrack = Readonly<{
    id: string
    creatureId: string
    /** Legacy tracks contain a trait; target tracks resolve it when generation starts. */
    visualTraitId: VisualTraitId | null
    evolutionTargetId: EvolutionTargetId | null
    status: CreatureVisualProgressTrackStatus
    progress: number
    target: number
    readyAt: string | null
    generatedRequestId: string | null
    completedVersionId: string | null
}>

export const DEFAULT_CREATURE_VISUAL_PROGRESSION_WINS_REQUIRED = 3

export function readCreatureVisualProgressionWinsRequired(value: string | undefined): number {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100
        ? parsed
        : DEFAULT_CREATURE_VISUAL_PROGRESSION_WINS_REQUIRED
}

export function awardedCreatureVisualProgress(outcome: MatchCompletionEvent['outcome']): 0 | 1 {
    return outcome === 'WIN' ? 1 : 0
}

export function nextCreatureVisualProgress(
    track: Pick<CreatureVisualProgressTrack, 'progress' | 'target' | 'status'>,
    outcome: MatchCompletionEvent['outcome'],
) {
    const awarded = awardedCreatureVisualProgress(outcome)
    const progress = track.progress + awarded
    return {
        awarded,
        progress,
        status: track.status === 'ACTIVE' && progress >= track.target ? ('READY' as const) : track.status,
    }
}
