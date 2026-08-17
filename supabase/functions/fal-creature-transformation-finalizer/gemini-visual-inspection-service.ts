import type { CreatureBodyPlan } from '../../../shared/creature-transformations/flux-evolution/body-plan-registry.ts'
import {
    mergeVisualInspection,
    parseMapperEvidenceAssessment,
    parseObservedVisualState,
    parseVision1DiagnosticEvidence,
    type MapperEvidenceAssessment,
    type ObservedVisualState,
    type Vision1DiagnosticEvidence,
    type VisualInspection,
} from '../../../shared/creature-transformations/visual-inspection.ts'

type FetchLike = typeof fetch

const DEFAULT_MODEL = 'gemini-3.1-flash-lite'
const DEFAULT_DETECTOR_TIMEOUT_MS = 4_000
const DEFAULT_MAPPER_TIMEOUT_MS = 6_000

export type GeminiVisualInspectionConfiguration = Readonly<{
    enabled: boolean
    apiKey: string | null
    model: string
    detectorTimeoutMs: number
    mapperTimeoutMs: number
}>

type GeminiFile = Readonly<{ name: string, uri: string, mimeType: 'image/png' | 'image/jpeg' }>
type DetectorResult = Readonly<{ status: 'COMPLETE' | 'UNAVAILABLE', evidence: readonly Vision1DiagnosticEvidence[] }>
type MapperResult = Readonly<{
    status: 'COMPLETE' | 'UNAVAILABLE'
    usedVision1Evidence: boolean
    evidenceAssessments: readonly MapperEvidenceAssessment[]
    structuralConcerns: readonly Vision1DiagnosticEvidence[]
    observedVisualState?: ObservedVisualState
}>

function boundedInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 20_000 ? parsed : fallback
}

export function readGeminiVisualInspectionConfiguration(readEnvironment: (name: string) => string | undefined): GeminiVisualInspectionConfiguration {
    const apiKey = readEnvironment('GEMINI_API_KEY')?.trim() || null
    return Object.freeze({
        // The API key is the only required switch: no gameplay-facing feature flag is needed.
        enabled: Boolean(apiKey),
        apiKey,
        model: readEnvironment('CREATURE_VISION_MODEL')?.trim() || DEFAULT_MODEL,
        detectorTimeoutMs: boundedInteger(readEnvironment('CREATURE_VISION_1_TIMEOUT_MS'), DEFAULT_DETECTOR_TIMEOUT_MS),
        mapperTimeoutMs: boundedInteger(readEnvironment('CREATURE_VISION_2_TIMEOUT_MS'), DEFAULT_MAPPER_TIMEOUT_MS),
    })
}

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
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

function responseSchema(type: string, properties?: Record<string, unknown>, required?: string[]): Record<string, unknown> {
    // Gemini schema uses `properties` only for OBJECT.  Enum constraints and ARRAY
    // items are direct schema fields, not nested object properties.
    return Object.freeze({
        type,
        ...(properties ? (type === 'OBJECT' ? { properties } : properties) : {}),
        ...(required ? { required } : {}),
    })
}

const EVIDENCE_SCHEMA = responseSchema('OBJECT', {
    type: responseSchema('STRING', { enum: ['EXTRA_LIMB', 'MISSING_LIMB', 'DUPLICATED_LIMB', 'FUSED_LIMB', 'DEFORMED_APPENDAGE', 'IMPOSSIBLE_ATTACHMENT', 'MIRRORED_SUBJECT', 'ORIENTATION_MISMATCH', 'OTHER_STRUCTURAL'] }),
    imageRegion: responseSchema('STRING', { enum: ['IMAGE_LEFT', 'IMAGE_RIGHT', 'UPPER_IMAGE_LEFT', 'UPPER_IMAGE_CENTER', 'UPPER_IMAGE_RIGHT', 'CENTER_IMAGE_LEFT', 'CENTER_IMAGE', 'CENTER_IMAGE_RIGHT', 'LOWER_IMAGE_LEFT', 'LOWER_IMAGE_CENTER', 'LOWER_IMAGE_RIGHT'] }),
    description: responseSchema('STRING'),
    confidence: responseSchema('NUMBER'),
}, ['type', 'imageRegion', 'description', 'confidence'])

