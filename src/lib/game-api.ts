import { normalizeTraitCollection, TRAITS } from '../game/config'
import { normalizeCombatMutationLoadout, normalizeCombatMutationState } from '../../shared/game-rules/state.ts'
import { getRoundEventForRound } from '../game/round-events'
import type {
    CombatMutationLoadout,
    CombatMutationState,
    GameMode,
    GameStatus,
    RoundEventDefinition,
    TraitCollection,
    TraitType,
    PlayerType,
    WorldDefinition,
} from '../game/types'
import { DEFAULT_WORLD_ID, getWorldById } from '../game/worlds'
import { requireSupabase } from './supabase'
import { normalizeEvolutionDraftOptions } from '../../shared/creature-transformations/evolution-draft.ts'
import { isEvolutionTargetId, type EvolutionTargetId } from '../../shared/creature-transformations/evolution-targets.ts'

export type GameRecord = {
    id: string
    room_code: string
    game_mode: GameMode
    bot_difficulty: 'EASY' | 'NORMAL' | 'HARD'
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
    state_revision: number
}

export type PlayerRecord = {
    id: string
    game_id: string
    nickname: string
    slot: 1 | 2
    player_type: PlayerType
    traits: TraitCollection
    combat_mutation_state: CombatMutationState
    combat_mutation_loadout?: CombatMutationLoadout
    connected: boolean
    profile_id?: string | null
    creature_id?: string | null
    creature_snapshot?: Record<string, unknown> | null
    /** The two anatomical targets this player was offered at the start of the match. */
    evolution_draft_options: EvolutionTargetId[]
    /** The target that will be credited if this player wins; null until they choose. */
    chosen_evolution_target_id: EvolutionTargetId | null
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
    roundResults: RoundResultRecord[]
    stateRevision: number
}

export type GameMutationResult = {
    stateRevision: number
    changed: boolean
    resolveRequired?: boolean
}

const gameSyncInstrumentation = {
    getGameSnapshotCalls: 0,
    resolveRoundCalls: 0,
}
const isGameSyncInstrumentationEnabled = import.meta.env.DEV || import.meta.env.MODE === 'test'

/** DEV/test diagnostic counters; production behavior does not depend on them. */
export function getGameSyncInstrumentation() {
    return { ...gameSyncInstrumentation }
}

export function resetGameSyncInstrumentation() {
    gameSyncInstrumentation.getGameSnapshotCalls = 0
    gameSyncInstrumentation.resolveRoundCalls = 0
}

export function isGameSnapshotPlayable(snapshot: GameSnapshot): boolean {
    if (!snapshot.me) {
        return false
    }

    const traits = snapshot.me.traits

    if (!traits) {
        return false
    }

    const hasAllTraits = TRAITS.every((trait) => {
        const state = traits[trait]

        return state && typeof state.level === 'number' && typeof state.exhausted === 'boolean'
    })

    if (!hasAllTraits) {
        return false
    }

    const sequence = snapshot.game.round_event_sequence
    const currentRound = snapshot.game.current_round

    if (!Array.isArray(sequence) || sequence.length < currentRound || currentRound <= 0) {
        return false
    }

    return snapshot.currentRoundEvent !== null
}

function mapGameRecord(data: Record<string, unknown>): GameRecord {
    return {
        id: String(data.id),
        room_code: String(data.room_code),
        game_mode: (data.game_mode as GameMode) ?? 'PVP',
        bot_difficulty: (['EASY', 'NORMAL', 'HARD'].includes(String(data.bot_difficulty)) ? data.bot_difficulty : 'NORMAL') as 'EASY' | 'NORMAL' | 'HARD',
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
        state_revision: Number(data.state_revision ?? 0),
    }
}

const reportedUnknownDraftOptions = new Set<string>()

/**
 * A persisted target id outside the current taxonomy means the database is behind the evolution
 * target migration: the draft would silently stop being offered, so say it out loud once.
 */
