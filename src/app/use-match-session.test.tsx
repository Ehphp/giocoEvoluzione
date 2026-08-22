import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlayerCreatureRecord, ProfileRecord } from '../lib/profile-api'
import { useMatchSession } from './use-match-session'

/**
 * Covers the extraction of the match session out of App.tsx: the actions have to keep reaching
 * game-api with the same payloads, and a failure has to surface as a message instead of throwing.
 * The realtime sync itself is exercised by game-snapshot-sync's own tests.
 */

const created = { game: { id: 'game-1', room_code: 'ABCDE', game_mode: 'PVP', bot_difficulty: 'NORMAL' }, me: { id: 'player-1' } }

const createGame = vi.fn(async (_input: Record<string, unknown>) => created)
const createVsBotGame = vi.fn(async (_input: Record<string, unknown>) => created)
const joinGame = vi.fn(async (_input: Record<string, unknown>) => created)
const submitRoundAction = vi.fn(async (_input: Record<string, unknown>) => ({ stateRevision: 3, resolveRequired: false }))
const saveStoredSession = vi.fn((_session: Record<string, unknown>) => undefined)
const clearStoredSession = vi.fn()

vi.mock('../lib/game-api', () => ({
    createGame: (...args: unknown[]) => createGame(...(args as [Record<string, unknown>])),
    createVsBotGame: (...args: unknown[]) => createVsBotGame(...(args as [Record<string, unknown>])),
    joinGame: (...args: unknown[]) => joinGame(...(args as [Record<string, unknown>])),
    submitRoundAction: (...args: unknown[]) => submitRoundAction(...(args as [Record<string, unknown>])),
    acknowledgeReveal: vi.fn(),
    advanceToNextRound: vi.fn(),
    chooseEvolutionDraftTarget: vi.fn(),
    fetchGameSnapshot: vi.fn(),
    isGameSnapshotPlayable: () => true,
    maybeResolveRound: vi.fn(),
    restoreGameSession: vi.fn(),
    subscribeToGame: vi.fn(async () => () => undefined),
}))

vi.mock('../lib/storage', () => ({
    clearStoredSession: () => clearStoredSession(),
    createPlayerId: () => 'player-local',
    loadStoredSession: () => null,
    saveStoredSession: (...args: unknown[]) => saveStoredSession(...(args as [Record<string, unknown>])),
}))

vi.mock('../lib/supabase', () => ({ hasSupabaseConfig: true }))

const PROFILE = { id: 'profile-1', nickname: 'Naturalista' } as ProfileRecord
const CREATURE = {
    id: 'creature-1',
    lineage_id: 'lineage-1',
    base_creature_key: 'VERDANT_HATCHLING',
    name: 'Verdello',
    level: 4,
} as PlayerCreatureRecord

let container: HTMLDivElement
let root: Root
let api: ReturnType<typeof useMatchSession>

function Probe({ profile, creature }: { profile: ProfileRecord | null; creature: PlayerCreatureRecord | null }) {
    api = useMatchSession({ profile, activeCreature: creature, authStatus: 'ready', profileNickname: 'Naturalista' })
    return null
}

