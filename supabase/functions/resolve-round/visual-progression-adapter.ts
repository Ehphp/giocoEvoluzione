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
        return [
            {
                gameId: input.gameId,
                profileId: participant.profileId,
                creatureId: participant.creatureId,
                outcome:
                    input.winnerPlayerId === null ? 'DRAW' : input.winnerPlayerId === participant.id ? 'WIN' : 'LOSS',
                completedAt: input.completedAt,
            } satisfies MatchCompletionEvent,
        ]
    })
}

/**
 * `PromiseLike`, not `Promise`: the Supabase client's `rpc()` returns a thenable query builder
 * that only becomes a promise when awaited, so requiring a full `Promise` here would reject the
 * real client.
 */
type MatchCompletionRpcClient = {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: { message?: string } | null }>
}

export async function recordCreatureVisualProgressFromMatchCompletion(
    supabaseAdmin: MatchCompletionRpcClient,
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

/**
 * Credits the win to the anatomical target the player drafted at the start of the match.
 *
 * The chosen target is read server-side from the player row: the client never says which
 * counter to credit. Losses and draws are still recorded, so the match is only ever counted once.
 */
export async function recordEvolutionTargetWinFromMatchCompletion(
    supabaseAdmin: MatchCompletionRpcClient,
    event: MatchCompletionEvent,
    winsRequired: number,
): Promise<void> {
    const { error } = await supabaseAdmin.rpc('record_evolution_target_win_from_match_completion', {
        p_game_id: event.gameId,
        p_profile_id: event.profileId,
        p_creature_id: event.creatureId,
        p_outcome: event.outcome,
        p_target: winsRequired,
        p_completed_at: event.completedAt,
    })
    if (error) throw new Error(error.message ?? 'Evolution target progression persistence failed.')
}
