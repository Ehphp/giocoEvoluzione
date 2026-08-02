import {
    CreatureImageProviderError,
    type CreatureImageGenerationInput,
    type CreatureImageGenerationResult,
    type CreatureImageProvider,
} from './image-generation.ts'

export type MockCreatureImageProviderOptions = Readonly<{
    delayMs?: number
    behavior?: 'SUCCESS' | 'FAILURE' | 'TIMEOUT' | 'EMPTY_OUTPUT' | 'INVALID_PNG_OUTPUT'
    now?: () => number
    sleep?: (delayMs: number) => Promise<void>
}>

function defaultSleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayMs))
}

export class MockCreatureImageProvider implements CreatureImageProvider {
    private readonly options: MockCreatureImageProviderOptions

    constructor(options: MockCreatureImageProviderOptions = {}) {
        this.options = options
    }

    async transformCreature(input: CreatureImageGenerationInput): Promise<CreatureImageGenerationResult> {
        const now = this.options.now ?? (() => Date.now())
        const startedAt = now()
        const delayMs = Math.max(0, this.options.delayMs ?? 0)
        if (delayMs) await (this.options.sleep ?? defaultSleep)(delayMs)

        if (this.options.behavior === 'FAILURE') {
            throw new CreatureImageProviderError('MOCK_PROVIDER_FAILED', 'Il provider immagini mock ha simulato un errore controllato.')
        }
        if (this.options.behavior === 'TIMEOUT') {
            throw new CreatureImageProviderError('IMAGE_PROVIDER_TIMEOUT', 'Il provider immagini mock ha simulato un timeout.')
        }

        const image = this.options.behavior === 'EMPTY_OUTPUT'
            ? new Uint8Array()
            : this.options.behavior === 'INVALID_PNG_OUTPUT'
                ? new Uint8Array([0, 1, 2, 3])
                : input.source.bytes.slice()

        return {
            image,
            mimeType: 'image/png',
            provider: 'mock-creature-image-provider',
            model: 'source-byte-copy-v1',
            isMock: true,
            latencyMs: Math.max(0, now() - startedAt),
            estimatedCostUsd: 0,
            warnings: ['MOCK_PROVIDER_NO_VISUAL_TRANSFORMATION'],
        }
    }
}