function reportUnknownDraftOptions(value: unknown, normalized: readonly EvolutionTargetId[]): void {
    if (!Array.isArray(value)) return
    const unknown = value.filter((entry) => !isEvolutionTargetId(entry)).map((entry) => String(entry))
    if (!unknown.length) return
    const key = unknown.sort().join(',')
    if (reportedUnknownDraftOptions.has(key)) return
    reportedUnknownDraftOptions.add(key)
    console.warn('Evolution draft options outside the current taxonomy were ignored. Apply the evolution target migration.', {
        ignored: unknown,
        offered: normalized,
    })
}

export function mapPlayerRecord(data: Record<string, unknown>): PlayerRecord {
    const evolutionDraftOptions = normalizeEvolutionDraftOptions(data.evolution_draft_options)
    reportUnknownDraftOptions(data.evolution_draft_options, evolutionDraftOptions)

    return {
        id: String(data.id),
        game_id: String(data.game_id),
        nickname: String(data.nickname),
        slot: Number(data.slot) as 1 | 2,
        player_type: (data.player_type as PlayerType) ?? 'HUMAN',
        traits: normalizeTraitCollection(data.traits as TraitCollection),
        combat_mutation_state: normalizeCombatMutationState(data.combat_mutation_state as Parameters<typeof normalizeCombatMutationState>[0]),
        combat_mutation_loadout: normalizeCombatMutationLoadout(data.combat_mutation_loadout),
        connected: Boolean(data.connected),
        profile_id: typeof data.profile_id === 'string' ? data.profile_id : null,
        creature_id: typeof data.creature_id === 'string' ? data.creature_id : null,
        creature_snapshot: data.creature_snapshot && typeof data.creature_snapshot === 'object'
            ? data.creature_snapshot as Record<string, unknown>
            : null,
        evolution_draft_options: evolutionDraftOptions,
        chosen_evolution_target_id: isEvolutionTargetId(data.chosen_evolution_target_id)
            ? data.chosen_evolution_target_id
            : null,
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

async function ensurePlayerConnected(gameId: string, playerId: string) {
    const supabase = requireSupabase()

    const { error } = await supabase.rpc('touch_game_participant', {
        p_game_id: gameId,
        p_player_id: playerId,
    })

    if (error) {
        throw new Error(error.message)
    }
}

export async function fetchGameSnapshot(gameId: string, playerId: string): Promise<GameSnapshot> {
    const supabase = requireSupabase()
    if (isGameSyncInstrumentationEnabled) gameSyncInstrumentation.getGameSnapshotCalls += 1

    const { data, error } = await supabase.rpc('get_game_snapshot', { p_game_id: gameId })
    if (error) throw new Error(error.message)
    if (!data || typeof data !== 'object') throw new Error('Partita non trovata.')

    const payload = data as Record<string, unknown>
    const gameData = payload.game
    if (!gameData || typeof gameData !== 'object') throw new Error('Partita non trovata.')
    const game = mapGameRecord(gameData as Record<string, unknown>)
    const players = Array.isArray(payload.players)
        ? payload.players.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object')).map(mapPlayerRecord)
        : []
    const meData = payload.me
    const opponentData = payload.opponent
    const myActionData = payload.myCurrentAction
    const currentResultData = payload.currentRoundResult
    const roundResults = Array.isArray(payload.roundResults)
        ? payload.roundResults.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object')).map(mapRoundResultRecord)
        : []

    const world = getWorldById(game.world_id)
    return {
        game,
        players,
        // playerId remains a local session guard; authorization comes exclusively from auth.uid() in SQL.
        me: meData && typeof meData === 'object' ? mapPlayerRecord(meData as Record<string, unknown>) : players.find((player) => player.id === playerId) ?? null,
        opponent: opponentData && typeof opponentData === 'object' ? mapPlayerRecord(opponentData as Record<string, unknown>) : null,
        world,
        currentRoundEvent: getRoundEventForRound(game.round_event_sequence, game.current_round),
        nextRoundEvent: getRoundEventForRound(game.round_event_sequence, game.current_round + 1),
        actionsSubmitted: Number(payload.actionsSubmitted ?? 0),
        myCurrentAction: myActionData && typeof myActionData === 'object' ? mapRoundActionRecord(myActionData as Record<string, unknown>) : null,
        currentRoundResult: currentResultData && typeof currentResultData === 'object' ? mapRoundResultRecord(currentResultData as Record<string, unknown>) : null,
        roundResults,
        stateRevision: Number(payload.stateRevision ?? game.state_revision ?? 0),
    }
}

export type GameParticipantIdentity = {
    nickname: string
    playerId: string
    profileId: string | null
    creatureId: string | null
    creatureSnapshot: Record<string, unknown> | null
}

export async function createGame(input: GameParticipantIdentity): Promise<GameSnapshot> {
    const supabase = requireSupabase()
    const { data, error } = await supabase.rpc('create_pvp_game', { p_player_id: input.playerId })

    if (error) {
        throw new Error(error.message)
    }

    const created = Array.isArray(data) ? data[0] : data
    const gameId = String((created as { game_id?: unknown } | null)?.game_id ?? '')
    const playerId = String((created as { human_player_id?: unknown } | null)?.human_player_id ?? '')

    if (!gameId || !playerId) {
        throw new Error('Impossibile creare la partita.')
    }

    return fetchGameSnapshot(gameId, playerId)
}

export async function createVsBotGame(input: GameParticipantIdentity & { difficulty: 'EASY' | 'NORMAL' | 'HARD' }): Promise<GameSnapshot> {
    const supabase = requireSupabase()

    const { data, error } = await supabase.rpc('create_vs_bot_game', {
        p_nickname: input.nickname.trim(),
        p_player_id: input.playerId,
        p_bot_difficulty: input.difficulty,
        p_profile_id: input.profileId,
        p_creature_id: input.creatureId,
        p_creature_snapshot: input.creatureSnapshot,
    })

    if (error) {
        throw new Error(error.message)
    }

    const created = Array.isArray(data) ? data[0] : data

    if (!created) {
        throw new Error('Impossibile creare la partita contro il bot.')
    }

    const gameId = String((created as { game_id?: unknown }).game_id ?? (created as { id?: unknown }).id ?? '')

    if (!gameId) {
        throw new Error('Impossibile recuperare la partita contro il bot.')
    }

    const playerId = String((created as { human_player_id?: unknown }).human_player_id ?? input.playerId)
    return fetchGameSnapshot(gameId, playerId)
}

export async function joinGame(input: GameParticipantIdentity & { roomCode: string }): Promise<GameSnapshot> {
    const supabase = requireSupabase()
    const roomCode = normalizeRoomCode(input.roomCode)

    const { data, error } = await supabase.rpc('join_pvp_game', {
        p_room_code: roomCode,
        p_player_id: input.playerId,
    })

    if (error) {
        throw new Error(error.message)
    }

    const joined = Array.isArray(data) ? data[0] : data
    const gameId = String((joined as { game_id?: unknown } | null)?.game_id ?? '')
    const playerId = String((joined as { human_player_id?: unknown } | null)?.human_player_id ?? '')

    if (!gameId || !playerId) {
        throw new Error('Impossibile entrare nella partita.')
    }

    return fetchGameSnapshot(gameId, playerId)

    /* Legacy direct-table join flow, retained only as commented migration context.

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

    if (game.game_mode === 'VS_BOT') {
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

        throw new Error('Questa partita è contro il bot e non accetta altri giocatori.')
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
        player_type: 'HUMAN',
        traits: createInitialTraits(),
        connected: true,
        profile_id: input.profileId,
        creature_id: input.creatureId,
        creature_snapshot: input.creatureSnapshot,
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
    */
}

export async function restoreGameSession(session: {
    gameId: string
    playerId: string
}): Promise<GameSnapshot> {
    await ensurePlayerConnected(session.gameId, session.playerId)

    const snapshot = await fetchGameSnapshot(session.gameId, session.playerId)

    if (!snapshot.me) {
        throw new Error('Sessione non piu valida per questa partita.')
    }

    return snapshot
}

export async function submitRoundAction(input: {
    gameId: string
    roundNumber: number
    trait: TraitType
    actionType: 'USE' | 'EVOLVE'
}): Promise<GameMutationResult> {
    const supabase = requireSupabase()

    const { data, error } = await supabase.rpc('submit_game_round_action', {
        p_game_id: input.gameId,
        p_round_number: input.roundNumber,
        p_trait: input.trait,
        p_action_type: input.actionType,
    })

    if (error) {
        throw new Error(error.message)
    }

    return mapMutationResult(data)
}

export async function maybeResolveRound(gameId: string, roundNumber: number) {
    const supabase = requireSupabase()
    if (isGameSyncInstrumentationEnabled) gameSyncInstrumentation.resolveRoundCalls += 1

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

export async function advanceToNextRound(gameId: string): Promise<GameMutationResult> {
    const supabase = requireSupabase()

    const { data, error } = await supabase.rpc('advance_game_round', { p_game_id: gameId })
    if (error) throw new Error(error.message)
    return mapMutationResult(data)

    /* Legacy direct-table state transition.

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
    */
}

export async function acknowledgeReveal(gameId: string): Promise<GameMutationResult> {
    const supabase = requireSupabase()

    const { data, error } = await supabase.rpc('acknowledge_game_reveal', { p_game_id: gameId })

    if (error) {
        throw new Error(error.message)
    }
    return mapMutationResult(data)
}

function mapMutationResult(data: unknown): GameMutationResult {
    const value = data && typeof data === 'object' ? data as Record<string, unknown> : {}
    return {
        stateRevision: Number(value.stateRevision ?? 0),
        changed: Boolean(value.changed),
        resolveRequired: Boolean(value.resolveRequired),
    }
}

export async function subscribeToGame(
    gameId: string,
    onChange: (stateRevision: number | null) => void,
    onSubscribed?: () => void,
) {
    const supabase = requireSupabase()

    const channel = supabase
        .channel(`game:${gameId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, (payload) => {
            const row = payload.new as Record<string, unknown>
            const revision = typeof row.state_revision === 'number'
                ? row.state_revision
                : Number(row.state_revision)
            // A legacy/misapplied migration can publish an UPDATE with no usable
            // revision (or still at its initial zero). Treat it as an invalidation
            // requiring reconciliation rather than silently ignoring the join.
            onChange(Number.isFinite(revision) && revision > 0 ? revision : null)
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') onSubscribed?.()
        })

    return () => {
        void supabase.removeChannel(channel)
    }
}

/**
 * Records the anatomical target this player drafted at the start of the match.
 *
 * The server checks the target is one of the two it offered and refuses a second, different
 * choice; replaying the same choice is a no-op, so a retry is safe.
 */
export async function chooseEvolutionDraftTarget(gameId: string, evolutionTargetId: EvolutionTargetId): Promise<void> {
    const supabase = requireSupabase()
    const { error } = await supabase.rpc('choose_evolution_draft_target', {
        p_game_id: gameId,
        p_evolution_target_id: evolutionTargetId,
    })

    if (error) {
        throw new Error(translateEvolutionDraftError(error.message))
    }
}

function translateEvolutionDraftError(message: string): string {
    if (message.includes('EVOLUTION_TARGET_NOT_OFFERED')) return 'Quel tratto non e fra i due proposti per questa partita.'
    if (message.includes('EVOLUTION_DRAFT_ALREADY_CHOSEN')) return 'Hai gia scelto il tratto per questa partita.'
    if (message.includes('EVOLUTION_DRAFT_CLOSED')) return 'La partita e conclusa: non puoi piu scegliere il tratto.'
    if (message.includes('GAME_PARTICIPANT_REQUIRED')) return 'Non risulti fra i partecipanti di questa partita.'

    return message
}
