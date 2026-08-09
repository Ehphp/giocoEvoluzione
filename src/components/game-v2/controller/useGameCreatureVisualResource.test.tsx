import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { GameSnapshot, PlayerRecord } from '../../../lib/game-api'
import { useGameCreatureVisualResource, type GameCreatureVisual } from './useGameCreatureVisualResource'

type Deferred<T> = {
    promise: Promise<T>
    resolve: (value: T) => void
    reject: (error: unknown) => void
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((nextResolve, nextReject) => {
        resolve = nextResolve
        reject = nextReject
    })
    return { promise, resolve, reject }
}

function player(id: string, creatureId: string): PlayerRecord {
    return {
        id,
        game_id: 'game-1',
        nickname: id,
        slot: id === 'host' ? 1 : 2,
        player_type: 'HUMAN',
        traits: {} as PlayerRecord['traits'],
        connected: true,
        profile_id: `${id}-profile`,
        creature_id: creatureId,
        creature_snapshot: null,
        evolution_draft_options: [], chosen_evolution_target_id: null, created_at: '2026-08-08T10:00:00.000Z',
    }
}

function snapshot(gameId: string, players: PlayerRecord[]): GameSnapshot {
    const local = players.find((entry) => entry.id === 'host') ?? null
    return {
        game: { id: gameId, status: 'CHOOSING' },
        players,
        me: local,
        opponent: players.find((entry) => entry.id !== 'host') ?? null,
    } as GameSnapshot
}

function visual(versionId: string, signedUrl: string): GameCreatureVisual {
    return {
        versionId,
        versionNumber: 1,
        signedUrl,
        // A past date avoids renewal timers in this focused resource test.
        expiresAt: '2000-01-01T00:00:00.000Z',
    }
}

type ProbeProps = {
    snapshot: GameSnapshot
    loadVisuals: (input: { gameId: string }) => Promise<{ player: GameCreatureVisual; opponent: GameCreatureVisual | null }>
    preloadImage: (url: string) => Promise<void>
}

function Probe({ snapshot: currentSnapshot, loadVisuals, preloadImage }: ProbeProps) {
    const { resource } = useGameCreatureVisualResource({
        enabled: true,
        snapshot: currentSnapshot,
        loadVisuals,
        preloadImage,
    })
    return createElement('output', {
        'data-status': resource.status,
        'data-player-status': resource.player.status,
        'data-player-url': resource.player.visual?.signedUrl ?? '',
        'data-opponent-status': resource.opponent.status,
        'data-opponent-url': resource.opponent.visual?.signedUrl ?? '',
    })
}

async function settle() {
    await Promise.resolve()
    await Promise.resolve()
}

