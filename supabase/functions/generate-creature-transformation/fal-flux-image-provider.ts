export const FAL_FLUX_MODEL = 'fal-ai/flux-2-klein/9b/edit'
export const FAL_FLUX_IMAGE_SIZE = Object.freeze({ width: 768, height: 1152 })
export const FAL_SEEDREAM_MODEL = 'fal-ai/bytedance/seedream/v4.5/edit'
export const FAL_SEEDREAM_IMAGE_SIZE = Object.freeze({ width: 1920, height: 2880 })
export const DEFAULT_FAL_FLUX_MODEL = FAL_SEEDREAM_MODEL

export function falImageModelProfile(model: string): Readonly<{ imageSize: { width: number, height: number }, maxImageBytes: number, seedream: boolean }> {
    return model === FAL_SEEDREAM_MODEL
        ? Object.freeze({ imageSize: FAL_SEEDREAM_IMAGE_SIZE, maxImageBytes: 30 * 1024 * 1024, seedream: true })
        : Object.freeze({ imageSize: FAL_FLUX_IMAGE_SIZE, maxImageBytes: 10 * 1024 * 1024, seedream: false })
}

type FetchLike = typeof fetch

export type FalFluxImageProviderErrorCode = 'FAL_FLUX_NOT_CONFIGURED' | 'FAL_FLUX_TIMEOUT' | 'FAL_FLUX_RATE_LIMITED' | 'FAL_FLUX_BAD_REQUEST' | 'FAL_FLUX_PROVIDER_ERROR' | 'FAL_FLUX_RESPONSE_INVALID'

export class FalFluxImageProviderError extends Error {
    constructor(readonly code: FalFluxImageProviderErrorCode, message: string, options?: { cause?: unknown, providerStatus?: number, providerErrorCode?: string | null }) {
        super(message, options)
        this.name = 'FalFluxImageProviderError'
        this.providerStatus = options?.providerStatus ?? null
        this.providerErrorCode = options?.providerErrorCode ?? null
    }
    readonly providerStatus: number | null
    readonly providerErrorCode: string | null
}

export type FalFluxImageProviderOptions = Readonly<{
    apiKey: string
    model?: string
    timeoutMs?: number
    estimatedCostUsd?: number
    fetchImplementation?: FetchLike
    now?: () => number
}>

export type FalFluxGenerationResult = Readonly<{
    image: Uint8Array
    provider: 'fal.ai'
    model: string
    providerRequestId?: string
    seed?: number
    latencyMs: number
    estimatedCostUsd?: number
}>

function bytesToDataUrl(bytes: Uint8Array): string {
    let binary = ''
    const chunk = 0x8000
    for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
    return `data:image/png;base64,${btoa(binary)}`
}

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function providerErrorCode(payload: unknown): string | null {
    const code = record(record(payload)?.detail)?.code ?? record(record(payload)?.error)?.code
    return typeof code === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(code) ? code : null
}

function outputUrl(payload: unknown): string | null {
    const root = record(payload)
    const image = Array.isArray(root?.images) ? record(root?.images[0]) : null
    const url = image?.url
    return typeof url === 'string' && /^https:\/\//.test(url) ? url : null
}

export class FalFluxImageProvider {
    private readonly fetchImplementation: FetchLike
    private readonly timeoutMs: number
    private readonly model: string
    private readonly now: () => number

    constructor(private readonly options: FalFluxImageProviderOptions) {
        if (!options.apiKey.trim()) throw new FalFluxImageProviderError('FAL_FLUX_NOT_CONFIGURED', 'La chiave fal.ai non e configurata.')
        this.fetchImplementation = options.fetchImplementation ?? fetch
        this.timeoutMs = options.timeoutMs ?? 30_000
        this.model = options.model?.trim() || DEFAULT_FAL_FLUX_MODEL
        this.now = options.now ?? (() => Date.now())
    }

    async transform(input: { prompt: string, sourcePng: Uint8Array, seed?: number }): Promise<FalFluxGenerationResult> {
        const startedAt = this.now()
        const profile = falImageModelProfile(this.model)
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
        try {
            let response: Response
            try {
                response = await this.fetchImplementation(`https://fal.run/${this.model}`, {
                    method: 'POST',
                    headers: { Authorization: `Key ${this.options.apiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(profile.seedream
                        ? {
                            prompt: input.prompt, image_urls: [bytesToDataUrl(input.sourcePng)], image_size: profile.imageSize,
                            num_images: 1, max_images: 1, enable_safety_checker: true,
                            ...(input.seed === undefined ? {} : { seed: input.seed }),
                        }
                        : {
                            prompt: input.prompt, image_urls: [bytesToDataUrl(input.sourcePng)], image_size: profile.imageSize,
                            output_format: 'png', num_images: 1, num_inference_steps: 4,
                            ...(input.seed === undefined ? {} : { seed: input.seed }),
                        }),
                    signal: controller.signal,
                })
            } catch (error) {
                if (controller.signal.aborted) throw new FalFluxImageProviderError('FAL_FLUX_TIMEOUT', 'fal.ai ha superato il tempo massimo.', { cause: error })
                throw new FalFluxImageProviderError('FAL_FLUX_PROVIDER_ERROR', 'fal.ai non e raggiungibile.', { cause: error })
            }
            let payload: unknown = null
            try { payload = await response.clone().json() } catch { /* response diagnostics are optional */ }
            if (!response.ok) {
                const code = response.status === 429 ? 'FAL_FLUX_RATE_LIMITED' : response.status === 400 ? 'FAL_FLUX_BAD_REQUEST' : 'FAL_FLUX_PROVIDER_ERROR'
                throw new FalFluxImageProviderError(code, 'fal.ai ha rifiutato la generazione.', { providerStatus: response.status, providerErrorCode: providerErrorCode(payload) })
            }
            const url = outputUrl(payload)
            if (!url) throw new FalFluxImageProviderError('FAL_FLUX_RESPONSE_INVALID', 'fal.ai non ha restituito un URL immagine valido.')
            let imageResponse: Response
            try {
                imageResponse = await this.fetchImplementation(url, { signal: controller.signal })
            } catch (error) {
                if (controller.signal.aborted) throw new FalFluxImageProviderError('FAL_FLUX_TIMEOUT', 'fal.ai ha superato il tempo massimo.', { cause: error })
                throw new FalFluxImageProviderError('FAL_FLUX_PROVIDER_ERROR', 'Il PNG FLUX non e raggiungibile.', { cause: error })
            }
            if (!imageResponse.ok) throw new FalFluxImageProviderError('FAL_FLUX_RESPONSE_INVALID', 'fal.ai non ha reso disponibile il PNG generato.', { providerStatus: imageResponse.status })
            const image = new Uint8Array(await imageResponse.arrayBuffer())
            const root = record(payload)
            const requestId = typeof root?.request_id === 'string' ? root.request_id : response.headers.get('x-fal-request-id') ?? undefined
            const seed = typeof root?.seed === 'number' && Number.isInteger(root.seed) ? root.seed : undefined
            return Object.freeze({ image, provider: 'fal.ai', model: this.model, ...(requestId ? { providerRequestId: requestId } : {}), ...(seed === undefined ? {} : { seed }), latencyMs: Math.max(0, this.now() - startedAt), ...(this.options.estimatedCostUsd === undefined ? {} : { estimatedCostUsd: this.options.estimatedCostUsd }) })
        } finally {
            clearTimeout(timeout)
        }
    }
}
