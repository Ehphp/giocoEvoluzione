import {
    parseRelativeHeightAssessment,
    type RelativeHeightAssessment,
} from '../../../shared/creature-transformations/relative-height-comparison.ts'

type FetchLike = typeof fetch

const DEFAULT_MODEL = 'gemini-3.1-flash-lite'
const DEFAULT_TIMEOUT_MS = 4_000

export type GeminiRelativeHeightComparisonConfiguration = Readonly<{
    enabled: boolean
    apiKey: string | null
    model: string
    timeoutMs: number
}>

type GeminiFile = Readonly<{ name: string; uri: string; mimeType: 'image/png' | 'image/jpeg' }>

function boundedInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 20_000 ? parsed : fallback
}

export function readGeminiRelativeHeightComparisonConfiguration(
    readEnvironment: (name: string) => string | undefined,
): GeminiRelativeHeightComparisonConfiguration {
    const apiKey = readEnvironment('GEMINI_API_KEY')?.trim() || null
    return Object.freeze({
        enabled: Boolean(apiKey),
        apiKey,
        // This is deliberately a separate switch from Vision 1 and Vision 2.
        model: readEnvironment('CREATURE_RELATIVE_HEIGHT_MODEL')?.trim() ||
            readEnvironment('CREATURE_VISION_MODEL')?.trim() ||
            DEFAULT_MODEL,
        timeoutMs: boundedInteger(readEnvironment('CREATURE_RELATIVE_HEIGHT_TIMEOUT_MS'), DEFAULT_TIMEOUT_MS),
    })
}

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function extractText(payload: unknown): string | null {
    const root = record(payload)
    const candidates = root && Array.isArray(root.candidates) ? root.candidates : []
    for (const candidate of candidates) {
        const content = record(candidate)?.content
        const parts = record(content)?.parts
        if (!Array.isArray(parts)) continue
        for (const part of parts) {
            const text = record(part)?.text
            if (typeof text === 'string' && text.trim()) return text
        }
    }
    return null
}

function responseSchema(
    type: string,
    properties?: Record<string, unknown>,
    required?: string[],
): Record<string, unknown> {
    return Object.freeze({
        type,
        ...(properties ? (type === 'OBJECT' ? { properties } : properties) : {}),
        ...(required ? { required } : {}),
    })
}

const RELATIVE_HEIGHT_SCHEMA = responseSchema(
    'OBJECT',
    {
        status: responseSchema('STRING', { enum: ['COMPLETE', 'AMBIGUOUS', 'UNAVAILABLE'] }),
        change: responseSchema('STRING', {
            enum: ['MUCH_SHORTER', 'SHORTER', 'UNCHANGED', 'TALLER', 'MUCH_TALLER'],
        }),
        confidence: responseSchema('NUMBER'),
        confounders: responseSchema('ARRAY', {
            items: responseSchema('STRING', {
                enum: [
                    'POSE_CHANGED',
                    'VIEWPOINT_CHANGED',
                    'FRAMING_CHANGED',
                    'FEET_NOT_VISIBLE',
                    'HEAD_NOT_VISIBLE',
                    'LARGE_APPENDAGES',
                ],
            }),
        }),
        shortReason: responseSchema('STRING'),
    },
    ['status', 'change', 'confidence', 'confounders', 'shortReason'],
)

function unavailable(reason: string): RelativeHeightAssessment {
    return Object.freeze({
        status: 'UNAVAILABLE',
        change: 'UNCHANGED',
        confidence: 0,
        confounders: Object.freeze([]),
        shortReason: reason,
    })
}

function comparisonPrompt(): string {
    return [
        'You compare the biological bearing body height of the same creature across two images. Return JSON only.',
        'The first image is SOURCE. The second image is RESULT.',
        'Compare only the distance from ground-contact feet to the anatomical top of the head.',
        'Ignore canvas fill, zoom, transparent padding, crop, framing, shadows, effects, tails, horns, antlers, wings, decorative dorsal structures, and other large appendages.',
        'A quadruped-to-biped or biped-to-quadruped locomotion transition is an anatomical evolution, not by itself a pose confounder. When both images show the bearing feet and head, compare the resulting ground-to-head body height and classify the morphological change.',
        'Do not estimate absolute metres. Do not use temporary flexion, orientation, viewpoint, canvas size, or apparent subject fill as height evidence. Report POSE_CHANGED only when temporary posture prevents comparison within an otherwise unchanged body plan.',
        'Use MUCH_SHORTER, SHORTER, UNCHANGED, TALLER, or MUCH_TALLER only for reliable bearing-body-height change.',
        'Report COMPLETE only when both ground-contact feet and anatomical head top are comparable. Otherwise report AMBIGUOUS or UNAVAILABLE, list applicable confounders, and use UNCHANGED when no reliable direction remains.',
        'shortReason must be brief and factual.',
    ].join('\n')
}

