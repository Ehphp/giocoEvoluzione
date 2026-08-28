export const FAL_SEEDREAM_MODEL = 'fal-ai/bytedance/seedream/v4.5/edit'
export const FAL_SEEDREAM_IMAGE_SIZE = Object.freeze({ width: 1920, height: 2880 })

/** Byte and pixel envelope the validators enforce on whatever Seedream returns. */
export function falImageModelProfile(): Readonly<{
    imageSize: { width: number; height: number }
    maxImageBytes: number
    maxDecodedPixels: number
}> {
    return Object.freeze({
        imageSize: FAL_SEEDREAM_IMAGE_SIZE,
        maxImageBytes: 30 * 1024 * 1024,
        maxDecodedPixels: 32_000_000,
    })
}

type FetchLike = typeof fetch

export type FalImageMimeType = 'image/png' | 'image/jpeg'
export type FalQueueSubmission = Readonly<{
    provider: 'fal.ai'
    model: string
    providerRequestId: string
    estimatedCostUsd?: number
}>
export type FalQueuedImage = Readonly<{
    url: string
    contentType: FalImageMimeType | null
}>
export type FalWebhookEvent = Readonly<{
    providerRequestId: string
    status: 'OK' | 'ERROR'
    errorMessage: string | null
    image: FalQueuedImage | null
    seed?: number
}>
export type FalFluxImageProviderErrorCode =
    | 'FAL_FLUX_NOT_CONFIGURED'
    | 'FAL_FLUX_TIMEOUT'
    | 'FAL_FLUX_RATE_LIMITED'
    | 'FAL_FLUX_BAD_REQUEST'
    | 'FAL_FLUX_PROVIDER_ERROR'
    | 'FAL_FLUX_RESPONSE_INVALID'
    | 'FAL_SEEDREAM_MODEL_REQUIRED'

