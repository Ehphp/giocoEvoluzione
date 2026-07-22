import { createInitialTraits, generateRoundEventSequence, normalizeTraitCollection, ROOM_CODE_LENGTH, TOTAL_ROUNDS } from '../game/config'
import { getRoundEventForRound } from '../game/round-events'
import type {
    GameStatus,
    RoundEventDefinition,
    TraitCollection,
    TraitType,
    WorldDefinition,
} from '../game/types'
import { DEFAULT_WORLD_ID, getWorldById } from '../game/worlds'
import { requireSupabase } from './supabase'

export type GameRecord = {
    id: string
    room_code: string
    status: GameStatus
    current_round: number
    world_id: string
    round_event_sequence: string[]
    player_1_id: string | null
    player_2_id: string | null
    player_1_score: number
    player_2_score: number
    winner_id: string | null
    started_at: string | null
    finished_at: string | null
    rematch_count: number
    created_at: string
    updated_at: string
}

export type PlayerRecord = {
    id: string
    game_id: string
    nickname: string
    slot: 1 | 2
    traits: TraitCollection
    connected: boolean
    created_at: string
}

export type RoundActionRecord = {
    id: string
    game_id: string
    round_number: number
    player_id: string
    trait: TraitType
    action_type: 'USE' | 'EVOLVE'
    created_at: string
}

export type RoundResultRecord = {
    id: string
    game_id: string
    round_number: number
    player_1_value: number
    player_2_value: number
    winner_id: string | null
    resolution_data: Record<string, unknown>
    created_at: string
}

export type GameSnapshot = {
    game: GameRecord
    players: PlayerRecord[]
    me: PlayerRecord | null
    opponent: PlayerRecord | null
    world: WorldDefinition
    currentRoundEvent: RoundEventDefinition | null
    nextRoundEvent: RoundEventDefinition | null
    actionsSubmitted: number
    myCurrentAction: RoundActionRecord | null
    currentRoundResult: RoundResultRecord | null
}

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateRoomCode(): string {
    return Array.from({ length: ROOM_CODE_LENGTH }, () => {
        const index = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)

        return ROOM_CODE_ALPHABET[index] ?? ROOM_CODE_ALPHABET[0]
    }).join('')
}

function mapGameRecord(data: Record<string, unknown>): GameRecord {
    return {
        id: String(data.id),
        room_code: String(data.room_code),
        status: data.status as GameStatus,
        current_round: Number(data.current_round),
        world_id: String(data.world_id ?? DEFAULT_WORLD_ID),
        round_event_sequence: (data.round_event_sequence as string[]) ?? [],
        player_1_id: (data.player_1_id as string | null) ?? null,
        player_2_id: (data.player_2_id as string | null) ?? null,
        player_1_score: Number(data.player_1_score),
        player_2_score: Number(data.player_2_score),
        winner_id: (data.winner_id as string | null) ?? null,
        started_at: (data.started_at as string | null) ?? null,
        finished_at: (data.finished_at as string | null) ?? null,
        rematch_count: Number(data.rematch_count ?? 0),
        created_at: String(data.created_at),
        updated_at: String(data.updated_at),
    }
}

function mapPlayerRecord(data: Record<string, unknown>): PlayerRecord {
    return {
        id: String(data.id),
        game_id: String(data.game_id),
        nickname: String(data.nickname),
        slot: Number(data.slot) as 1 | 2,
        traits: normalizeTraitCollection(data.traits as TraitCollection),
        connected: Boolean(data.connected),
        created_at: String(data.created_at),
    }
}

function mapRoundActionRecord(data: Record<string, unknown>): RoundActionRecord {
    return {
        id: String(data.id),
        game_id: String(data.game_id),
        round_number: Number(data.round_number),
        player_id: String(data.player_id),
        trait: data.trait as TraitType,
        action_type: data.action_type as 'USE' | 'EVOLVE',
        created_at: String(data.created_at),
    }
}

function mapRoundResultRecord(data: Record<string, unknown>): RoundResultRecord {
    return {
        id: String(data.id),
        game_id: String(data.game_id),
        round_number: Number(data.round_number),
        player_1_value: Number(data.player_1_value),
        player_2_value: Number(data.player_2_value),
        winner_id: (data.winner_id as string | null) ?? null,
        resolution_data: (data.resolution_data as Record<string, unknown>) ?? {},
        created_at: String(data.created_at),
    }
}

function normalizeRoomCode(roomCode: string) {
    return roomCode.trim().toUpperCase()
}

function isUniqueViolation(error: { code?: string } | null) {
    return error?.code === '23505'
}

