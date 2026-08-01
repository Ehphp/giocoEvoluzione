import { describe, expect, it } from 'vitest'

import { createInitialTraits } from '../game/config'
import { mapPlayerRecord } from './game-api'
import {
    getBootstrapPlan,
    getMatchOutcome,
    isRewardEligible,
    mapProfileMatchHistory,
    type MatchRewardRecord,
    type PlayerCreatureRecord,
    type ProfileRecord,
} from './profile-api'

const profile: ProfileRecord = {
    id: 'profile-1',
    nickname: 'Lince',
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-01T10:00:00.000Z',
}

const creature: PlayerCreatureRecord = {
    id: 'creature-1',
    profile_id: profile.id,
    base_creature_key: 'VERDANT_HATCHLING',
    name: null,
    level: 1,
    experience: 0,
    progression_state: {},
    created_at: profile.created_at,
    updated_at: profile.updated_at,
}

const existingReward: MatchRewardRecord = {
    id: 'reward-1',
    game_id: 'game-1',
    profile_id: profile.id,
    experience_awarded: 15,
    created_at: profile.created_at,
}

describe('profile persistence mappings', () => {
    it('has an idempotent bootstrap plan once profile and creature exist', () => {
        expect(getBootstrapPlan(null, null)).toEqual({ needsProfile: true, needsCreature: true })
        expect(getBootstrapPlan(profile, creature)).toEqual({ needsProfile: false, needsCreature: false })
        expect(getBootstrapPlan(profile, creature)).toEqual(getBootstrapPlan(profile, creature))
    })

    it('maps wins, draws and losses in finished match history', () => {
        const games = [
            { id: 'win', room_code: 'WIN01', game_mode: 'PVP', status: 'FINISHED', winner_id: 'player-1', player_1_score: 4, player_2_score: 2, finished_at: '2026-08-03T10:00:00.000Z', created_at: profile.created_at },
            { id: 'draw', room_code: 'DRW01', game_mode: 'PVP', status: 'FINISHED', winner_id: null, player_1_score: 3, player_2_score: 3, finished_at: '2026-08-02T10:00:00.000Z', created_at: profile.created_at },
            { id: 'loss', room_code: 'LOS01', game_mode: 'PVP', status: 'FINISHED', winner_id: 'player-2', player_1_score: 1, player_2_score: 4, finished_at: '2026-08-01T10:00:00.000Z', created_at: profile.created_at },
        ]
        const players = games.flatMap((game) => [
            { id: 'player-1', game_id: game.id, profile_id: profile.id, nickname: 'Lince', slot: 1, player_type: 'HUMAN' },
            { id: 'player-2', game_id: game.id, profile_id: null, nickname: 'Rana', slot: 2, player_type: 'HUMAN' },
        ])

        expect(mapProfileMatchHistory(profile.id, games, players).map((item) => item.outcome)).toEqual(['win', 'draw', 'loss'])
        expect(getMatchOutcome('player-2', 'player-1')).toBe('loss')
    })

    it('maps a bot without a profile and only considers finished games', () => {
        const history = mapProfileMatchHistory(profile.id, [
            { id: 'bot-game', room_code: 'BOT01', game_mode: 'VS_BOT', status: 'FINISHED', winner_id: 'player-1', player_1_score: 4, player_2_score: 1, finished_at: null, created_at: profile.created_at },
            { id: 'open-game', room_code: 'OPEN1', game_mode: 'PVP', status: 'CHOOSING', winner_id: null, player_1_score: 0, player_2_score: 0, finished_at: null, created_at: profile.created_at },
        ], [
            { id: 'player-1', game_id: 'bot-game', profile_id: profile.id, nickname: 'Lince', slot: 1, player_type: 'HUMAN' },
            { id: 'bot-1', game_id: 'bot-game', profile_id: null, nickname: 'Bot', slot: 2, player_type: 'BOT' },
            { id: 'player-1-open', game_id: 'open-game', profile_id: profile.id, nickname: 'Lince', slot: 1, player_type: 'HUMAN' },
        ])

        expect(history).toHaveLength(1)
        expect(history[0]).toMatchObject({ mode: 'VS_BOT', opponentNickname: 'Bot', outcome: 'win' })
    })

    it('does not attempt to reward bots, unfinished games, or an already rewarded profile', () => {
        expect(isRewardEligible({ gameStatus: 'CHOOSING', playerType: 'HUMAN', profileId: profile.id, existingReward: null })).toBe(false)
        expect(isRewardEligible({ gameStatus: 'FINISHED', playerType: 'BOT', profileId: null, existingReward: null })).toBe(false)
        expect(isRewardEligible({ gameStatus: 'FINISHED', playerType: 'HUMAN', profileId: profile.id, existingReward })).toBe(false)
        expect(isRewardEligible({ gameStatus: 'FINISHED', playerType: 'HUMAN', profileId: profile.id, existingReward: null })).toBe(true)
    })

    it('keeps game player mapping compatible with old rows that lack nullable profile columns', () => {
        const player = mapPlayerRecord({
            id: 'legacy-player',
            game_id: 'legacy-game',
            nickname: 'Ospite',
            slot: 1,
            player_type: 'HUMAN',
            traits: createInitialTraits(),
            connected: true,
            created_at: profile.created_at,
        })

        expect(player.profile_id).toBeNull()
        expect(player.creature_id).toBeNull()
        expect(player.creature_snapshot).toBeNull()
    })
})
