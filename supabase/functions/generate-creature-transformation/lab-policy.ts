import type { GenerateConceptRequest, GenerateImageRequest } from '../../../shared/creature-transformations/contracts.ts'

type ConceptMode = GenerateConceptRequest['conceptMode']
type ImageProviderMode = GenerateImageRequest['imageProviderMode']

const CONCEPT_MODES = new Set<ConceptMode>(['MOCK', 'AI'])
const IMAGE_PROVIDER_MODES = new Set<ImageProviderMode>(['MOCK'])
const DEFAULT_SIGNED_URL_TTL_SECONDS = 300
const DEFAULT_DAILY_REQUEST_LIMIT = 10
const DEFAULT_DAILY_BUDGET_USD = 0
const DEFAULT_STALE_REQUEST_SECONDS = 900
const DEFAULT_REAL_IMAGE_TIMEOUT_MS = 120000
const REAL_IMAGE_QUALITIES = new Set(['low', 'medium', 'high'])

export type OpenAiImageQuality = 'low' | 'medium' | 'high'
export type RealImagePolicy = Readonly<{
    enabled: boolean
    provider: 'OPENAI' | null
    allowedProfileIds: ReadonlySet<string>
    apiKey: string | null
    model: string | null
    quality: OpenAiImageQuality
    timeoutMs: number
    estimatedCostUsd: number | null
}>

export type CreatureTransformationLabPolicy = Readonly<{
    enabled: boolean
    allowedConceptModes: ReadonlySet<ConceptMode>
    allowedImageProviderModes: ReadonlySet<ImageProviderMode>
    signedUrlTtlSeconds: number
    dailyRequestLimit: number
    dailyBudgetUsd: number
    staleRequestSeconds: number
    realImage: RealImagePolicy
}>

function readBoundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback
}

function readBoundedUsd(value: string | undefined, fallback: number, maximum: number): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= maximum ? parsed : fallback
}

function readRequiredPositiveUsd(value: string | undefined, maximum: number): number | null {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 && parsed <= maximum ? parsed : null
}

function readRealImagePolicy(readEnvironment: (name: string) => string | undefined): RealImagePolicy {
    const provider = readEnvironment('CREATURE_TRANSFORMATION_REAL_IMAGE_PROVIDER')?.trim().toUpperCase()
    const quality = readEnvironment('OPENAI_IMAGE_QUALITY')?.trim().toLowerCase()
    const allowedProfileIds = new Set(
        (readEnvironment('CREATURE_TRANSFORMATION_REAL_IMAGE_ALLOWED_PROFILE_IDS') ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter((value) => value.length > 0 && value.length <= 128),
    )
    const apiKey = readEnvironment('OPENAI_IMAGE_API_KEY')?.trim() || null
    const model = readEnvironment('OPENAI_IMAGE_MODEL')?.trim() || null
    return Object.freeze({
        enabled: readEnvironment('CREATURE_TRANSFORMATION_REAL_IMAGE_ENABLED') === 'true',
        provider: provider === 'OPENAI' ? 'OPENAI' : null,
        allowedProfileIds,
        apiKey,
        model,
        quality: REAL_IMAGE_QUALITIES.has(quality ?? '') ? quality as OpenAiImageQuality : 'medium',
        timeoutMs: readBoundedInteger(readEnvironment('OPENAI_IMAGE_TIMEOUT_MS'), DEFAULT_REAL_IMAGE_TIMEOUT_MS, 1000, 180000),
        estimatedCostUsd: readRequiredPositiveUsd(readEnvironment('OPENAI_IMAGE_ESTIMATED_COST_USD'), 10000),
    })
}

export function readCreatureTransformationLabPolicy(readEnvironment: (name: string) => string | undefined): CreatureTransformationLabPolicy {
    const enabled = readEnvironment('CREATURE_TRANSFORMATION_LAB_ENABLED') === 'true'
    const allowedConceptModes = new Set<ConceptMode>()
    const allowedImageProviderModes = new Set<ImageProviderMode>()
    const configuredModes = readEnvironment('CREATURE_TRANSFORMATION_ALLOWED_CONCEPT_MODES') ?? ''
    const configuredImageModes = readEnvironment('CREATURE_TRANSFORMATION_ALLOWED_IMAGE_PROVIDER_MODES') ?? ''

    for (const mode of configuredModes.split(',')) {
        const normalized = mode.trim().toUpperCase()
        if (CONCEPT_MODES.has(normalized as ConceptMode)) {
            allowedConceptModes.add(normalized as ConceptMode)
        }
    }

    for (const mode of configuredImageModes.split(',')) {
        const normalized = mode.trim().toUpperCase()
        if (IMAGE_PROVIDER_MODES.has(normalized as ImageProviderMode)) {
            allowedImageProviderModes.add(normalized as ImageProviderMode)
        }
    }

    const signedUrlTtlSeconds = readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_SIGNED_URL_TTL_SECONDS'), DEFAULT_SIGNED_URL_TTL_SECONDS, 60, 3600)
    const dailyRequestLimit = readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_DAILY_REQUEST_LIMIT'), DEFAULT_DAILY_REQUEST_LIMIT, 1, 1000)
    const dailyBudgetUsd = readBoundedUsd(readEnvironment('CREATURE_TRANSFORMATION_DAILY_BUDGET_USD'), DEFAULT_DAILY_BUDGET_USD, 10000)
    const staleRequestSeconds = readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_STALE_REQUEST_SECONDS'), DEFAULT_STALE_REQUEST_SECONDS, 60, 86400)

    return Object.freeze({ enabled, allowedConceptModes, allowedImageProviderModes, signedUrlTtlSeconds, dailyRequestLimit, dailyBudgetUsd, staleRequestSeconds, realImage: readRealImagePolicy(readEnvironment) })
}
