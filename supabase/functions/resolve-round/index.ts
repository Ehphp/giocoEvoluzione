import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { BASE_USE_VALUE, EVOLVE_ROUND_VALUE, LEVEL_BONUS, MAX_ADAPTATION_LEVEL, NATURAL_ADVANTAGE_BONUS, TOTAL_ROUNDS } from '../../../shared/game-rules/catalog.ts'
import { getRoundEventById, normalizeAdaptationCollection } from '../../../shared/game-rules/state.ts'
import type { AdaptationCollection, AdaptationId } from '../../../shared/game-rules/types.ts'
import { selectEdgeBotAction } from './bot-policy.ts'
import { resolveEdgeRound } from './round-domain.ts'
import { createMatchCompletionEvents, recordCreatureVisualProgressFromMatchCompletion, recordEvolutionTargetWinFromMatchCompletion } from './visual-progression-adapter.ts'
import { readEvolutionTargetWinsRequired } from '../../../shared/creature-transformations/evolution-draft.ts'

// Pure game rules and persisted resolution mapping are shared with the frontend.
// Only persistence and idempotent resolution orchestration remain local here.

type TraitName = AdaptationId

// Keep the production function's Deno-compatible rule manifest explicit.
// Resolution itself delegates to the shared engine below; this guard prevents
// an Edge deployment with a stale local rule copy.
const EDGE_BASE_USE_VALUE = 2
const EDGE_EVOLVE_ROUND_VALUE = 1
const EDGE_MAX_ADAPTATION_LEVEL = 2
const EDGE_LEVEL_BONUS = [0, 1, 2] as const
const EDGE_NATURAL_ADVANTAGE_BONUS = 2

if (EDGE_BASE_USE_VALUE !== BASE_USE_VALUE || EDGE_EVOLVE_ROUND_VALUE !== EVOLVE_ROUND_VALUE || EDGE_MAX_ADAPTATION_LEVEL !== MAX_ADAPTATION_LEVEL || EDGE_LEVEL_BONUS.join(',') !== LEVEL_BONUS.join(',') || EDGE_NATURAL_ADVANTAGE_BONUS !== NATURAL_ADVANTAGE_BONUS) {
    throw new Error('Scoring rule mismatch between Edge and shared game rules.')
}

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: CORS_HEADERS,
    })
}

