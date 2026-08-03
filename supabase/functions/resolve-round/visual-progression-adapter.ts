import type { MatchCompletionEvent } from '../../../shared/creature-transformations/visual-progression.ts'

type MatchParticipant = Readonly<{
    id: string
    profileId: string | null
    creatureId: string | null
}>

export function createMatchCompletionEvents(input: {
    gameId: string
    winnerPlayerId: string | null
    completedAt: string
    participants: readonly MatchParticipant[]
}): MatchCompletionEvent[] {
    return input.participants.flatMap((participant) => {
        if (!participant.profileId || !participant.creatureId) return []
        return [{
            gameId: input.gameId,
            profileId: participant.profileId,
            creatureId: participant.creatureId,
            outcome: input.winnerPlayerId === null ? 'DRAW' : input.winnerPlayerId === participant.id ? 'WIN' : 'LOSS',
            completedAt: input.completedAt,
        } satisfies MatchCompletionEvent]
    })
}

export async function recordCreatureVisualProgressFromMatchCompletion(
    supabaseAdmin: { rpc(name: string, args: Record<string, unknown>): Promise<{ error: { message?: string } | null }> },
    event: MatchCompletionEvent,
): Promise<void> {
    const { error } = await supabaseAdmin.rpc('record_creature_visual_progress_from_match_completion', {
        p_game_id: event.gameId,
        p_profile_id: event.profileId,
        p_creature_id: event.creatureId,
        p_outcome: event.outcome,
        p_completed_at: event.completedAt,
    })
    if (error) throw new Error(error.message ?? 'Visual progression persistence failed.')
}
