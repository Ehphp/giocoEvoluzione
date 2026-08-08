import type { GameSnapshot } from './game-api'

export type GameSnapshotSyncMetrics = {
    snapshotRequests: number
    maxConcurrentSnapshots: number
    realtimeInvalidations: number
    invalidationsThatStartedFetch: number
}

type GameSnapshotSyncOptions = {
    fetchSnapshot: () => Promise<GameSnapshot>
    onSnapshot: (snapshot: GameSnapshot) => void
    onError?: (error: unknown) => void
    onMetrics?: (metrics: Readonly<GameSnapshotSyncMetrics>) => void
}

/**
 * Serializes canonical game reads. Realtime carries only a monotonic revision;
 * a completed read is accepted only when it is at least as fresh as the last
 * applied state. A burst therefore yields one read and, only when necessary,
 * one follow-up.
 */
export class GameSnapshotSync {
    private readonly fetchSnapshot: () => Promise<GameSnapshot>
    private readonly onSnapshot: (snapshot: GameSnapshot) => void
    private readonly onError?: (error: unknown) => void
    private readonly onMetrics?: (metrics: Readonly<GameSnapshotSyncMetrics>) => void
    private disposed = false
    private inFlight = false
    private scheduled = false
    private forceReconcile = false
    private concurrentSnapshots = 0
    private appliedRevision = -1
    private requiredRevision = -1
    private readonly metrics: GameSnapshotSyncMetrics = {
        snapshotRequests: 0,
        maxConcurrentSnapshots: 0,
        realtimeInvalidations: 0,
        invalidationsThatStartedFetch: 0,
    }

    constructor(options: GameSnapshotSyncOptions) {
        this.fetchSnapshot = options.fetchSnapshot
        this.onSnapshot = options.onSnapshot
        this.onError = options.onError
        this.onMetrics = options.onMetrics
    }

    seed(snapshot: GameSnapshot) {
        if (this.disposed) return
        this.appliedRevision = snapshot.stateRevision
        this.requiredRevision = Math.max(this.requiredRevision, snapshot.stateRevision)
    }

    invalidate(stateRevision: number | null | undefined, source: 'realtime' | 'mutation' = 'realtime') {
        if (this.disposed) return
        if (source === 'realtime') this.metrics.realtimeInvalidations += 1

        if (typeof stateRevision === 'number' && Number.isFinite(stateRevision)) {
            this.requiredRevision = Math.max(this.requiredRevision, stateRevision)
            // Realtime is an invalidation stream. A repeated/non-incremented
            // revision is unusual but must not hide a committed join or state
            // transition when a deployment has stale database trigger logic.
            if (source === 'realtime' && stateRevision <= this.appliedRevision) {
                this.forceReconcile = true
            }
        } else {
            // Reconnect/bootstrap has no trusted revision and must still close its gap.
            this.forceReconcile = true
        }
        this.request()
    }

    reconcile() {
        if (this.disposed) return
        this.forceReconcile = true
        this.request()
    }

    getMetrics(): Readonly<GameSnapshotSyncMetrics> {
        return { ...this.metrics }
    }

    dispose() {
        this.disposed = true
    }

    private request() {
        if (this.inFlight || this.scheduled) return
        this.scheduled = true
        queueMicrotask(() => {
            this.scheduled = false
            void this.run()
        })
    }

    private async run() {
        if (this.disposed || this.inFlight) return
        if (!this.forceReconcile && this.requiredRevision <= this.appliedRevision) return

        this.inFlight = true
        this.concurrentSnapshots += 1
        this.metrics.snapshotRequests += 1
        this.metrics.invalidationsThatStartedFetch += 1
        this.metrics.maxConcurrentSnapshots = Math.max(this.metrics.maxConcurrentSnapshots, this.concurrentSnapshots)
        this.publishMetrics()

        // A read satisfies a pre-existing forced reconcile; a reconnect arriving
        // during it sets the flag again and requests at most one follow-up.
        this.forceReconcile = false
        try {
            const snapshot = await this.fetchSnapshot()
            if (this.disposed) return

            if (snapshot.stateRevision >= this.appliedRevision) {
                this.appliedRevision = snapshot.stateRevision
                this.onSnapshot(snapshot)
            }
        } catch (error) {
            if (!this.disposed) this.onError?.(error)
        } finally {
            this.inFlight = false
            this.concurrentSnapshots -= 1
            this.publishMetrics()
        }

        if (!this.disposed && (this.forceReconcile || this.requiredRevision > this.appliedRevision)) {
            this.request()
        }
    }

    private publishMetrics() {
        this.onMetrics?.(this.getMetrics())
    }
}
