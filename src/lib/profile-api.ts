import type { GameMode, GameStatus, PlayerType } from '../game/types'
import type { ProgressionOutcome } from './progression'
import { requireSupabase } from './supabase'
import { parseCombatMutationLoadout } from '../../shared/game-rules/state.ts'
import type { CombatMutationLoadout } from '../../shared/game-rules/types.ts'
import { resolveCreatureHeightMeters } from '../../shared/creature-scale.ts'

export type ProfileRecord = {
    id: string
    nickname: string
    skill_rating: number
    created_at: string
    updated_at: string
    active_lineage_id?: string | null
}

export type CompetitiveLeaderboardEntry = {
    position: number
    nickname: string
    skillRating: number
}

export type PlayerCreatureRecord = {
    id: string
    profile_id: string
    lineage_id: string
    base_creature_key: string
    name: string | null
    level: number
    experience: number
    progression_state: Record<string, unknown>
    /** Canonical biological height, in metres. */
    heightMeters: number
    /** Present on every value returned by mapPlayerCreatureRecord; optional for legacy display fixtures only. */
    combat_mutation_loadout?: CombatMutationLoadout
    current_visual_version_id?: string | null
    created_at: string
    updated_at: string
}

/** Stable identity of an independently evolving creature family. */
export type CreatureLineageRecord = {
    id: string
    profile_id: string
    name: string | null
    base_creature_key: string
    created_at: string
    updated_at: string
    creature: PlayerCreatureRecord
}

export type MatchRewardRecord = {
    id: string
    game_id: string
    profile_id: string
    experience_awarded: number
    created_at: string
}

type HistoryGameRow = {
    id: string
    room_code: string | null
    game_mode: GameMode
    status: GameStatus
    winner_id: string | null
    player_1_score: number
    player_2_score: number
    finished_at: string | null
    created_at: string
}

export type ProfileMatchHistoryItem = {
    gameId: string
    date: string
    mode: 'PVP' | 'VS_BOT'
    opponentNickname: string
    outcome: ProgressionOutcome
    score: number
    opponentScore: number
    roomCode: string | null
    status: GameStatus
}