const OBSERVED_STATE_SCHEMA = responseSchema('OBJECT', {
    orientation: responseSchema('OBJECT', {
        viewpoint: responseSchema('STRING', { enum: ['FRONT', 'THREE_QUARTER', 'PROFILE', 'REAR', 'UNKNOWN'] }),
        facing: responseSchema('STRING', { enum: ['IMAGE_LEFT', 'IMAGE_RIGHT', 'CENTER', 'UNKNOWN'] }),
    }, ['viewpoint', 'facing']),
    observedBodyPlan: responseSchema('STRING'),
    headAndEyes: responseSchema('STRING'),
    limbsAndLimbLikeStructures: responseSchema('STRING'),
    tail: responseSchema('STRING'),
    hornsAntlers: responseSchema('STRING'),
    dorsalStructures: responseSchema('STRING'),
    appendages: responseSchema('STRING'),
    skinCovering: responseSchema('STRING'),
    primaryColors: responseSchema('ARRAY', { items: responseSchema('STRING') }),
    distinctiveStructures: responseSchema('ARRAY', { items: responseSchema('STRING') }),
    targetRegions: responseSchema('ARRAY', { items: responseSchema('OBJECT', {
        target: responseSchema('STRING', { enum: ['TAIL', 'LIMBS_AND_FEET', 'HEAD_AND_CROWN', 'BODY_SHAPE', 'DORSAL_STRUCTURES', 'SKIN_AND_COVERING', 'WINGS', 'TENTACLES'] }),
        description: responseSchema('STRING'),
    }, ['target', 'description']) }),
}, ['orientation', 'observedBodyPlan', 'headAndEyes', 'limbsAndLimbLikeStructures', 'tail', 'hornsAntlers', 'dorsalStructures', 'appendages', 'skinCovering', 'primaryColors', 'distinctiveStructures', 'targetRegions'])

const DETECTOR_SCHEMA = responseSchema('OBJECT', {
    evidence: responseSchema('ARRAY', { items: EVIDENCE_SCHEMA }),
}, ['evidence'])

const MAPPER_SCHEMA = responseSchema('OBJECT', {
    observedVisualState: OBSERVED_STATE_SCHEMA,
    evidenceAssessments: responseSchema('ARRAY', { items: responseSchema('OBJECT', {
        evidenceIndex: responseSchema('INTEGER'),
        disposition: responseSchema('STRING', { enum: ['CONFIRMED', 'POSSIBLE', 'REJECTED_WITH_STRONG_CONTRARY_EVIDENCE'] }),
        verificationNote: responseSchema('STRING'),
    }, ['evidenceIndex', 'disposition', 'verificationNote']) }),
    structuralConcerns: responseSchema('ARRAY', { items: EVIDENCE_SCHEMA }),
}, ['observedVisualState', 'evidenceAssessments', 'structuralConcerns'])

function detectorPrompt(input: { bodyPlan: CreatureBodyPlan, expectedOrientation?: string | null }): string {
    const topology = input.bodyPlan.topology
    return [
        'You are a specialized visual anomaly detector for one generated creature image. Return JSON only.',
        'Inspect geometry, terminal extremities and attachment points deliberately. Do not infer away visible defects merely to make the image match its canonical contract.',
        `CANONICAL ANATOMY REFERENCE ONLY: ${input.bodyPlan.promptDescription}; ${topology.headCount} head(s), ${topology.forelimbCount} forelimb(s), ${topology.hindLimbCount} hindlimb(s), ${topology.wingCount} wing(s), ${topology.tentacleCount} tentacle(s), ${topology.tailCount} tail(s).`,
        input.expectedOrientation ? `Expected source presentation reference: ${input.expectedOrientation}.` : 'No prior presentation reference is available; report orientation only when a defect is visually supportable.',
        'Find only useful structural defects: EXTRA_LIMB, MISSING_LIMB, DUPLICATED_LIMB, FUSED_LIMB, DEFORMED_APPENDAGE, IMPOSSIBLE_ATTACHMENT, MIRRORED_SUBJECT, ORIENTATION_MISMATCH, OTHER_STRUCTURAL.',
        'IMAGE_LEFT and IMAGE_RIGHT are always from the observer viewpoint. Use only the supplied image-region enum. Do not create canonical anatomy or propose a correction. Return an empty evidence array when no defect is visually supported.',
    ].join('\n')
}

