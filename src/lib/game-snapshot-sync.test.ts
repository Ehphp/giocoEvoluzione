import { describe, expect, it } from 'vitest'

import type { GameSnapshot } from './game-api'
import { GameSnapshotSync } from './game-snapshot-sync'

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject })
    return { promise, resolve, reject }
}

function snapshot(stateRevision: number) {
    return { stateRevision } as GameSnapshot
}

async function flush() {
    await Promise.resolve()
    await Promise.resolve()
}

describe('GameSnapshotSync', () => {
    it('collapses ten invalidations during one request into one follow-up', async () => {
        const first = deferred<GameSnapshot>()
        const second = deferred<GameSnapshot>()
        const fetches = [first, second]
        const applied: number[] = []
        const sync = new GameSnapshotSync({
            fetchSnapshot: () => fetches.shift()!.promise,
            onSnapshot: (next) => applied.push(next.stateRevision),
        })

        sync.invalidate(1)
        await flush()
        for (let revision = 2; revision <= 11; revision += 1) sync.invalidate(revision)
        expect(sync.getMetrics().snapshotRequests).toBe(1)

        first.resolve(snapshot(1))
        await flush()
        expect(sync.getMetrics().snapshotRequests).toBe(2)
        second.resolve(snapshot(11))
        await flush()

        expect(sync.getMetrics().maxConcurrentSnapshots).toBe(1)
        expect(sync.getMetrics().snapshotRequests).toBe(2)
        expect(applied).toEqual([1, 11])
    })

    it('never applies a snapshot older than the state already applied', async () => {
        const first = deferred<GameSnapshot>()
        const second = deferred<GameSnapshot>()
        const applied: number[] = []
        const sync = new GameSnapshotSync({
            fetchSnapshot: () => (applied.length === 0 ? first.promise : second.promise),
            onSnapshot: (next) => applied.push(next.stateRevision),
        })

        sync.invalidate(5)
        await flush()
        first.resolve(snapshot(5))
        await flush()
        sync.reconcile()
        await flush()
        second.resolve(snapshot(4))
        await flush()

        expect(applied).toEqual([5])
    })

    it('forces a bootstrap/reconnect reconciliation without a revision', async () => {
        const request = deferred<GameSnapshot>()
        const sync = new GameSnapshotSync({ fetchSnapshot: () => request.promise, onSnapshot: () => undefined })

        sync.reconcile()
        await flush()
        expect(sync.getMetrics().snapshotRequests).toBe(1)
        request.resolve(snapshot(0))
        await flush()
        expect(sync.getMetrics().realtimeInvalidations).toBe(0)
    })
})
