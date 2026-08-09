import type { GenerateConceptRequest, GenerateImageRequest } from '../../../shared/creature-transformations/contracts.ts'
import { parseCreatureImageGenerationProfiles, type CreatureImageGenerationProfiles } from '../../../shared/creature-transformations/image-generation-profiles.ts'
import { readCreatureVisualProgressionWinsRequired } from '../../../shared/creature-transformations/visual-progression.ts'

type ConceptMode = GenerateConceptRequest['conceptMode']
type ImageProviderMode = GenerateImageRequest['imageProviderMode']

const CONCEPT_MODES = new Set<ConceptMode>(['MOCK', 'AI'])
const IMAGE_PROVIDER_MODES = new Set<ImageProviderMode>(['MOCK'])
const DEFAULT_SIGNED_URL_TTL_SECONDS = 300
const DEFAULT_DAILY_REQUEST_LIMIT = 10
const DEFAULT_DAILY_BUDGET_USD = 0
const DEFAULT_STALE_REQUEST_SECONDS = 900
const DEFAULT_DAILY_REAL_IMAGE_LIMIT = 3
const DEFAULT_GLOBAL_DAILY_REAL_IMAGE_LIMIT = 10
const DEFAULT_GLOBAL_CONCURRENT_REAL_IMAGE_LIMIT = 2
const DEFAULT_REAL_IMAGE_COOLDOWN_SECONDS = 60
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
    maxEstimatedCostUsd: number | null
}>

export type BenchmarkPolicy = Readonly<{
    allowedProfileIds: ReadonlySet<string>
    reviewerProfileIds: ReadonlySet<string>
    generationProfiles: CreatureImageGenerationProfiles
}>

export type CreatureTransformationLabPolicy = Readonly<{
    enabled: boolean
    allowedConceptModes: ReadonlySet<ConceptMode>
    allowedImageProviderModes: ReadonlySet<ImageProviderMode>
    signedUrlTtlSeconds: number
    dailyRequestLimit: number
    dailyBudgetUsd: number
    staleRequestSeconds: number
    dailyRealImageLimit: number
    globalDailyRealImageLimit: number
    globalConcurrentRealImageLimit: number
    realImageCooldownSeconds: number
    realImage: RealImagePolicy
    /** Separate server-side allowlist; a VITE flag is deliberately not sufficient. */
    lineageExperimentAllowedProfileIds: ReadonlySet<string>
    benchmark: BenchmarkPolicy
    visualProgression: Readonly<{
        enabled: boolean
        productionGenerationEnabled: boolean
        adoptionEnabled: boolean
        backgroundCleanupEnabled: boolean
        allowedProfileIds: ReadonlySet<string>
        winsRequired: number
        productionGenerationProfileId: string | null
    }>
}>

function readBoundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback
}

function readBoundedUsd(value: string | undefined, fallback: number, maximum: number): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= maximum ? parsed : fallback
}

function readRequiredPositiveUsd(value: string | undefined): number | null {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function readProfileIdSet(value: string | undefined): ReadonlySet<string> {
    return new Set(
        (value ?? '')
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => /^[A-Za-z0-9-]{1,128}$/.test(entry)),
    )
}

function readRealImagePolicy(readEnvironment: (name: string) => string | undefined): RealImagePolicy {
    const provider = readEnvironment('CREATURE_TRANSFORMATION_REAL_IMAGE_PROVIDER')?.trim().toUpperCase()
    const quality = readEnvironment('OPENAI_IMAGE_QUALITY')?.trim().toLowerCase()
    const allowedProfileIds = readProfileIdSet(readEnvironment('CREATURE_TRANSFORMATION_REAL_IMAGE_ALLOWED_PROFILE_IDS'))
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
        estimatedCostUsd: readRequiredPositiveUsd(readEnvironment('OPENAI_IMAGE_ESTIMATED_COST_USD')),
        maxEstimatedCostUsd: readRequiredPositiveUsd(readEnvironment('CREATURE_TRANSFORMATION_MAX_REAL_IMAGE_ESTIMATED_COST_USD')),
    })
}

function readBenchmarkPolicy(readEnvironment: (name: string) => string | undefined): BenchmarkPolicy {
    return Object.freeze({
        allowedProfileIds: readProfileIdSet(readEnvironment('CREATURE_TRANSFORMATION_BENCHMARK_PROFILE_IDS')),
        reviewerProfileIds: readProfileIdSet(readEnvironment('CREATURE_TRANSFORMATION_BENCHMARK_REVIEWER_PROFILE_IDS')),
        generationProfiles: parseCreatureImageGenerationProfiles(readEnvironment('CREATURE_TRANSFORMATION_IMAGE_GENERATION_PROFILES_JSON')),
    })
}

function readVisualProgressionPolicy(readEnvironment: (name: string) => string | undefined) {
    const profileId = readEnvironment('CREATURE_VISUAL_PRODUCTION_GENERATION_PROFILE_ID')?.trim()
    return Object.freeze({
        enabled: readEnvironment('CREATURE_VISUAL_PROGRESSION_ENABLED') === 'true',
        productionGenerationEnabled: readEnvironment('CREATURE_VISUAL_PRODUCTION_GENERATION_ENABLED') === 'true',
        adoptionEnabled: readEnvironment('CREATURE_VISUAL_ADOPTION_ENABLED') === 'true',
        backgroundCleanupEnabled: readEnvironment('CREATURE_VISUAL_BACKGROUND_CLEANUP_ENABLED') === 'true',
        allowedProfileIds: readProfileIdSet(readEnvironment('CREATURE_VISUAL_PRODUCTION_PROFILE_IDS')),
        winsRequired: readCreatureVisualProgressionWinsRequired(readEnvironment('CREATURE_VISUAL_PROGRESSION_WINS_REQUIRED')),
        productionGenerationProfileId: profileId && /^[a-z][a-z0-9-]{1,63}$/.test(profileId) ? profileId : null,
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
    const dailyRealImageLimit = readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_DAILY_REAL_IMAGE_LIMIT'), DEFAULT_DAILY_REAL_IMAGE_LIMIT, 1, 100)
    const globalDailyRealImageLimit = readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_GLOBAL_DAILY_REAL_IMAGE_LIMIT'), DEFAULT_GLOBAL_DAILY_REAL_IMAGE_LIMIT, 1, 1000)
    const globalConcurrentRealImageLimit = readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_GLOBAL_CONCURRENT_REAL_IMAGE_LIMIT'), DEFAULT_GLOBAL_CONCURRENT_REAL_IMAGE_LIMIT, 1, 100)
    const realImageCooldownSeconds = readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_REAL_IMAGE_COOLDOWN_SECONDS'), DEFAULT_REAL_IMAGE_COOLDOWN_SECONDS, 0, 86400)

    return Object.freeze({ enabled, allowedConceptModes, allowedImageProviderModes, signedUrlTtlSeconds, dailyRequestLimit, dailyBudgetUsd, staleRequestSeconds, dailyRealImageLimit, globalDailyRealImageLimit, globalConcurrentRealImageLimit, realImageCooldownSeconds, realImage: readRealImagePolicy(readEnvironment), lineageExperimentAllowedProfileIds: readProfileIdSet(readEnvironment('CREATURE_TRANSFORMATION_LINEAGE_EXPERIMENT_PROFILE_IDS')), benchmark: readBenchmarkPolicy(readEnvironment), visualProgression: readVisualProgressionPolicy(readEnvironment) })
}