async function getInvokeErrorMessage(error: unknown): Promise<string> {
    if (!(error instanceof Error)) {
        return 'Errore sconosciuto durante la risoluzione round.'
    }

    const maybeContext = (error as Error & { context?: unknown }).context

    if (typeof Response !== 'undefined' && maybeContext instanceof Response) {
        try {
            const payload = await maybeContext.clone().json() as { error?: unknown }

            if (typeof payload.error === 'string' && payload.error.trim()) {
                return payload.error
            }
        } catch {
            try {
                const textPayload = await maybeContext.text()

                if (textPayload.trim()) {
                    return textPayload
                }
            } catch {
                // Keep original error message when response body cannot be parsed.
            }
        }
    }

    return error.message
}

async function ensurePlayerConnected(playerId: string) {
    const supabase = requireSupabase()

    await supabase.from('players').update({ connected: true }).eq('id', playerId)
}

export async function fetchGameSnapshot(gameId: string, playerId: string): Promise<GameSnapshot> {
    const supabase = requireSupabase()

    const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .maybeSingle()

    if (gameError) {
        throw new Error(gameError.message)
    }

    if (!gameData) {
        throw new Error('Partita non trovata.')
    }

    const game = mapGameRecord(gameData)

    const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', gameId)
        .order('slot')

    if (playersError) {
        throw new Error(playersError.message)
    }

    const players = (playersData ?? []).map((entry) => mapPlayerRecord(entry))
    const me = players.find((player) => player.id === playerId) ?? null
    const opponent = players.find((player) => player.id !== playerId) ?? null

    const { count, error: countError } = await supabase
        .from('round_actions')
        .select('*', { count: 'exact', head: true })
        .eq('game_id', gameId)
        .eq('round_number', game.current_round)

    if (countError) {
        throw new Error(countError.message)
    }

    const { data: myActionData, error: myActionError } = await supabase
        .from('round_actions')
        .select('*')
        .eq('game_id', gameId)
        .eq('round_number', game.current_round)
        .eq('player_id', playerId)
        .maybeSingle()

    if (myActionError) {
        throw new Error(myActionError.message)
    }

    const { data: roundResultData, error: roundResultError } = await supabase
        .from('round_results')
        .select('*')
        .eq('game_id', gameId)
        .eq('round_number', game.current_round)
        .maybeSingle()

    if (roundResultError) {
        throw new Error(roundResultError.message)
    }

    if (game.status === 'CHOOSING' && (count ?? 0) >= 2 && !roundResultData) {
        // Self-heal stuck rounds by retrying idempotent resolution.
        void maybeResolveRound(gameId, game.current_round).catch(() => undefined)
    }

    const world = getWorldById(game.world_id)
    return {
        game,
        players,
        me,
        opponent,
        world,
        currentRoundEvent: getRoundEventForRound(game.round_event_sequence, game.current_round),
        nextRoundEvent: getRoundEventForRound(game.round_event_sequence, game.current_round + 1),
        actionsSubmitted: count ?? 0,
        myCurrentAction: myActionData ? mapRoundActionRecord(myActionData) : null,
        currentRoundResult: roundResultData ? mapRoundResultRecord(roundResultData) : null,
    }
}

export async function createGame(input: { nickname: string; playerId: string }): Promise<GameSnapshot> {
    const supabase = requireSupabase()

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const roomCode = generateRoomCode()
        const roundEventSequence = generateRoundEventSequence()

        const { data: gameData, error: gameError } = await supabase
            .from('games')
            .insert({
                room_code: roomCode,
                status: 'WAITING',
                current_round: 1,
                world_id: DEFAULT_WORLD_ID,
                round_event_sequence: roundEventSequence,
                player_1_score: 0,
                player_2_score: 0,
            })
            .select('*')
            .single()

        if (gameError) {
            if (isUniqueViolation(gameError)) {
                continue
            }

            throw new Error(gameError.message)
        }

        const game = mapGameRecord(gameData)

        const { error: playerError } = await supabase.from('players').insert({
            id: input.playerId,
            game_id: game.id,
            nickname: input.nickname.trim(),
            slot: 1,
            traits: createInitialTraits(),
            connected: true,
        })

        if (playerError) {
            throw new Error(playerError.message)
        }

        const { error: updateError } = await supabase
            .from('games')
            .update({ player_1_id: input.playerId })
            .eq('id', game.id)

        if (updateError) {
            throw new Error(updateError.message)
        }

        await ensurePlayerConnected(input.playerId)

        return fetchGameSnapshot(game.id, input.playerId)
    }

    throw new Error('Impossibile generare un codice stanza valido. Riprova.')
}