export class GeminiRelativeHeightComparisonService {
    private readonly fetchImplementation: FetchLike

    constructor(
        private readonly configuration: GeminiRelativeHeightComparisonConfiguration,
        fetchImplementation?: FetchLike,
    ) {
        this.fetchImplementation = fetchImplementation ?? fetch
    }

    async compare(input: {
        sourceImage: Uint8Array<ArrayBuffer>
        sourceMimeType: 'image/png' | 'image/jpeg'
        resultImage: Uint8Array<ArrayBuffer>
        resultMimeType: 'image/png' | 'image/jpeg'
        sourceVersionId: string
        sourceHeightMeters: number
    }): Promise<RelativeHeightAssessment> {
        if (!this.configuration.enabled || !this.configuration.apiKey) return unavailable('Provider non configurato.')

        const source = await this.uploadFile(input.sourceImage, input.sourceMimeType, 'relative-height-source')
        if (!source) return unavailable('Sorgente non disponibile al confronto.')
        const result = await this.uploadFile(input.resultImage, input.resultMimeType, 'relative-height-result')
        if (!result) {
            await this.deleteFile(source).catch(() => undefined)
            return unavailable('Risultato non disponibile al confronto.')
        }
        try {
            const payload = await this.generateJson(source, result)
            return parseRelativeHeightAssessment(payload) ?? unavailable('Risposta di confronto non valida.')
        } catch {
            return unavailable('Confronto non disponibile.')
        } finally {
            await Promise.all([this.deleteFile(source), this.deleteFile(result)]).catch(() => undefined)
        }
    }

    private async uploadFile(
        image: Uint8Array<ArrayBuffer>,
        mimeType: 'image/png' | 'image/jpeg',
        displayName: string,
    ): Promise<GeminiFile | null> {
        const apiKey = this.configuration.apiKey!
        let start: Response
        try {
            start = await this.fetchImplementation('https://generativelanguage.googleapis.com/upload/v1beta/files', {
                method: 'POST',
                headers: {
                    'x-goog-api-key': apiKey,
                    'X-Goog-Upload-Protocol': 'resumable',
                    'X-Goog-Upload-Command': 'start',
                    'X-Goog-Upload-Header-Content-Length': String(image.byteLength),
                    'X-Goog-Upload-Header-Content-Type': mimeType,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ file: { display_name: displayName } }),
            })
        } catch {
            return null
        }
        const uploadUrl = start.headers.get('x-goog-upload-url')
        if (!start.ok || !uploadUrl) return null
        let completed: Response
        try {
            completed = await this.fetchImplementation(uploadUrl, {
                method: 'POST',
                headers: {
                    'x-goog-api-key': apiKey,
                    'Content-Length': String(image.byteLength),
                    'X-Goog-Upload-Offset': '0',
                    'X-Goog-Upload-Command': 'upload, finalize',
                },
                body: image,
            })
        } catch {
            return null
        }
        const payload = await completed.json().catch(() => null)
        const file = record(record(payload)?.file)
        const name = typeof file?.name === 'string' ? file.name : null
        const uri = typeof file?.uri === 'string' ? file.uri : null
        const returnedMimeType =
            file?.mimeType === 'image/png' || file?.mimeType === 'image/jpeg' ? file.mimeType : mimeType
        return completed.ok && name && uri ? Object.freeze({ name, uri, mimeType: returnedMimeType }) : null
    }

    private async deleteFile(file: GeminiFile): Promise<void> {
        const response = await this.fetchImplementation(
            `https://generativelanguage.googleapis.com/v1beta/${file.name}`,
            { method: 'DELETE', headers: { 'x-goog-api-key': this.configuration.apiKey! } },
        )
        if (!response.ok && response.status !== 404) throw new Error('gemini file cleanup failed')
    }

    private async generateJson(source: GeminiFile, result: GeminiFile): Promise<unknown | null> {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), this.configuration.timeoutMs)
        try {
            const response = await this.fetchImplementation(
                `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.configuration.model)}:generateContent`,
                {
                    method: 'POST',
                    headers: { 'x-goog-api-key': this.configuration.apiKey!, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [
                            {
                                parts: [
                                    { text: comparisonPrompt() },
                                    { file_data: { mime_type: source.mimeType, file_uri: source.uri } },
                                    { file_data: { mime_type: result.mimeType, file_uri: result.uri } },
                                ],
                            },
                        ],
                        generationConfig: {
                            response_mime_type: 'application/json',
                            response_schema: RELATIVE_HEIGHT_SCHEMA,
                            temperature: 0,
                        },
                    }),
                    signal: controller.signal,
                },
            )
            if (!response.ok) return null
            const text = extractText(await response.json())
            try {
                return text ? JSON.parse(text) : null
            } catch {
                return null
            }
        } catch {
            return null
        } finally {
            clearTimeout(timeout)
        }
    }
}
