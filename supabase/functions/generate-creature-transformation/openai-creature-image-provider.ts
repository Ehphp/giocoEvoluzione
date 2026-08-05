import {
    CreatureImageProviderError,
    type CreatureImageGenerationInput,
    type CreatureImageGenerationResult,
    type CreatureImageProvider,
    type CreatureImageProviderErrorCode,
} from '../../../shared/creature-transformations/image-generation.ts'
import type { OpenAiImageQuality } from './lab-policy.ts'

type FetchImplementation = (input: string, init: RequestInit) => Promise<Response>

export type OpenAiCreatureImageProviderOptions = Readonly<{
    apiKey: string
    model: string
    quality: OpenAiImageQuality
    timeoutMs: number
    estimatedCostUsd: number
    fetchImplementation?: FetchImplementation
    now?: () => number
}>

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function providerErrorForResponse(status: number, payload: unknown): CreatureImageProviderErrorCode {
    const error = asRecord(asRecord(payload)?.error)
    if (error?.code === 'moderation_blocked') return 'OPENAI_IMAGE_MODERATION_BLOCKED'
    if (status === 429) return 'OPENAI_IMAGE_RATE_LIMITED'
    if (status === 400) return 'OPENAI_IMAGE_BAD_REQUEST'
    return 'OPENAI_IMAGE_PROVIDER_ERROR'
}

function readSafeProviderErrorCode(payload: unknown): string | null {
    const code = asRecord(asRecord(payload)?.error)?.code
    return typeof code === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(code) ? code : null
}

function readSafeProviderErrorParam(payload: unknown): string | null {
    const param = asRecord(asRecord(payload)?.error)?.param
    return typeof param === 'string' && /^[A-Za-z0-9_.\x5B\x5D-]{1,120}$/.test(param) ? param : null
}

function decodeBase64(value: unknown): Uint8Array {
    if (typeof value !== 'string' || !value.length || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
        throw new CreatureImageProviderError('OPENAI_IMAGE_BASE64_INVALID', 'Il provider non ha restituito un PNG base64 valido.')
    }
    try {
        const binary = atob(value)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
        return bytes
    } catch (error) {
        throw new CreatureImageProviderError('OPENAI_IMAGE_BASE64_INVALID', 'Il provider non ha restituito un PNG base64 valido.', { cause: error })
    }
}

export class OpenAiCreatureImageProvider implements CreatureImageProvider {
    private readonly apiKey: string
    private readonly model: string
    private readonly quality: OpenAiImageQuality
    private readonly timeoutMs: number
    private readonly estimatedCostUsd: number
    private readonly fetchImplementation: FetchImplementation
    private readonly now: () => number

    constructor(options: OpenAiCreatureImageProviderOptions) {
        this.apiKey = options.apiKey
        this.model = options.model
        this.quality = options.quality
        this.timeoutMs = options.timeoutMs
        this.estimatedCostUsd = options.estimatedCostUsd
        this.fetchImplementation = options.fetchImplementation ?? fetch
        this.now = options.now ?? (() => Date.now())
    }

    async transformCreature(input: CreatureImageGenerationInput): Promise<CreatureImageGenerationResult> {
        const form = new FormData()
        form.set('model', this.model)
        form.set('prompt', input.prompt)
        form.set('n', '1')
        form.set('size', `${input.renderSpecification.width}x${input.renderSpecification.height}`)
        form.set('quality', this.quality)
        form.set('output_format', 'png')
        form.set('background', input.backgroundGenerationMode === 'NATIVE_TRANSPARENCY' ? 'transparent' : 'opaque')
        form.set('image[]', new Blob([input.source.bytes], { type: 'image/png' }), 'canonical-creature.png')

        const controller = new AbortController()
        let timedOut = false
        const timeout = setTimeout(() => {
            timedOut = true
            controller.abort()
        }, this.timeoutMs)
        const startedAt = this.now()
        let response: Response
        try {
            response = await this.fetchImplementation('https://api.openai.com/v1/images/edits', {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.apiKey}` },
                body: form,
                signal: controller.signal,
            })
        } catch (error) {
            if (timedOut) throw new CreatureImageProviderError('OPENAI_IMAGE_TIMEOUT', 'Il provider immagini ha superato il tempo massimo consentito.', { cause: error })
            throw new CreatureImageProviderError('OPENAI_IMAGE_PROVIDER_ERROR', 'Il provider immagini non e raggiungibile.', { cause: error })
        } finally {
            clearTimeout(timeout)
        }

        if (!response.ok) {
            let payload: unknown = null
            try {
                payload = await response.json()
            } catch {
                // Error status is sufficient for the stable application mapping.
            }
            const code = providerErrorForResponse(response.status, payload)
            throw new CreatureImageProviderError(code, 'Il provider immagini ha rifiutato la richiesta.', {
                providerErrorCode: readSafeProviderErrorCode(payload),
                providerErrorParam: readSafeProviderErrorParam(payload),
            })
        }
        let payload: unknown
        try {
            payload = await response.json()
        } catch (error) {
            throw new CreatureImageProviderError('OPENAI_IMAGE_RESPONSE_INVALID', 'Il provider immagini ha restituito una risposta non leggibile.', { cause: error })
        }
        const data = asRecord(payload)?.data
        const first = Array.isArray(data) ? asRecord(data[0]) : null
        if (!first) throw new CreatureImageProviderError('OPENAI_IMAGE_RESPONSE_INVALID', 'Il provider immagini non ha restituito un risultato.')

        return {
            image: decodeBase64(first.b64_json),
            mimeType: 'image/png',
            provider: 'openai-image-api',
            model: this.model,
            isMock: false,
            ...(response.headers.get('x-request-id') ? { providerRequestId: response.headers.get('x-request-id')! } : {}),
            latencyMs: Math.max(0, this.now() - startedAt),
            estimatedCostUsd: this.estimatedCostUsd,
            warnings: [],
        }
    }
}
