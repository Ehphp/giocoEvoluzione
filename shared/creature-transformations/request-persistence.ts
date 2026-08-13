export type TransformationCost = {
    estimatedCostUsd?: number
    actualCostUsd?: number
}

export type TransformationRequestStatus = 'RESERVED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
export type TransformationRequestIdempotencyStatus = 'CREATED' | 'EXISTING'

export type TransformationRequestPersistence = TransformationCost & {
    transformationRequestId: string
    idempotencyStatus: TransformationRequestIdempotencyStatus
    status: TransformationRequestStatus
}

export type TransformationRequestStatusPersistence = TransformationCost & {
    transformationRequestId: string
    status: TransformationRequestStatus
    createdAt: string
    startedAt?: string
    completedAt?: string
}
