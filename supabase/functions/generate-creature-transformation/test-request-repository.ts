import type {
    CreatureTransformationRequestRecord,
    CreatureTransformationRequestRepository,
    RequestReservationResult,
    RequestTransitionData,
    ReserveCreatureTransformationRequestInput,
} from './creature-transformation-request-repository.ts'

type RepositoryOptions = {
    reserveOverride?: (input: ReserveCreatureTransformationRequestInput) => RequestReservationResult | null
    now?: () => string
}

function recordFor(input: ReserveCreatureTransformationRequestInput, id: string, now: string): CreatureTransformationRequestRecord {
    return {
        id, profileId: input.profileId, creatureId: input.creatureId, idempotencyKey: input.idempotencyKey, operation: input.operation, status: 'RESERVED',
        conceptMode: input.conceptMode ?? null, imageProviderMode: input.imageProviderMode ?? null, provider: null, model: null, providerRequestId: null,
        visualTraitId: input.visualTraitId ?? null, intensity: input.intensity ?? null, promptTemplateVersion: null, conceptSchemaVersion: null,
        sourceSha256: null, resultSha256: null, resultPath: null, resultMimeType: null, resultWidth: null, resultHeight: null,
        rawResultSha256: null, rawResultPath: null, rawResultMimeType: null, rawResultWidth: null, rawResultHeight: null, generationLatencyMs: null,
        estimatedCostUsd: input.estimatedCostUsd ?? null, actualCostUsd: null, assetReadiness: null, validationWarnings: [], attemptCount: 0, errorCode: null, errorMessage: null,
        createdAt: now, startedAt: null, completedAt: null, updatedAt: now,
    }
}

function applyTransition(record: CreatureTransformationRequestRecord, status: 'RUNNING' | 'SUCCEEDED' | 'FAILED', data: RequestTransitionData, now: string): CreatureTransformationRequestRecord {
    return {
        ...record,
        status,
        provider: data.provider ?? record.provider, model: data.model ?? record.model, providerRequestId: data.providerRequestId ?? record.providerRequestId,
        promptTemplateVersion: data.promptTemplateVersion ?? record.promptTemplateVersion, conceptSchemaVersion: data.conceptSchemaVersion ?? record.conceptSchemaVersion,
        sourceSha256: data.sourceSha256 ?? record.sourceSha256, resultSha256: data.resultSha256 ?? record.resultSha256, resultPath: data.resultPath ?? record.resultPath,
        resultMimeType: data.resultMimeType ?? record.resultMimeType, resultWidth: data.resultWidth ?? record.resultWidth, resultHeight: data.resultHeight ?? record.resultHeight,
        generationLatencyMs: data.generationLatencyMs ?? record.generationLatencyMs, estimatedCostUsd: data.estimatedCostUsd ?? record.estimatedCostUsd,
        actualCostUsd: data.actualCostUsd ?? record.actualCostUsd, assetReadiness: data.assetReadiness ?? record.assetReadiness, validationWarnings: data.validationWarnings ?? record.validationWarnings, attemptCount: status === 'RUNNING' ? record.attemptCount + 1 : record.attemptCount,
        startedAt: status === 'RUNNING' ? now : record.startedAt, completedAt: status === 'SUCCEEDED' || status === 'FAILED' ? now : record.completedAt,
        errorCode: status === 'FAILED' ? data.errorCode ?? 'FAILED' : null, errorMessage: status === 'FAILED' ? data.errorMessage ?? 'failed' : null, updatedAt: now,
    }
}

export function createInMemoryRequestRepository(options: RepositoryOptions = {}) {
    const records = new Map<string, CreatureTransformationRequestRecord>()
    const calls = { reserve: 0, markRunning: 0, markSucceeded: 0, markFailed: 0 }
    let sequence = 0
    const key = (profileId: string, idempotencyKey: string) => `${profileId}:${idempotencyKey}`
    const now = options.now ?? (() => new Date().toISOString())

    const repository: CreatureTransformationRequestRepository = {
        async reserve(input) {
            calls.reserve += 1
            const overridden = options.reserveOverride?.(input)
            if (overridden) return overridden
            const existing = records.get(key(input.profileId, input.idempotencyKey))
            if (existing) return { outcome: 'EXISTING', record: existing }
            const record = recordFor(input, `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`, now())
            records.set(key(input.profileId, input.idempotencyKey), record)
            return { outcome: 'CREATED', record }
        },
        async markRunning(input) {
            calls.markRunning += 1
            const record = records.get([...records.entries()].find(([, value]) => value.id === input.requestId && value.profileId === input.profileId)?.[0] ?? '')
            if (!record || record.status !== 'RESERVED') throw new Error('state conflict')
            const updated = applyTransition(record, 'RUNNING', {}, now())
            records.set(key(updated.profileId, updated.idempotencyKey), updated)
            return updated
        },
        async markSucceeded(input) {
            calls.markSucceeded += 1
            const record = records.get([...records.entries()].find(([, value]) => value.id === input.requestId && value.profileId === input.profileId)?.[0] ?? '')
            if (!record || record.status !== 'RUNNING') throw new Error('state conflict')
            const updated = applyTransition(record, 'SUCCEEDED', input.data, now())
            records.set(key(updated.profileId, updated.idempotencyKey), updated)
            return updated
        },
        async markFailed(input) {
            calls.markFailed += 1
            const record = records.get([...records.entries()].find(([, value]) => value.id === input.requestId && value.profileId === input.profileId)?.[0] ?? '')
            if (!record || (record.status !== 'RESERVED' && record.status !== 'RUNNING')) throw new Error('state conflict')
            const updated = applyTransition(record, 'FAILED', { errorCode: input.errorCode, errorMessage: input.errorMessage }, now())
            records.set(key(updated.profileId, updated.idempotencyKey), updated)
            return updated
        },
        async finalizeBackgroundRemovalCandidate(input) {
            const record = records.get([...records.entries()].find(([, value]) => value.id === input.requestId && value.profileId === input.profileId)?.[0] ?? '')
            if (!record || record.status !== 'SUCCEEDED' || record.assetReadiness !== 'EXPERIMENT_ONLY') throw new Error('state conflict')
            const updated: CreatureTransformationRequestRecord = {
                ...record,
                rawResultSha256: record.resultSha256, rawResultPath: record.resultPath, rawResultMimeType: record.resultMimeType,
                rawResultWidth: record.resultWidth, rawResultHeight: record.resultHeight,
                resultSha256: input.candidateSha256, resultPath: input.candidatePath, resultMimeType: input.candidateMimeType,
                resultWidth: input.candidateWidth, resultHeight: input.candidateHeight, assetReadiness: 'FINAL_ASSET', validationWarnings: input.validationWarnings,
            }
            records.set(key(updated.profileId, updated.idempotencyKey), updated)
            return updated
        },
        async getByIdempotencyKey(input) {
            return records.get(key(input.profileId, input.idempotencyKey)) ?? null
        },
        async getById(input) {
            return [...records.values()].find((record) => record.id === input.requestId && record.profileId === input.profileId) ?? null
        },
    }

    return {
        repository,
        calls,
        get(profileId: string, idempotencyKey: string) { return records.get(key(profileId, idempotencyKey)) ?? null },
        put(record: CreatureTransformationRequestRecord) { records.set(key(record.profileId, record.idempotencyKey), record) },
    }
}