function mapperPrompt(evidence: readonly Vision1DiagnosticEvidence[]): string {
    const upstream = evidence.length
        ? JSON.stringify(evidence)
        : '[]'
    return [
        'You map the actual visible anatomy of one generated creature image. Return JSON only.',
        'Describe what the image shows, not what canonical anatomy should be. A limb-like structure can be observed without becoming canonical anatomy.',
        'Map orientation/facing, viewpoint, observed locomotion/body plan, head and eyes, limbs and limb-like structures, tail, horns/antlers, dorsal structures, appendages, covering, colours, distinctive anatomy and reliable evolvable regions.',
        'UPSTREAM DIAGNOSTIC EVIDENCE',
        'A specialized anomaly detector has already inspected this image. Treat each supplied item as high-priority visual evidence. Verify it against the image and incorporate it into the anatomical mapping.',
        'For every supplied item return CONFIRMED, POSSIBLE, or REJECTED_WITH_STRONG_CONTRARY_EVIDENCE. Do not silently discard upstream evidence. Upstream evidence describes possible visual defects and MUST NOT modify canonical anatomy.',
        upstream,
        'Also list independently visible structural concerns, even when upstream evidence is empty. Use the same evidence object shape.',
    ].join('\n')
}

export class GeminiVisualInspectionService {
    private readonly fetchImplementation: FetchLike

    constructor(private readonly configuration: GeminiVisualInspectionConfiguration, fetchImplementation?: FetchLike) {
        this.fetchImplementation = fetchImplementation ?? fetch
    }

    async inspect(input: {
        image: Uint8Array
        mimeType: 'image/png' | 'image/jpeg'
        bodyPlan: CreatureBodyPlan
        generation: number
        previous: VisualInspection | null | undefined
        expectedOrientation?: string | null
        now?: () => string
    }): Promise<VisualInspection> {
        const now = input.now ?? (() => new Date().toISOString())
        if (!this.configuration.enabled || !this.configuration.apiKey) {
            return mergeVisualInspection({
                previous: input.previous, generation: input.generation, inspectedAt: now(),
                detector: { status: 'UNAVAILABLE', evidence: [] },
                mapper: { status: 'UNAVAILABLE', usedVision1Evidence: false, evidenceAssessments: [], structuralConcerns: [] },
            })
        }
        const file = await this.uploadFile(input.image, input.mimeType)
        if (!file) {
            return mergeVisualInspection({
                previous: input.previous, generation: input.generation, inspectedAt: now(),
                detector: { status: 'UNAVAILABLE', evidence: [] },
                mapper: { status: 'UNAVAILABLE', usedVision1Evidence: false, evidenceAssessments: [], structuralConcerns: [] },
            })
        }
        try {
            const detector = await this.detect(file, input.bodyPlan, input.expectedOrientation)
            const mapper = await this.map(file, detector.status === 'COMPLETE' ? detector.evidence : [])
            return mergeVisualInspection({ previous: input.previous, generation: input.generation, inspectedAt: now(), detector, mapper })
        } finally {
            await this.deleteFile(file).catch(() => undefined)
        }
    }

