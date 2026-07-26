import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { normalizeTraitCollection } from '../../../src/game/config.ts'
import { buildPersistedRoundResolution } from '../../../src/game/persisted-round-resolution.ts'
import { getRoundEventById } from '../../../src/game/round-events.ts'
import { ensureBotRoundAction } from '../../../src/game/vs-bot-round.ts'
import type { TraitCollection, TraitType } from '../../../src/game/types.ts'

// Pure game rules and persisted resolution mapping are shared with the frontend.
// Only persistence and idempotent resolution orchestration remain local here.

type TraitName = TraitType

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

async function applyStoredResolution(
    supabaseAdmin: ReturnType<typeof createClient>,
    gameId: string,
    player1Id: string,
    player2Id: string,
    resolutionData: Record<string, unknown>,
) {
    const player1TraitsAfter = normalizeTraitCollection(resolutionData.player1TraitsAfter as TraitCollection)
    const player2TraitsAfter = normalizeTraitCollection(resolutionData.player2TraitsAfter as TraitCollection)
    const player1ScoreAfter = Number(resolutionData.player1ScoreAfter ?? 0)
    const player2ScoreAfter = Number(resolutionData.player2ScoreAfter ?? 0)
    const statusAfter = String(resolutionData.statusAfter ?? 'REVEALING')
    const winnerIdAfter = (resolutionData.winnerIdAfter as string | null) ?? null
    const finishedAt = (resolutionData.finishedAt as string | null) ?? null

    await Promise.all([
        supabaseAdmin.from('players').update({ traits: player1TraitsAfter, connected: true }).eq('id', player1Id),
        supabaseAdmin.from('players').update({ traits: player2TraitsAfter, connected: true }).eq('id', player2Id),
        supabaseAdmin
            .from('games')
            .update({
                player_1_score: player1ScoreAfter,
                player_2_score: player2ScoreAfter,
                status: statusAfter,
                winner_id: winnerIdAfter,
                finished_at: finishedAt,
            })
            .eq('id', gameId),
    ])
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
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceRoleKey) {
        return json({ error: 'Missing Supabase service role configuration.' }, 500)
    }

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

        if (!playersData || playersData.length < 2) {
            return json({ status: 'pending', reason: 'waiting_for_players' })
        }

        const player1 = playersData.find((player) => Number(player.slot) === 1)
        const player2 = playersData.find((player) => Number(player.slot) === 2)

        if (!player1 || !player2) {
            return json({ status: 'pending', reason: 'missing_slots' })
        }

        const { data: existingResultData } = await supabaseAdmin
            .from('round_results')
            .select('*')
            .eq('game_id', gameId)
            .eq('round_number', roundNumber)
            .maybeSingle()

        if (existingResultData) {
            await applyStoredResolution(
                supabaseAdmin,
                gameId,
                String(player1.id),
                String(player2.id),
                (existingResultData.resolution_data as Record<string, unknown>) ?? {},
            )

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

        const gameMode = String((gameData as Record<string, unknown>).game_mode ?? 'PVP')

        if (gameMode === 'VS_BOT') {
            const botPlayer = playersData.find((player) => String((player as Record<string, unknown>).player_type ?? 'HUMAN') === 'BOT')

            if (botPlayer && (!actionsData || !actionsData.some((action) => action.player_id === botPlayer.id))) {
                await ensureBotRoundAction(
                    {
                        insertRoundAction: async (input) => {
                            const { error } = await supabaseAdmin.from('round_actions').insert({
                                game_id: input.gameId,
                                round_number: input.roundNumber,
                                player_id: input.playerId,
                                trait: input.trait,
                                action_type: input.actionType,
                            })

                            if (error) {
                                throw error
                            }
                        },
                        getRoundAction: async (currentGameId, currentRoundNumber, playerId) => {
                            const { data, error } = await supabaseAdmin
                                .from('round_actions')
                                .select('*')
                                .eq('game_id', currentGameId)
                                .eq('round_number', currentRoundNumber)
                                .eq('player_id', playerId)
                                .maybeSingle()

                            if (error) {
                                throw error
                            }

                            return data
                        },
                    },
                    {
                        gameId,
                        roundNumber,
                        playerId: String(botPlayer.id),
                        traits: normalizeTraitCollection(botPlayer.traits as TraitCollection),
                    },
                )

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

        const roundEventId = String(gameData.round_event_sequence?.[roundNumber - 1] ?? '')

        if (!roundEventId) {
            return json({ error: `Missing round event for round ${roundNumber}.` }, 400)
        }

        const roundEvent = getRoundEventById(roundEventId)

        const resolution = buildPersistedRoundResolution({
            roundNumber,
            roundEvent,
            player1Id: String(player1.id),
            player2Id: String(player2.id),
            player1Score: Number(gameData.player_1_score ?? 0),
            player2Score: Number(gameData.player_2_score ?? 0),
            player1Traits: normalizeTraitCollection(player1.traits as TraitCollection),
            player2Traits: normalizeTraitCollection(player2.traits as TraitCollection),
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
        })

        const { data: insertedResult, error: insertError } = await supabaseAdmin
            .from('round_results')
            .insert({
                game_id: gameId,
                round_number: roundNumber,
                player_1_value: resolution.player_1_value,
                player_2_value: resolution.player_2_value,
                winner_id: resolution.winner_id,
                resolution_data: resolution.resolution_data,
            })
            .select('*')
            .single()

        if (insertError) {
            if (insertError.code === '23505') {
                const { data: duplicateResult } = await supabaseAdmin
                    .from('round_results')
                    .select('*')
                    .eq('game_id', gameId)
                    .eq('round_number', roundNumber)
                    .maybeSingle()

                if (duplicateResult) {
                    await applyStoredResolution(
                        supabaseAdmin,
                        gameId,
                        String(player1.id),
                        String(player2.id),
                        (duplicateResult.resolution_data as Record<string, unknown>) ?? {},
                    )

                    return json({ status: 'already_resolved', result: duplicateResult })
                }
            }

            return json({ error: insertError.message }, 400)
        }

        await applyStoredResolution(
            supabaseAdmin,
            gameId,
            String(player1.id),
            String(player2.id),
            resolution.resolution_data,
        )

        return json({ status: 'resolved', result: insertedResult })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error.'
        const isInvalidAction = /cooldown|maximum level|invalid trait state|unknown trait/i.test(message)

        return json({ error: message }, isInvalidAction ? 400 : 500)
    }
})