function render(profile: ProfileRecord | null = PROFILE, creature: PlayerCreatureRecord | null = CREATURE) {
    act(() => {
        root.render(createElement(Probe, { profile, creature }))
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
})

afterEach(() => {
    act(() => root.unmount())
    container.remove()
})

describe('useMatchSession', () => {
    it('seeds the nickname from the profile and starts idle', () => {
        render()

        expect(api.nickname).toBe('Naturalista')
        expect(api.snapshot).toBeNull()
        expect(api.isBusy).toBe(false)
        expect(api.errorMessage).toBeNull()
    })

    it('creates a PvP game, stores the session and keeps the snapshot', async () => {
        render()
        await act(async () => {
            await api.createPvpGame()
        })

        expect(createGame).toHaveBeenCalledTimes(1)
        expect(createGame.mock.calls[0]![0]).toMatchObject({
            nickname: 'Naturalista',
            profileId: 'profile-1',
            creatureId: 'creature-1',
            creatureSnapshot: { baseCreatureKey: 'VERDANT_HATCHLING', level: 4 },
        })
        expect(saveStoredSession).toHaveBeenCalledWith({
            playerId: 'player-1',
            gameId: 'game-1',
            roomCode: 'ABCDE',
            profileId: 'profile-1',
        })
        expect(api.snapshot).toEqual(created)
        expect(api.isBusy).toBe(false)
    })

    it('passes the selected difficulty to a bot game', async () => {
        render()
        act(() => api.setBotDifficulty('HARD'))
        await act(async () => {
            await api.createBotGame()
        })

        expect(createVsBotGame.mock.calls[0]![0]).toMatchObject({ difficulty: 'HARD' })
        expect(createGame).not.toHaveBeenCalled()
    })

    it('refuses to join without a room code, and joins once one is entered', async () => {
        render()
        await act(async () => {
            await api.joinRoom()
        })

        expect(joinGame).not.toHaveBeenCalled()
        expect(api.errorMessage).toBe('Inserisci il codice stanza.')

        act(() => api.setRoomCode('ABCDE'))
        await act(async () => {
            await api.joinRoom()
        })

        expect(joinGame.mock.calls[0]![0]).toMatchObject({ roomCode: 'ABCDE', profileId: 'profile-1' })
    })

    it('reports a failed creation as a message instead of throwing', async () => {
        createGame.mockRejectedValueOnce(new Error('Stanza non disponibile.'))
        render()

        await act(async () => {
            await api.createPvpGame()
        })

        expect(api.errorMessage).toBe('Stanza non disponibile.')
        expect(api.snapshot).toBeNull()
        expect(api.isBusy).toBe(false)
    })

    it('refuses to play without a profile or creature', async () => {
        render(null, null)
        await act(async () => {
            await api.createPvpGame()
        })

        expect(createGame).not.toHaveBeenCalled()
        expect(api.errorMessage).toContain('Accedi')
    })

    it('submits a round action against the current game and round', async () => {
        render()
        await act(async () => {
            await api.createPvpGame()
        })
        await act(async () => {
            expect(await api.submitAction({ trait: 'FEROCITY', actionType: 'USE' })).toBe(true)
        })

        expect(submitRoundAction.mock.calls[0]![0]).toMatchObject({
            gameId: 'game-1',
            trait: 'FEROCITY',
            actionType: 'USE',
        })
        expect(api.statusMessage).toContain('Scelta confermata')
    })

    it('forwards a symbiosis activation with the mutation id the caller chose', async () => {
        render()
        await act(async () => {
            await api.createPvpGame()
        })
        await act(async () => {
            await api.submitAction({
                actionType: 'ACTIVATE_MUTATION',
                mutationId: 'SYMBIOSIS',
                sourceTrait: 'ARMOR',
                targetTrait: 'SENSES',
            })
        })

        expect(submitRoundAction.mock.calls[0]![0]).toMatchObject({
            actionType: 'ACTIVATE_MUTATION',
            sourceTrait: 'ARMOR',
            targetTrait: 'SENSES',
            mutationId: 'SYMBIOSIS',
        })
    })

    // FINE_DEL_MONDO carries no trait pair: the hook must not force SYMBIOSIS onto it, which is
    // what it used to do when the mutation id was hard-coded here.
    it('forwards a FINE_DEL_MONDO activation without inventing a trait pair', async () => {
        render()
        await act(async () => {
            await api.createPvpGame()
        })
        await act(async () => {
            await api.submitAction({ actionType: 'ACTIVATE_MUTATION', mutationId: 'FINE_DEL_MONDO' })
        })

        const payload = submitRoundAction.mock.calls[0]![0]
        expect(payload).toMatchObject({ actionType: 'ACTIVATE_MUTATION', mutationId: 'FINE_DEL_MONDO' })
        expect(payload).not.toHaveProperty('sourceTrait')
        expect(payload).not.toHaveProperty('targetTrait')
    })

    it('does not submit without a participant', async () => {
        render()
        await act(async () => {
            expect(await api.submitAction({ trait: 'FEROCITY', actionType: 'USE' })).toBe(false)
        })

        expect(submitRoundAction).not.toHaveBeenCalled()
    })

    it('clears the stored session when leaving, and on reset', async () => {
        render()
        await act(async () => {
            await api.createPvpGame()
        })

        act(() => api.leaveSession())
        expect(clearStoredSession).toHaveBeenCalled()
        expect(api.snapshot).toBeNull()
        expect(api.roomCode).toBe('')

        clearStoredSession.mockClear()
        act(() => api.reset())
        expect(clearStoredSession).toHaveBeenCalled()
        expect(api.errorMessage).toBeNull()
    })
})
