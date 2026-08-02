import type { CreatureRenderSpecification } from './render-specifications.ts'

export type CreatureImageGenerationInput = {
    requestId: string
    idempotencyKey: string
    prompt: string
    source: {
        bytes: Uint8Array
        mimeType: 'image/png'
        width: number
        height: number
        sha256: string
    }
    renderSpecification: CreatureRenderSpecification
}

export type CreatureImageGenerationResult = {
    image: Uint8Array
    mimeType: 'image/png'
    provider: string
    model: string
    isMock: boolean
    providerRequestId?: string
    latencyMs: number
    estimatedCostUsd?: number
    warnings: string[]
}

export interface CreatureImageProvider {
    transformCreature(input: CreatureImageGenerationInput): Promise<CreatureImageGenerationResult>
}

export type CreatureImageProviderErrorCode =
    | 'MOCK_PROVIDER_FAILED'
    | 'IMAGE_PROVIDER_TIMEOUT'
    | 'OPENAI_IMAGE_TIMEOUT'
    | 'OPENAI_IMAGE_RATE_LIMITED'
    | 'OPENAI_IMAGE_MODERATION_BLOCKED'
    | 'OPENAI_IMAGE_BAD_REQUEST'
    | 'OPENAI_IMAGE_PROVIDER_ERROR'
    | 'OPENAI_IMAGE_RESPONSE_INVALID'
    | 'OPENAI_IMAGE_BASE64_INVALID'

export class CreatureImageProviderError extends Error {
    readonly code: CreatureImageProviderErrorCode

    constructor(code: CreatureImageProviderErrorCode, message: string, options?: { cause?: unknown }) {
        super(message, options)
        this.name = 'CreatureImageProviderError'
        this.code = code
    }
}