async function ensureEdgeBotRoundAction(
    supabaseAdmin: ReturnType<typeof createClient>,
    input: { gameId: string; roundNumber: number; playerId: string; traits: AdaptationCollection; roundEvent: ReturnType<typeof getRoundEventById>; nextRoundEvent?: ReturnType<typeof getRoundEventById> | null; publicOpponentTraits?: AdaptationCollection; difficulty?: 'EASY' | 'NORMAL' | 'HARD' },
) {
    const botAction = selectEdgeBotAction({
        traits: input.traits,
        roundEvent: input.roundEvent,
        roundNumber: input.roundNumber,
        nextRoundEvent: input.nextRoundEvent,
        publicOpponentTraits: input.publicOpponentTraits,
        difficulty: input.difficulty,
    })
    try {
        const { error } = await supabaseAdmin.from('round_actions').insert({
            game_id: input.gameId,
            round_number: input.roundNumber,
            player_id: input.playerId,
            trait: botAction.trait,
            action_type: botAction.actionType,
        })
        if (error) throw error
    } catch (error) {
        const maybeError = error as { code?: string; message?: string }
        if (maybeError.code !== '23505') throw new Error(maybeError.message ?? 'Impossibile creare l azione del bot.')
    }

    const { data: storedAction, error } = await supabaseAdmin
        .from('round_actions')
        .select('*')
        .eq('game_id', input.gameId)
        .eq('round_number', input.roundNumber)
        .eq('player_id', input.playerId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!storedAction) throw new Error('Impossibile recuperare l azione del bot.')
    return storedAction
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', {
            headers: CORS_HEADERS,
        })
    }

    if (request.method !== 'POST') {
        return json({ error: 'Method not allowed.' }, 405)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
        return json({ error: 'Missing server configuration.' }, 500)
    }

    const authorization = request.headers.get('authorization') ?? ''
    if (!authorization) return json({ error: 'Authentication required.' }, 401)

    const authenticatedClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authorization } },
    })
    const { data: authData, error: authError } = await authenticatedClient.auth.getUser()
    if (authError || !authData.user) return json({ error: 'Authentication required.' }, 401)

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

    try {
        const body = await request.json()
        const gameId = String(body.gameId ?? '')
        const roundNumber = Number(body.roundNumber ?? 0)

        if (!gameId || !roundNumber) {
            return json({ error: 'gameId and roundNumber are required.' }, 400)
        }

        const { data: gameData, error: gameError } = await supabaseAdmin
            .from('games')
            .select('*')
            .eq('id', gameId)
            .single()

        if (gameError) {
            return json({ error: gameError.message }, 400)
        }

        const { data: playersData, error: playersError } = await supabaseAdmin
            .from('players')
            .select('*')
            .eq('game_id', gameId)
            .order('slot')

        if (playersError) {
            return json({ error: playersError.message }, 400)
        }

        const isParticipant = (playersData ?? []).some((player) => player.profile_id === authData.user.id && player.player_type === 'HUMAN')
        if (!isParticipant) return json({ error: 'Game participant required.' }, 403)

        if (!playersData || playersData.length < 2) {
            return json({ status: 'pending', reason: 'waiting_for_players' })
        }

        const player1 = playersData.find((player) => Number(player.slot) === 1)
        const player2 = playersData.find((player) => Number(player.slot) === 2)

        if (!player1 || !player2) {
            return json({ status: 'pending', reason: 'missing_slots' })
        }

        const visualParticipants = [player1, player2].map((player) => ({
            id: String(player.id),
            profileId: typeof player.profile_id === 'string' ? player.profile_id : null,
            creatureId: typeof player.creature_id === 'string' ? player.creature_id : null,
        }))

        const gameMode = String((gameData as Record<string, unknown>).game_mode ?? 'PVP')
        if (String(gameData.status) === 'FINISHED' || roundNumber > TOTAL_ROUNDS || roundNumber !== Number(gameData.current_round)) {
            return json({ status: 'stale_round' })
        }

        const { data: existingResultData } = await supabaseAdmin
            .from('round_results')
            .select('*')
            .eq('game_id', gameId)
            .eq('round_number', roundNumber)
            .maybeSingle()

        if (existingResultData) {
            return json({ status: 'already_resolved', result: existingResultData })
        }

        let { data: actionsData, error: actionsError } = await supabaseAdmin
            .from('round_actions')
            .select('*')
            .eq('game_id', gameId)
            .eq('round_number', roundNumber)

        if (actionsError) {
            return json({ error: actionsError.message }, 400)
        }

        const roundEventId = String(gameData.round_event_sequence?.[roundNumber - 1] ?? '')

        if (!roundEventId) {
            return json({ error: `Missing round event for round ${roundNumber}.` }, 400)
        }

        const roundEvent = getRoundEventById(roundEventId)
        if (gameMode === 'VS_BOT') {
            const botPlayer = playersData.find((player) => String((player as Record<string, unknown>).player_type ?? 'HUMAN') === 'BOT')

            if (botPlayer && (!actionsData || !actionsData.some((action) => action.player_id === botPlayer.id))) {
                await ensureEdgeBotRoundAction(supabaseAdmin, {
                    gameId,
                    roundNumber,
                    playerId: String(botPlayer.id),
                    traits: normalizeAdaptationCollection(botPlayer.traits as AdaptationCollection),
                    roundEvent,
                    nextRoundEvent: roundNumber < TOTAL_ROUNDS ? getRoundEventById(String(gameData.round_event_sequence?.[roundNumber] ?? '')) : null,
                    difficulty: (['EASY', 'NORMAL', 'HARD'].includes(String((gameData as Record<string, unknown>).bot_difficulty)) ? String((gameData as Record<string, unknown>).bot_difficulty) : 'NORMAL') as 'EASY' | 'NORMAL' | 'HARD',
                })

                const { data: refreshedActionsData, error: refreshedActionsError } = await supabaseAdmin
                    .from('round_actions')
                    .select('*')
                    .eq('game_id', gameId)
                    .eq('round_number', roundNumber)

                if (refreshedActionsError) {
                    return json({ error: refreshedActionsError.message }, 400)
                }

                actionsData = refreshedActionsData
            }
        }

        if (!actionsData || actionsData.length < 2) {
            return json({ status: 'pending', reason: 'waiting_for_actions' })
        }

        const player1ActionRow = actionsData.find((action) => action.player_id === player1.id)
        const player2ActionRow = actionsData.find((action) => action.player_id === player2.id)

        if (!player1ActionRow || !player2ActionRow) {
            return json({ status: 'pending', reason: 'missing_player_action' })
        }

        const resolution = resolveEdgeRound({
            roundNumber,
            roundEvent,
            player1Id: String(player1.id),
            player2Id: String(player2.id),
            player1Score: Number(gameData.player_1_score ?? 0),
            player2Score: Number(gameData.player_2_score ?? 0),
            player1Traits: normalizeAdaptationCollection(player1.traits as AdaptationCollection),
            player2Traits: normalizeAdaptationCollection(player2.traits as AdaptationCollection),
            player1Action: {
                playerId: String(player1.id),
                trait: player1ActionRow.trait as TraitName,
                actionType: player1ActionRow.action_type as 'USE' | 'EVOLVE',
            },
            player2Action: {
                playerId: String(player2.id),
                trait: player2ActionRow.trait as TraitName,
                actionType: player2ActionRow.action_type as 'USE' | 'EVOLVE',
            },
            startedAt: (gameData.started_at as string | null) ?? null,
            priorRoundValues: ((await supabaseAdmin.from('round_results').select('player_1_value, player_2_value').eq('game_id', gameId).lt('round_number', roundNumber)).data ?? []).map((result) => ({ player1Value: Number(result.player_1_value), player2Value: Number(result.player_2_value) })),
        })

        const resolutionData = resolution.resolution_data as Record<string, unknown>
        const { data: committed, error: commitError } = await supabaseAdmin.rpc('commit_game_round_resolution', {
            p_game_id: gameId,
            p_round_number: roundNumber,
            p_player_1_id: String(player1.id),
            p_player_2_id: String(player2.id),
            p_player_1_traits: normalizeAdaptationCollection(resolutionData.player1TraitsAfter as AdaptationCollection),
            p_player_2_traits: normalizeAdaptationCollection(resolutionData.player2TraitsAfter as AdaptationCollection),
            p_player_1_score: Number(resolutionData.player1ScoreAfter ?? 0),
            p_player_2_score: Number(resolutionData.player2ScoreAfter ?? 0),
            p_status: String(resolutionData.statusAfter ?? 'REVEALING'),
            p_winner_id: (resolutionData.winnerIdAfter as string | null) ?? null,
            p_finished_at: (resolutionData.finishedAt as string | null) ?? null,
            p_player_1_value: resolution.player_1_value,
            p_player_2_value: resolution.player_2_value,
            p_result_winner_id: resolution.winner_id,
            p_resolution_data: resolutionData,
        })
        if (commitError) return json({ error: commitError.message }, 400)

        const commit = committed && typeof committed === 'object' ? committed as Record<string, unknown> : {}
        const outcome = String(commit.outcome ?? 'UNKNOWN')
        if (outcome === 'APPLIED' && Deno.env.get('CREATURE_VISUAL_PROGRESSION_ENABLED') === 'true' && String(resolutionData.statusAfter) === 'FINISHED' && resolutionData.finishedAt) {
            const events = createMatchCompletionEvents({
                gameId,
                winnerPlayerId: (resolutionData.winnerIdAfter as string | null) ?? null,
                completedAt: String(resolutionData.finishedAt),
                participants: visualParticipants,
            })
            const evolutionTargetWinsRequired = readEvolutionTargetWinsRequired(Deno.env.get('EVOLUTION_TARGET_WINS_REQUIRED'))
            for (const event of events) {
                try {
                    await recordCreatureVisualProgressFromMatchCompletion(supabaseAdmin, event)
                } catch (error) {
                    console.error('Creature visual progression recording failed', { gameId, profileId: event.profileId, code: error instanceof Error ? error.message.slice(0, 80) : 'unknown' })
                }
                try {
                    await recordEvolutionTargetWinFromMatchCompletion(supabaseAdmin, event, evolutionTargetWinsRequired)
                } catch (error) {
                    console.error('Evolution target progression recording failed', { gameId, profileId: event.profileId, code: error instanceof Error ? error.message.slice(0, 80) : 'unknown' })
                }
            }
        }

        return json({ status: outcome.toLowerCase(), result: commit.result ?? null, stateRevision: commit.stateRevision ?? null })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error.'
        const isInvalidAction = /exhausted|no transition|maximum level|invalid adaptation state|unknown adaptation/i.test(message)

        return json({ error: message }, isInvalidAction ? 400 : 500)
    }
})