export type BootstrapPlan = {
    needsProfile: boolean
    needsCreature: boolean
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

export function mapProfileRecord(data: Record<string, unknown>): ProfileRecord {
    return {
        id: String(data.id),
        nickname: String(data.nickname),
        skill_rating: Number(data.skill_rating ?? 1000),
        created_at: String(data.created_at),
        updated_at: String(data.updated_at),
        active_lineage_id: typeof data.active_lineage_id === 'string' ? data.active_lineage_id : null,
    }
}

export function mapCreatureLineageRecord(data: Record<string, unknown>, creature: PlayerCreatureRecord): CreatureLineageRecord {
    return {
        id: String(data.id),
        profile_id: String(data.profile_id),
        name: typeof data.name === 'string' ? data.name : null,
        base_creature_key: String(data.base_creature_key),
        created_at: String(data.created_at),
        updated_at: String(data.updated_at),
        creature,
    }
}

export function mapCompetitiveLeaderboardEntry(data: Record<string, unknown>): CompetitiveLeaderboardEntry {
    return {
        position: Number(data.rank_position),
        nickname: String(data.nickname),
        skillRating: Number(data.skill_rating),
    }
}

export function mapPlayerCreatureRecord(data: Record<string, unknown>): PlayerCreatureRecord {
    const baseCreatureKey = String(data.base_creature_key)

    return {
        id: String(data.id),
        profile_id: String(data.profile_id),
        lineage_id: String(data.lineage_id),
        base_creature_key: baseCreatureKey,
        name: typeof data.name === 'string' ? data.name : null,
        level: Number(data.level),
        experience: Number(data.experience),
        progression_state: asRecord(data.progression_state),
        heightMeters: resolveCreatureHeightMeters(data.height_meters, baseCreatureKey),
        combat_mutation_loadout: parseCombatMutationLoadout(data.combat_mutation_loadout, 'player_creature.combat_mutation_loadout'),
        current_visual_version_id: typeof data.current_visual_version_id === 'string' ? data.current_visual_version_id : null,
        created_at: String(data.created_at),
        updated_at: String(data.updated_at),
    }
}

export async function setMyCreatureCombatMutationLoadout(creatureId: string, loadout: CombatMutationLoadout): Promise<PlayerCreatureRecord> {
    const { data, error } = await requireSupabase().rpc('set_my_creature_combat_mutation_loadout', {
        p_creature_id: creatureId,
        p_combat_mutation_loadout: [...loadout],
    })

    if (error) throw new Error(error.message)
    if (!data || typeof data !== 'object') throw new Error('Il loadout della creatura non e stato aggiornato.')

    return mapPlayerCreatureRecord(data as Record<string, unknown>)
}

function mapMatchRewardRecord(data: Record<string, unknown>): MatchRewardRecord {
    return {
        id: String(data.id),
        game_id: String(data.game_id),
        profile_id: String(data.profile_id),
        experience_awarded: Number(data.experience_awarded),
        created_at: String(data.created_at),
    }
}

function mapHistoryGameRow(data: Record<string, unknown>): HistoryGameRow {
    return {
        id: String(data.id),
        room_code: typeof data.room_code === 'string' ? data.room_code : null,
        game_mode: data.game_mode === 'VS_BOT' ? 'VS_BOT' : 'PVP',
        status: String(data.status) as GameStatus,
        winner_id: typeof data.winner_id === 'string' ? data.winner_id : null,
        player_1_score: Number(data.player_1_score),
        player_2_score: Number(data.player_2_score),
        finished_at: typeof data.finished_at === 'string' ? data.finished_at : null,
        created_at: String(data.created_at),
    }
}

export function getMatchOutcome(winnerId: string | null, playerId: string): ProgressionOutcome {
    if (!winnerId) {
        return 'draw'
    }

    return winnerId === playerId ? 'win' : 'loss'
}

export function getBootstrapPlan(profile: ProfileRecord | null, creature: PlayerCreatureRecord | null): BootstrapPlan {
    return {
        needsProfile: profile === null,
        needsCreature: creature === null,
    }
}

export function isRewardEligible(input: {
    gameStatus: GameStatus
    playerType: PlayerType
    profileId: string | null
    existingReward: MatchRewardRecord | null
}) {
    return input.gameStatus === 'FINISHED'
        && input.playerType === 'HUMAN'
        && input.profileId !== null
        && input.existingReward === null
}

export function mapProfileMatchHistory(
    profileId: string,
    gameRows: Array<Record<string, unknown>>,
    playerRows: Array<Record<string, unknown>>,
): ProfileMatchHistoryItem[] {
    const playersByGame = new Map<string, Array<Record<string, unknown>>>()

    for (const player of playerRows) {
        const gameId = String(player.game_id)
        const current = playersByGame.get(gameId) ?? []
        current.push(player)
        playersByGame.set(gameId, current)
    }

    return gameRows
        .map(mapHistoryGameRow)
        .filter((game) => game.status === 'FINISHED')
        .map((game) => {
            const players = playersByGame.get(game.id) ?? []
            const me = players.find((player) => String(player.profile_id ?? '') === profileId)

            if (!me) {
                return null
            }

            const opponent = players.find((player) => String(player.id) !== String(me.id))
            const mySlot = Number(me.slot)

            return {
                gameId: game.id,
                date: game.finished_at ?? game.created_at,
                mode: game.game_mode,
                opponentNickname: typeof opponent?.nickname === 'string'
                    ? opponent.nickname
                    : game.game_mode === 'VS_BOT' ? 'Bot' : 'Avversario sconosciuto',
                outcome: getMatchOutcome(game.winner_id, String(me.id)),
                score: mySlot === 1 ? game.player_1_score : game.player_2_score,
                opponentScore: mySlot === 1 ? game.player_2_score : game.player_1_score,
                roomCode: game.room_code,
                status: game.status,
            } satisfies ProfileMatchHistoryItem
        })
        .filter((item): item is ProfileMatchHistoryItem => item !== null)
        .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
}

export async function bootstrapMyProfile() {
    const { error } = await requireSupabase().rpc('bootstrap_my_profile')

    if (error) {
        throw new Error(error.message)
    }
}

export async function loadMyProfile(): Promise<{ profile: ProfileRecord; creature: PlayerCreatureRecord; activeLineage: CreatureLineageRecord; lineages: CreatureLineageRecord[] }> {
    const supabase = requireSupabase()
    const [{ data: profileData, error: profileError }, { data: lineageData, error: lineageError }, { data: creatureData, error: creatureError }] = await Promise.all([
        supabase.from('profiles').select('*').maybeSingle(),
        supabase.from('creature_lineages').select('*').order('created_at', { ascending: true }),
        supabase.from('player_creatures').select('*').order('created_at', { ascending: true }),
    ])

    if (profileError) {
        throw new Error(profileError.message)
    }

    if (creatureError) {
        throw new Error(creatureError.message)
    }

    if (lineageError) {
        throw new Error(lineageError.message)
    }

    if (!profileData || !creatureData || !lineageData) {
        throw new Error('Profilo o stirpe non inizializzati.')
    }

    const profile = mapProfileRecord(profileData)
    const creatures = (creatureData ?? []).map(mapPlayerCreatureRecord)
    const creaturesByLineage = new Map(creatures.map((creature) => [creature.lineage_id, creature]))
    const lineages = (lineageData ?? []).flatMap((lineage) => {
        const creature = creaturesByLineage.get(typeof lineage.id === 'string' ? lineage.id : '')
        return creature ? [mapCreatureLineageRecord(lineage, creature)] : []
    })
    const activeLineage = lineages.find((lineage) => lineage.id === profile.active_lineage_id) ?? null

    if (!activeLineage) {
        throw new Error('La stirpe attiva non Ã¨ disponibile.')
    }

    return {
        profile,
        creature: activeLineage.creature,
        activeLineage,
        lineages,
    }
}

export async function setMyActiveCreatureLineage(lineageId: string): Promise<void> {
    const { error } = await requireSupabase().rpc('set_my_active_creature_lineage', { p_lineage_id: lineageId })
    if (error) throw new Error(error.message)
}

/** Creates an independent lineage from the standard starting creature. */
export async function createMyCreatureLineage(): Promise<PlayerCreatureRecord> {
    const { data, error } = await requireSupabase().rpc('create_my_creature_lineage', {
        p_base_creature_key: 'VERDANT_HATCHLING',
        p_name: null,
    })

    if (error) throw new Error(error.message)
    if (!data || typeof data !== 'object') throw new Error('La nuova stirpe non e stata creata.')

    return mapPlayerCreatureRecord(data as Record<string, unknown>)
}

export async function deleteMyCreatureLineage(lineageId: string): Promise<void> {
    const { data, error } = await requireSupabase().functions.invoke('delete-creature-lineage', {
        body: { lineageId },
    })

    if (error) throw new Error('Impossibile eliminare la stirpe.')
    if (!data || typeof data !== 'object' || (data as Record<string, unknown>).success !== true) {
        throw new Error('Impossibile eliminare la stirpe.')
    }

    const cleanup = (data as Record<string, unknown>).storageCleanup
    if (cleanup && typeof cleanup === 'object' && (cleanup as Record<string, unknown>).status === 'PENDING_RETRY') {
        console.warn('La stirpe è stata eliminata; alcuni asset Storage richiedono una pulizia manuale.')
    }
}

export async function updateMyNickname(nickname: string): Promise<ProfileRecord> {
    const value = nickname.trim()

    if (!value || value.length > 20) {
        throw new Error('Il nickname deve avere da 1 a 20 caratteri.')
    }

    const { data, error } = await requireSupabase()
        .from('profiles')
        .update({ nickname: value })
        .select('*')
        .single()

    if (error) {
        throw new Error(error.message)
    }

    return mapProfileRecord(data)
}

export async function fetchCompetitiveLeaderboard(limit = 50): Promise<CompetitiveLeaderboardEntry[]> {
    const { data, error } = await requireSupabase().rpc('get_competitive_leaderboard', { p_limit: limit })

    if (error) {
        throw new Error(error.message)
    }

    return Array.isArray(data)
        ? data.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object')).map(mapCompetitiveLeaderboardEntry)
        : []
}

export async function fetchProfileMatchHistory(profileId: string, limit: number | null = 10): Promise<ProfileMatchHistoryItem[]> {
    const supabase = requireSupabase()
    const { data: ownPlayerRows, error: ownPlayersError } = await supabase
        .from('players')
        .select('id, game_id, profile_id, slot')
        .eq('profile_id', profileId)

    if (ownPlayersError) {
        throw new Error(ownPlayersError.message)
    }

    const gameIds = [...new Set((ownPlayerRows ?? []).map((player) => String(player.game_id)))]

    if (!gameIds.length) {
        return []
    }

    let gamesQuery = supabase
        .from('games')
        .select('id, room_code, game_mode, status, winner_id, player_1_score, player_2_score, finished_at, created_at')
        .in('id', gameIds)
        .eq('status', 'FINISHED')
        .order('finished_at', { ascending: false })
    if (limit !== null) {
        gamesQuery = gamesQuery.limit(limit)
    }

    const { data: gameRows, error: gamesError } = await gamesQuery

    if (gamesError) {
        throw new Error(gamesError.message)
    }

    const finishedGameIds = (gameRows ?? []).map((game) => String(game.id))

    if (!finishedGameIds.length) {
        return []
    }

    const { data: allPlayerRows, error: playersError } = await supabase
        .from('players')
        .select('id, game_id, profile_id, nickname, slot, player_type')
        .in('game_id', finishedGameIds)

    if (playersError) {
        throw new Error(playersError.message)
    }

    return mapProfileMatchHistory(profileId, gameRows ?? [], allPlayerRows ?? [])
}

export async function fetchMatchReward(gameId: string, profileId: string): Promise<MatchRewardRecord | null> {
    const { data, error } = await requireSupabase()
        .from('match_rewards')
        .select('*')
        .eq('game_id', gameId)
        .eq('profile_id', profileId)
        .maybeSingle()

    if (error) {
        throw new Error(error.message)
    }

    return data ? mapMatchRewardRecord(data) : null
}