describe('useGameCreatureVisualResource', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
        container = document.createElement('div')
        document.body.append(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('reloads when realtime adds the remote participant and reaches ready without remount', async () => {
        const first = deferred<{ player: GameCreatureVisual; opponent: GameCreatureVisual | null }>()
        const second = deferred<{ player: GameCreatureVisual; opponent: GameCreatureVisual | null }>()
        const loadVisuals = (input: { gameId: string }) => input.gameId === 'game-1' && calls++ === 0 ? first.promise : second.promise
        let calls = 0
        const preloadImage = async () => undefined
        const host = player('host', 'host-creature')
        const guest = player('guest', 'guest-creature')

        await act(async () => {
            root.render(createElement(Probe, { snapshot: snapshot('game-1', [host]), loadVisuals, preloadImage }))
            await settle()
        })
        expect(calls).toBe(1)

        await act(async () => {
            first.resolve({ player: visual('host-v1', 'https://image.test/host-v1'), opponent: null })
            await settle()
        })
        expect(container.querySelector('output')?.dataset.opponentStatus).toBe('unavailable')

        await act(async () => {
            root.render(createElement(Probe, { snapshot: snapshot('game-1', [host, guest]), loadVisuals, preloadImage }))
            await settle()
        })
        expect(calls).toBe(2)
        expect(container.querySelector('output')?.dataset.opponentStatus).toBe('loading')

        await act(async () => {
            second.resolve({ player: visual('host-v1', 'https://image.test/host-v1'), opponent: visual('guest-v2', 'https://image.test/guest-v2') })
            await settle()
        })
        expect(container.querySelector('output')?.dataset.status).toBe('ready')
        expect(container.querySelector('output')?.dataset.opponentStatus).toBe('ready')
        expect(container.querySelector('output')?.dataset.opponentUrl).toBe('https://image.test/guest-v2')
    })

    it('ignores an old-roster response that resolves after the new-roster response', async () => {
        const first = deferred<{ player: GameCreatureVisual; opponent: GameCreatureVisual | null }>()
        const second = deferred<{ player: GameCreatureVisual; opponent: GameCreatureVisual | null }>()
        let calls = 0
        const loadVisuals = () => calls++ === 0 ? first.promise : second.promise
        const host = player('host', 'host-creature')
        const guest = player('guest', 'guest-creature')

        await act(async () => {
            root.render(createElement(Probe, { snapshot: snapshot('game-1', [host]), loadVisuals, preloadImage: async () => undefined }))
            await settle()
        })
        await act(async () => {
            root.render(createElement(Probe, { snapshot: snapshot('game-1', [host, guest]), loadVisuals, preloadImage: async () => undefined }))
            await settle()
        })
        await act(async () => {
            second.resolve({ player: visual('host-v1', 'https://image.test/host-v1'), opponent: visual('guest-v2', 'https://image.test/guest-v2') })
            await settle()
        })
        await act(async () => {
            first.resolve({ player: visual('host-v1', 'https://image.test/host-v1'), opponent: null })
            await settle()
        })

        expect(container.querySelector('output')?.dataset.opponentUrl).toBe('https://image.test/guest-v2')
        expect(container.querySelector('output')?.dataset.opponentStatus).toBe('ready')
    })

    it('does not allow a response from the previous game to contaminate the next game', async () => {
        const previous = deferred<{ player: GameCreatureVisual; opponent: GameCreatureVisual | null }>()
        const next = deferred<{ player: GameCreatureVisual; opponent: GameCreatureVisual | null }>()
        let calls = 0
        const loadVisuals = () => calls++ === 0 ? previous.promise : next.promise
        const host = player('host', 'host-creature')
        const guest = player('guest', 'guest-creature')

        await act(async () => {
            root.render(createElement(Probe, { snapshot: snapshot('game-1', [host, guest]), loadVisuals, preloadImage: async () => undefined }))
            await settle()
        })
        await act(async () => {
            root.render(createElement(Probe, { snapshot: snapshot('game-2', [host, guest]), loadVisuals, preloadImage: async () => undefined }))
            await settle()
        })
        await act(async () => {
            next.resolve({ player: visual('host-v2', 'https://image.test/host-v2'), opponent: visual('guest-v2', 'https://image.test/guest-v2') })
            await settle()
        })
        await act(async () => {
            previous.resolve({ player: visual('host-v1', 'https://image.test/host-v1'), opponent: visual('guest-v1', 'https://image.test/guest-v1') })
            await settle()
        })

        expect(container.querySelector('output')?.dataset.playerUrl).toBe('https://image.test/host-v2')
        expect(container.querySelector('output')?.dataset.opponentUrl).toBe('https://image.test/guest-v2')
    })

    it('preserves the successfully preloaded side when the other preload fails', async () => {
        const loadVisuals = async () => ({
            player: visual('host-v1', 'https://image.test/host-v1'),
            opponent: visual('guest-v2', 'https://image.test/guest-v2'),
        })
        const preloadImage = async (url: string) => {
            if (url.includes('guest')) throw new Error('network image failure')
        }
        const host = player('host', 'host-creature')
        const guest = player('guest', 'guest-creature')

        await act(async () => {
            root.render(createElement(Probe, { snapshot: snapshot('game-1', [host, guest]), loadVisuals, preloadImage }))
            await settle()
        })

        expect(container.querySelector('output')?.dataset.status).toBe('error')
        expect(container.querySelector('output')?.dataset.playerStatus).toBe('ready')
        expect(container.querySelector('output')?.dataset.playerUrl).toBe('https://image.test/host-v1')
        expect(container.querySelector('output')?.dataset.opponentStatus).toBe('error')
        expect(container.querySelector('output')?.dataset.opponentUrl).toBe('')
    })
})