    private async uploadFile(image: Uint8Array, mimeType: 'image/png' | 'image/jpeg'): Promise<GeminiFile | null> {
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
                body: JSON.stringify({ file: { display_name: 'seedream-visual-inspection' } }),
            })
        } catch { return null }
        const uploadUrl = start.headers.get('x-goog-upload-url')
        if (!start.ok || !uploadUrl) return null
        let completed: Response
        try {
            completed = await this.fetchImplementation(uploadUrl, {
                method: 'POST',
                headers: { 'x-goog-api-key': apiKey, 'Content-Length': String(image.byteLength), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
                body: image,
            })
        } catch { return null }
        const payload = await completed.json().catch(() => null)
        const file = record(record(payload)?.file)
        const name = typeof file?.name === 'string' ? file.name : null
        const uri = typeof file?.uri === 'string' ? file.uri : null
        const returnedMimeType = file?.mimeType === 'image/png' || file?.mimeType === 'image/jpeg' ? file.mimeType : mimeType
        return completed.ok && name && uri ? Object.freeze({ name, uri, mimeType: returnedMimeType }) : null
    }

    private async deleteFile(file: GeminiFile): Promise<void> {
        const response = await this.fetchImplementation(`https://generativelanguage.googleapis.com/v1beta/${file.name}`, {
            method: 'DELETE', headers: { 'x-goog-api-key': this.configuration.apiKey! },
        })
        if (!response.ok && response.status !== 404) throw new Error('gemini file cleanup failed')
    }

    private async detect(file: GeminiFile, bodyPlan: CreatureBodyPlan, expectedOrientation?: string | null): Promise<DetectorResult> {
        const payload = await this.generateJson(file, detectorPrompt({ bodyPlan, expectedOrientation }), DETECTOR_SCHEMA, this.configuration.detectorTimeoutMs)
        const root = record(payload)
        const values = root && Array.isArray(root.evidence) ? root.evidence.map(parseVision1DiagnosticEvidence) : null
        return values && values.every((entry): entry is Vision1DiagnosticEvidence => entry !== null)
            ? Object.freeze({ status: 'COMPLETE', evidence: Object.freeze(values) })
            : Object.freeze({ status: 'UNAVAILABLE', evidence: Object.freeze([]) })
    }

    private async map(file: GeminiFile, evidence: readonly Vision1DiagnosticEvidence[]): Promise<MapperResult> {
        const payload = await this.generateJson(file, mapperPrompt(evidence), MAPPER_SCHEMA, this.configuration.mapperTimeoutMs)
        const root = record(payload)
        const observedVisualState = parseObservedVisualState(root?.observedVisualState)
        const assessments = Array.isArray(root?.evidenceAssessments) ? root.evidenceAssessments.map(parseMapperEvidenceAssessment) : null
        const structuralConcerns = Array.isArray(root?.structuralConcerns) ? root.structuralConcerns.map(parseVision1DiagnosticEvidence) : null
        const validAssessments = assessments && assessments.every((entry): entry is MapperEvidenceAssessment => entry !== null)
        const validConcerns = structuralConcerns && structuralConcerns.every((entry): entry is Vision1DiagnosticEvidence => entry !== null)
        const hasEveryAssessment = evidence.length === 0 || (validAssessments && new Set(assessments.map((assessment) => assessment.evidenceIndex)).size === evidence.length && assessments.every((assessment) => assessment.evidenceIndex < evidence.length))
        return observedVisualState && validAssessments && validConcerns && hasEveryAssessment
            ? Object.freeze({ status: 'COMPLETE', usedVision1Evidence: evidence.length > 0, evidenceAssessments: Object.freeze(assessments), structuralConcerns: Object.freeze(structuralConcerns), observedVisualState })
            : Object.freeze({ status: 'UNAVAILABLE', usedVision1Evidence: evidence.length > 0, evidenceAssessments: Object.freeze([]), structuralConcerns: Object.freeze([]) })
    }

    private async generateJson(file: GeminiFile, prompt: string, schema: Record<string, unknown>, timeoutMs: number): Promise<unknown | null> {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), timeoutMs)
        try {
            const response = await this.fetchImplementation(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.configuration.model)}:generateContent`, {
                method: 'POST',
                headers: { 'x-goog-api-key': this.configuration.apiKey!, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }, { file_data: { mime_type: file.mimeType, file_uri: file.uri } }] }],
                    generationConfig: { response_mime_type: 'application/json', response_schema: schema, temperature: 0 },
                }),
                signal: controller.signal,
            })
            if (!response.ok) return null
            const text = extractText(await response.json())
            try { return text ? JSON.parse(text) : null } catch { return null }
        } catch { return null } finally { clearTimeout(timeout) }
    }
}