export async function joinGame(input: {
    roomCode: string
    nickname: string
    playerId: string
}): Promise<GameSnapshot> {
    const supabase = requireSupabase()
    const roomCode = normalizeRoomCode(input.roomCode)

    const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('room_code', roomCode)
        .maybeSingle()

    if (gameError) {
        throw new Error(gameError.message)
    }

    if (!gameData) {
        throw new Error('Stanza inesistente.')
    }

    const game = mapGameRecord(gameData)

    if (game.status === 'FINISHED') {
        throw new Error('La partita è già terminata.')
    }

    const { data: existingPlayersData, error: existingPlayersError } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', game.id)

    if (existingPlayersError) {
        throw new Error(existingPlayersError.message)
    }

    const existingPlayers = (existingPlayersData ?? []).map((entry) => mapPlayerRecord(entry))
    const existingSessionPlayer = existingPlayers.find((player) => player.id === input.playerId)

    if (existingSessionPlayer) {
        await ensurePlayerConnected(existingSessionPlayer.id)

        return fetchGameSnapshot(game.id, existingSessionPlayer.id)
    }

    if (existingPlayers.length >= 2 || game.player_2_id) {
        throw new Error('La stanza è già piena.')
    }

    const { error: playerError } = await supabase.from('players').insert({
        id: input.playerId,
        game_id: game.id,
        nickname: input.nickname.trim(),
        slot: 2,
        traits: createInitialTraits(),
        connected: true,
    })

    if (playerError) {
        throw new Error(playerError.message)
    }

    const { error: updateError } = await supabase
        .from('games')
        .update({
            player_2_id: input.playerId,
            status: 'CHOOSING',
            started_at: new Date().toISOString(),
        })
        .eq('id', game.id)

    if (updateError) {
        throw new Error(updateError.message)
    }

    await ensurePlayerConnected(input.playerId)

    return fetchGameSnapshot(game.id, input.playerId)
}

export async function restoreGameSession(session: {
    gameId: string
    playerId: string
}): Promise<GameSnapshot> {
    await ensurePlayerConnected(session.playerId)

    const snapshot = await fetchGameSnapshot(session.gameId, session.playerId)

    if (!snapshot.me) {
        throw new Error('Sessione non piu valida per questa partita.')
    }

    return snapshot
}

export async function submitRoundAction(input: {
    gameId: string
    roundNumber: number
    playerId: string
    trait: TraitType
    actionType: 'USE' | 'EVOLVE'
}) {
    const supabase = requireSupabase()

    const { error } = await supabase.from('round_actions').insert({
        game_id: input.gameId,
        round_number: input.roundNumber,
        player_id: input.playerId,
        trait: input.trait,
        action_type: input.actionType,
    })

    if (error && !isUniqueViolation(error)) {
        throw new Error(error.message)
    }

    try {
        await maybeResolveRound(input.gameId, input.roundNumber)
    } catch (error) {
        // The action row is already persisted; keep UX consistent and rely on subscription/snapshot retries.
        console.warn('Round resolution retry scheduled after submit failure.', error)
    }
}

export async function maybeResolveRound(gameId: string, roundNumber: number) {
    const supabase = requireSupabase()

    const { error } = await supabase.functions.invoke('resolve-round', {
        body: {
            gameId,
            roundNumber,
        },
    })

    if (error) {
        throw new Error(await getInvokeErrorMessage(error))
    }
}

export async function advanceToNextRound(gameId: string) {
    const supabase = requireSupabase()

    const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .maybeSingle()

    if (gameError) {
        throw new Error(gameError.message)
    }

    if (!gameData) {
        throw new Error('Partita non trovata.')
    }

    const game = mapGameRecord(gameData)

    if (game.status !== 'ROUND_RESULT' || game.current_round >= TOTAL_ROUNDS) {
        return
    }

    const { data: updatedGame, error: updateError } = await supabase
        .from('games')
        .update({
            current_round: game.current_round + 1,
            status: 'CHOOSING',
        })
        .eq('id', gameId)
        .eq('status', 'ROUND_RESULT')
        .eq('current_round', game.current_round)
        .select('id')
        .maybeSingle()

    if (updateError) {
        throw new Error(updateError.message)
    }

    if (!updatedGame) {
        return
    }
}

export async function acknowledgeReveal(gameId: string) {
    const supabase = requireSupabase()

    const { error } = await supabase
        .from('games')
        .update({ status: 'ROUND_RESULT' })
        .eq('id', gameId)
        .eq('status', 'REVEALING')

    if (error) {
        throw new Error(error.message)
    }
}

export async function subscribeToGame(gameId: string, onChange: () => void) {
    const supabase = requireSupabase()

    const channel = supabase
        .channel(`game:${gameId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, onChange)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
            onChange,
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'round_actions', filter: `game_id=eq.${gameId}` },
            onChange,
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'round_results', filter: `game_id=eq.${gameId}` },
            onChange,
        )
        .subscribe()

    return () => {
        void supabase.removeChannel(channel)
    }
}