export class FalFluxImageProviderError extends Error {
    constructor(
        readonly code: FalFluxImageProviderErrorCode,
        message: string,
        options?: { cause?: unknown; providerStatus?: number; providerErrorCode?: string | null },
    ) {
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
    convertJpegToPng?: (jpeg: Uint8Array) => Promise<Uint8Array>
    fetchImplementation?: FetchLike
    now?: () => number
}>

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function providerErrorCode(payload: unknown): string | null {
    const code = record(record(payload)?.detail)?.code ?? record(record(payload)?.error)?.code
    return typeof code === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(code) ? code : null
}

function outputImage(payload: unknown): { url: string; contentType: string | null } | null {
    const root = record(payload)
    const image = Array.isArray(root?.images) ? record(root?.images[0]) : null
    const url = image?.url
    const contentType = typeof image?.content_type === 'string' ? image.content_type : null
    return typeof url === 'string' && (/^https:\/\//.test(url) || /^data:image\/(?:png|jpeg);base64,/.test(url))
        ? { url, contentType }
        : null
}

function queuedImage(payload: unknown): FalQueuedImage | null {
    const output = outputImage(payload)
    if (!output || !/^https:\/\//.test(output.url)) return null
    const contentType =
        output.contentType === 'image/png' || output.contentType === 'image/jpeg' ? output.contentType : null
    return Object.freeze({ url: output.url, contentType })
}

export function parseFalWebhookEvent(value: unknown): FalWebhookEvent | null {
    const root = record(value)
    const providerRequestId =
        typeof root?.request_id === 'string' && root.request_id.trim().length > 0 && root.request_id.length <= 256
            ? root.request_id
            : null
    const status = root?.status === 'OK' || root?.status === 'ERROR' ? root.status : null
    if (!providerRequestId || !status) return null
    const payload = root?.payload
    const seed = record(payload)?.seed
    const image = status === 'OK' ? queuedImage(payload) : null
    const errorMessage =
        typeof root?.error === 'string' && root.error.trim().length > 0
            ? root.error.trim().slice(0, 300)
            : typeof root?.payload_error === 'string' && root.payload_error.trim().length > 0
              ? root.payload_error.trim().slice(0, 300)
              : null
    return Object.freeze({
        providerRequestId,
        status,
        errorMessage,
        image,
        ...(typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 ? { seed } : {}),
    })
}

function hasPngSignature(bytes: Uint8Array): boolean {
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
}

function hasJpegSignature(bytes: Uint8Array): boolean {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

/** Byte signatures, not a caller declaration, define the MIME sent to Seedream. */
export function inferFalImageMimeType(bytes: Uint8Array): FalImageMimeType | null {
    if (hasPngSignature(bytes)) return 'image/png'
    if (hasJpegSignature(bytes)) return 'image/jpeg'
    return null
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
    let offset = 2
    while (offset + 8 <= bytes.length) {
        while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
        const marker = bytes[offset++]
        if (marker === undefined || marker === 0xd9 || marker === 0xda) return null
        if (marker >= 0xd0 && marker <= 0xd7) continue
        if (offset + 1 >= bytes.length) return null
        const length = (bytes[offset] << 8) + bytes[offset + 1]
        if (length < 7 || offset + length > bytes.length) return null
        if (
            (marker >= 0xc0 && marker <= 0xc3) ||
            (marker >= 0xc5 && marker <= 0xc7) ||
            (marker >= 0xc9 && marker <= 0xcb) ||
            (marker >= 0xcd && marker <= 0xcf)
        ) {
            const height = (bytes[offset + 3] << 8) + bytes[offset + 4]
            const width = (bytes[offset + 5] << 8) + bytes[offset + 6]
            return width > 0 && height > 0 ? { width, height } : null
        }
        offset += length
    }
    return null
}

async function readLimitedResponseBytes(response: Response, maximumBytes: number): Promise<Uint8Array<ArrayBuffer>> {
    const contentLength = response.headers.get('content-length')
    const declaredLength = contentLength === null ? null : Number(contentLength)
    if (
        declaredLength !== null &&
        (!Number.isSafeInteger(declaredLength) || declaredLength < 1 || declaredLength > maximumBytes)
    ) {
        throw new FalFluxImageProviderError(
            'FAL_FLUX_RESPONSE_INVALID',
            'Fal ha restituito un file oltre il limite consentito.',
        )
    }
    const reader = response.body?.getReader()
    if (!reader)
        throw new FalFluxImageProviderError(
            'FAL_FLUX_RESPONSE_INVALID',
            'Fal non ha restituito un body immagine leggibile.',
        )
    const chunks: Uint8Array[] = []
    let length = 0
    try {
        while (true) {
            const next = await reader.read()
            if (next.done) break
            length += next.value.byteLength
            if (length > maximumBytes) {
                await reader.cancel()
                throw new FalFluxImageProviderError(
                    'FAL_FLUX_RESPONSE_INVALID',
                    'Fal ha restituito un file oltre il limite consentito.',
                )
            }
            chunks.push(next.value)
        }
    } finally {
        reader.releaseLock()
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
    }
    return bytes
}

function isFalImageUrl(value: string): boolean {
    return /^https:\/\/.{1,4096}$/.test(value) || /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
}

function isWebhookUrl(value: string): boolean {
    try {
        const url = new URL(value)
        return url.protocol === 'https:' && url.username === '' && url.password === ''
    } catch {
        return false
    }
}

export class FalFluxImageProvider {
    private readonly fetchImplementation: FetchLike
    private readonly timeoutMs: number
    private readonly model: string
    private readonly now: () => number

    constructor(private readonly options: FalFluxImageProviderOptions) {
        if (!options.apiKey.trim())
            throw new FalFluxImageProviderError('FAL_FLUX_NOT_CONFIGURED', 'La chiave fal.ai non e configurata.')
        this.fetchImplementation = options.fetchImplementation ?? fetch
        this.timeoutMs = options.timeoutMs ?? 30_000
        this.model = options.model?.trim() || FAL_SEEDREAM_MODEL
        this.now = options.now ?? (() => Date.now())
    }

    async submitSeedreamEvolution(input: {
        prompt: string
        sourceUrl: string
        imageSize: Readonly<{ width: number; height: number }>
        webhookUrl: string
    }): Promise<FalQueueSubmission> {
        if (this.model !== FAL_SEEDREAM_MODEL) {
            throw new FalFluxImageProviderError(
                'FAL_SEEDREAM_MODEL_REQUIRED',
                'La generazione Seedream richiede fal-ai/bytedance/seedream/v4.5/edit.',
            )
        }
        if (
            !input.prompt.trim() ||
            !isFalImageUrl(input.sourceUrl) ||
            !isWebhookUrl(input.webhookUrl) ||
            !Number.isInteger(input.imageSize.width) ||
            !Number.isInteger(input.imageSize.height) ||
            input.imageSize.width < 1 ||
            input.imageSize.height < 1
        ) {
            throw new FalFluxImageProviderError(
                'FAL_FLUX_BAD_REQUEST',
                'La submission Seedream non contiene un prompt, una sorgente, un formato o un webhook validi.',
            )
        }
        return this.submitQueue({
            webhookUrl: input.webhookUrl,
            payload: {
                prompt: input.prompt,
                image_urls: [input.sourceUrl],
                image_size: input.imageSize,
                num_images: 1,
                max_images: 1,
                enable_safety_checker: true,
            },
        })
    }

    /** Downloads exactly one final media representation. Callers own validation and persistence. */
    async downloadQueuedImage(
        input: FalQueuedImage,
    ): Promise<Readonly<{ bytes: Uint8Array<ArrayBuffer>; mimeType: FalImageMimeType }>> {
        const profile = falImageModelProfile()
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
        try {
            let response: Response
            try {
                response = await this.fetchImplementation(input.url, { signal: controller.signal })
            } catch (error) {
                if (controller.signal.aborted)
                    throw new FalFluxImageProviderError(
                        'FAL_FLUX_TIMEOUT',
                        'Il download del risultato Fal ha superato il tempo massimo.',
                        { cause: error },
                    )
                throw new FalFluxImageProviderError(
                    'FAL_FLUX_PROVIDER_ERROR',
                    'Il risultato Fal non e raggiungibile.',
                    { cause: error },
                )
            }
            if (!response.ok)
                throw new FalFluxImageProviderError(
                    'FAL_FLUX_RESPONSE_INVALID',
                    'Fal non ha reso disponibile il risultato.',
                    { providerStatus: response.status },
                )
            const bytes = await readLimitedResponseBytes(response, profile.maxImageBytes)
            const mimeType = inferFalImageMimeType(bytes)
            if (!mimeType)
                throw new FalFluxImageProviderError(
                    'FAL_FLUX_RESPONSE_INVALID',
                    'Fal ha restituito byte immagine non riconoscibili.',
                )
            if (input.contentType && input.contentType !== mimeType)
                throw new FalFluxImageProviderError(
                    'FAL_FLUX_RESPONSE_INVALID',
                    'Il MIME dichiarato da Fal non corrisponde ai byte del risultato.',
                )
            return Object.freeze({ bytes, mimeType })
        } finally {
            clearTimeout(timeout)
        }
    }

    /**
     * Re-reads the already-completed Queue result when a verified webhook reached us without its
     * media payload. This is retrieval only: it never submits, retries, or changes the Fal job.
     */
    async recoverQueuedImage(input: { providerRequestId: string }): Promise<FalQueuedImage> {
        const providerRequestId = input.providerRequestId.trim()
        if (!providerRequestId || providerRequestId.length > 256)
            throw new FalFluxImageProviderError(
                'FAL_FLUX_RESPONSE_INVALID',
                'L identificativo della richiesta Fal non e valido per il recupero del risultato.',
            )
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
        try {
            let response: Response
            try {
                const query = new URLSearchParams({
                    endpoint_id: this.model,
                    request_id: providerRequestId,
                    expand: 'payloads',
                })
                response = await this.fetchImplementation(`https://api.fal.ai/v1/models/requests/by-endpoint?${query}`, {
                    headers: { Authorization: 'Key ' + this.options.apiKey },
                    signal: controller.signal,
                })
            } catch (error) {
                if (controller.signal.aborted)
                    throw new FalFluxImageProviderError(
                        'FAL_FLUX_TIMEOUT',
                        'Il recupero del risultato Fal ha superato il tempo massimo.',
                        { cause: error },
                    )
                throw new FalFluxImageProviderError(
                    'FAL_FLUX_PROVIDER_ERROR',
                    'Fal non e raggiungibile per recuperare il risultato gia generato.',
                    { cause: error },
                )
            }
            let payload: unknown = null
            try {
                payload = await response.json()
            } catch {
                /* The status is mapped below without retaining external response text. */
            }
            if (!response.ok)
                throw new FalFluxImageProviderError(
                    'FAL_FLUX_PROVIDER_ERROR',
                    'Fal non ha reso disponibile il risultato gia generato.',
                    { providerStatus: response.status, providerErrorCode: providerErrorCode(payload) },
                )
            const item = Array.isArray(record(payload)?.items) ? record(payload)?.items[0] : null
            const image = queuedImage(record(item)?.json_output)
            if (!image)
                throw new FalFluxImageProviderError(
                    'FAL_FLUX_RESPONSE_INVALID',
                    'Fal non ha restituito un output immagine recuperabile.',
                )
            return image
        } finally {
            clearTimeout(timeout)
        }
    }

    async normalizeQueuedImage(
        input: Readonly<{ bytes: Uint8Array; mimeType: FalImageMimeType }>,
    ): Promise<Uint8Array> {
        if (input.mimeType === 'image/png') return input.bytes
        if (!this.options.convertJpegToPng)
            throw new FalFluxImageProviderError(
                'FAL_FLUX_RESPONSE_INVALID',
                'La conversione JPEG di Seedream non e configurata.',
            )
        const dimensions = jpegDimensions(input.bytes)
        if (!dimensions || dimensions.width * dimensions.height > falImageModelProfile().maxDecodedPixels) {
            throw new FalFluxImageProviderError(
                'FAL_FLUX_RESPONSE_INVALID',
                'Il JPEG Fal supera i limiti di decodifica consentiti.',
            )
        }
        try {
            return await this.options.convertJpegToPng(input.bytes)
        } catch (error) {
            const reason =
                error instanceof Error && error.message.trim() ? ` (${error.message.trim().slice(0, 200)})` : ''
            throw new FalFluxImageProviderError(
                'FAL_FLUX_RESPONSE_INVALID',
                'La conversione JPEG di Seedream in PNG non e riuscita.' + reason,
                { cause: error },
            )
        }
    }

    private async submitQueue(input: {
        webhookUrl: string
        payload: Record<string, unknown>
    }): Promise<FalQueueSubmission> {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
        try {
            let response: Response
            try {
                response = await this.fetchImplementation(
                    `https://queue.fal.run/${this.model}?fal_webhook=${encodeURIComponent(input.webhookUrl)}`,
                    {
                        method: 'POST',
                        headers: { Authorization: 'Key ' + this.options.apiKey, 'Content-Type': 'application/json' },
                        body: JSON.stringify(input.payload),
                        signal: controller.signal,
                    },
                )
            } catch (error) {
                if (controller.signal.aborted)
                    throw new FalFluxImageProviderError(
                        'FAL_FLUX_TIMEOUT',
                        'La submission Fal ha superato il tempo massimo.',
                        { cause: error },
                    )
                throw new FalFluxImageProviderError(
                    'FAL_FLUX_PROVIDER_ERROR',
                    'Fal non e raggiungibile per la submission.',
                    { cause: error },
                )
            }
            let payload: unknown = null
            try {
                payload = await response.json()
            } catch {
                /* request diagnostics are optional */
            }
            if (!response.ok) {
                const code =
                    response.status === 429
                        ? 'FAL_FLUX_RATE_LIMITED'
                        : response.status === 400
                          ? 'FAL_FLUX_BAD_REQUEST'
                          : 'FAL_FLUX_PROVIDER_ERROR'
                throw new FalFluxImageProviderError(code, 'Fal ha rifiutato la submission in coda.', {
                    providerStatus: response.status,
                    providerErrorCode: providerErrorCode(payload),
                })
            }
            const requestId = record(payload)?.request_id
            if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 256) {
                throw new FalFluxImageProviderError(
                    'FAL_FLUX_RESPONSE_INVALID',
                    'Fal Queue non ha restituito un request_id valido.',
                )
            }
            return Object.freeze({
                provider: 'fal.ai',
                model: this.model,
                providerRequestId: requestId,
                ...(this.options.estimatedCostUsd === undefined
                    ? {}
                    : { estimatedCostUsd: this.options.estimatedCostUsd }),
            })
        } finally {
            clearTimeout(timeout)
        }
    }
}
