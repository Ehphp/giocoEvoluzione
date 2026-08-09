import type { CreatureRenderSpecification } from './render-specifications.ts'

export type BackgroundGenerationMode = 'SOLID_FOR_POST_PROCESSING' | 'NATIVE_TRANSPARENCY'

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
    backgroundGenerationMode: BackgroundGenerationMode
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
    readonly providerErrorCode: string | null
    readonly providerErrorParam: string | null
    readonly providerStatus: number | null
    readonly transportErrorName: string | null

    constructor(code: CreatureImageProviderErrorCode, message: string, options?: { cause?: unknown, providerErrorCode?: string | null, providerErrorParam?: string | null, providerStatus?: number | null, transportErrorName?: string | null }) {
        super(message, options)
        this.name = 'CreatureImageProviderError'
        this.code = code
        this.providerErrorCode = options?.providerErrorCode ?? null
        this.providerErrorParam = options?.providerErrorParam ?? null
        this.providerStatus = options?.providerStatus ?? null
        this.transportErrorName = options?.transportErrorName ?? null
    }
}
