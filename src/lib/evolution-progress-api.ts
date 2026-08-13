import { isEvolutionTargetId, type EvolutionTargetId } from '../../shared/creature-transformations/evolution-targets.ts'
import { requireSupabase } from './supabase'

/**
 * Per-target evolution counters.
 *
 * Wins accumulate on the anatomical target drafted at the start of each match. When a counter
 * reaches its threshold it can be spent to open a transformation, which hands over to the
 * existing generate/adopt pipeline.
 */

export type EvolutionTargetProgressRecord = {
    evolutionTargetId: EvolutionTargetId
    wins: number
    target: number
}

export async function fetchEvolutionTargetProgress(creatureId: string): Promise<EvolutionTargetProgressRecord[]> {
    const supabase = requireSupabase()
    const { data, error } = await supabase.rpc('get_creature_evolution_target_progress', { p_creature_id: creatureId })

    if (error) throw new Error(error.message)
    if (!Array.isArray(data)) return []

    return data.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return []
        const row = entry as Record<string, unknown>
        if (!isEvolutionTargetId(row.evolutionTargetId)) return []

        return [{
            evolutionTargetId: row.evolutionTargetId,
            wins: Number(row.wins) || 0,
            target: Number(row.target) || 0,
        }]
    })
}

/** Spends a full counter and opens an already-ready transformation track for that target. */
export async function openEvolutionTrackFromReadyTarget(creatureId: string, evolutionTargetId: EvolutionTargetId): Promise<void> {
    const supabase = requireSupabase()
    const { error } = await supabase.rpc('open_evolution_track_from_ready_target', {
        p_creature_id: creatureId,
        p_evolution_target_id: evolutionTargetId,
    })

    if (!error) {
        return
    }

    if (error.message.includes('EVOLUTION_TARGET_NOT_READY')) {
        throw new Error('Questo tratto non ha ancora abbastanza vittorie.')
    }
    if (error.message.includes('VISUAL_TRACK_ALREADY_ACTIVE')) {
        throw new Error('C e gia una trasformazione aperta: completala prima di iniziarne un altra.')
    }

    throw new Error(error.message)
}
