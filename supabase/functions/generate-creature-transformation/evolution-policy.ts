import { readCreatureVisualProgressionWinsRequired } from '../../../shared/creature-transformations/visual-progression.ts'
import { FAL_SEEDREAM_IMAGE_SIZE, FAL_SEEDREAM_MODEL } from './fal-flux-image-provider.ts'

/**
 * Server-side policy of the creature evolution pipeline.
 *
 * There is one production pipeline — Seedream for the image, an LLM micro-concept for the prompt —
 * so there is no pipeline switch here. What the policy owns is access (who may spend money), the
 * cost and quota envelope, and whether the structural `BODY_PLAN_MUTATION` capability may be used
 * at all — off by default, so normal gameplay can never produce one.
 */

const DEFAULT_SIGNED_URL_TTL_SECONDS = 300
const DEFAULT_DAILY_REQUEST_LIMIT = 10
const DEFAULT_DAILY_BUDGET_USD = 0
// Fal Queue can legitimately wait for a worker. This must outlive the signed source URL, or the
// stale-request reaper would terminally fail a healthy queued job before its callback arrives.
const DEFAULT_STALE_REQUEST_SECONDS = 3_900
const DEFAULT_DAILY_REAL_IMAGE_LIMIT = 3
const DEFAULT_GLOBAL_DAILY_REAL_IMAGE_LIMIT = 10
const DEFAULT_GLOBAL_CONCURRENT_REAL_IMAGE_LIMIT = 2
const DEFAULT_REAL_IMAGE_COOLDOWN_SECONDS = 60
const DEFAULT_FAL_TIMEOUT_MS = 30_000
const DEFAULT_FAL_SUBMISSION_SOURCE_URL_TTL_SECONDS = 3_600

/**
 * The prompt is written by an LLM before the image provider is called, so its credentials are a
 * hard requirement of the pipeline rather than an optional enrichment.
 */
export type MicroConceptPolicy = Readonly<{
    apiKey: string | null
    model: string | null
}>

/**
 * The production Seedream contract is deliberately smaller than the Lab contract:
 * one portrait image, no seed/sync controls, and the provider's safety checker on.
 * Keeping it here makes the persisted queue workflow independent from later env edits.
 */
export type SeedreamPipelinePolicy = Readonly<{
    apiKey: string | null
    model: typeof FAL_SEEDREAM_MODEL
    timeoutMs: number
    submissionSourceUrlTtlSeconds: number
    estimatedCostUsd: number | null
    maxEstimatedCostUsd: number | null
    /** Explicit production-test switch. Defaults off even when body-plan mutations are enabled globally. */
    structuralMutationsEnabled: boolean
    parameters: Readonly<{
        imageSize: Readonly<{ width: number, height: number }>
    }>
}>

export type CreatureEvolutionPolicy = Readonly<{
    signedUrlTtlSeconds: number
    dailyRequestLimit: number
    dailyBudgetUsd: number
    staleRequestSeconds: number
    dailyRealImageLimit: number
    globalDailyRealImageLimit: number
    globalConcurrentRealImageLimit: number
    realImageCooldownSeconds: number
    /** Profiles allowed to spend on image generation, beside the `can_generate_images` flag. */
    paidGenerationProfileIds: ReadonlySet<string>
    microConcept: MicroConceptPolicy
    seedream: SeedreamPipelinePolicy
    /** Structural topology changes. Disabled in production gameplay by default. */
    bodyPlanMutation: Readonly<{ enabled: boolean }>
    visualProgression: Readonly<{
        enabled: boolean
        productionGenerationEnabled: boolean
        adoptionEnabled: boolean
        allowedProfileIds: ReadonlySet<string>
        winsRequired: number
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

function readMicroConceptPolicy(readEnvironment: (name: string) => string | undefined): MicroConceptPolicy {
    return Object.freeze({
        apiKey: readEnvironment('OPENAI_API_KEY')?.trim() || null,
        model: readEnvironment('FLUX_MICRO_CONCEPT_MODEL')?.trim() || readEnvironment('OPENAI_CONCEPT_MODEL')?.trim() || null,
    })
}

function readSeedreamPolicy(readEnvironment: (name: string) => string | undefined): SeedreamPipelinePolicy {
    return Object.freeze({
        apiKey: readEnvironment('FAL_SEEDREAM_API_KEY')?.trim() || readEnvironment('FAL_FLUX_API_KEY')?.trim() || readEnvironment('FAL_KEY')?.trim() || null,
        model: FAL_SEEDREAM_MODEL,
        timeoutMs: readBoundedInteger(readEnvironment('FAL_SEEDREAM_TIMEOUT_MS'), DEFAULT_FAL_TIMEOUT_MS, 1_000, 180_000),
        submissionSourceUrlTtlSeconds: readBoundedInteger(readEnvironment('FAL_SEEDREAM_SUBMISSION_SOURCE_URL_TTL_SECONDS') ?? readEnvironment('FAL_SUBMISSION_SOURCE_URL_TTL_SECONDS'), DEFAULT_FAL_SUBMISSION_SOURCE_URL_TTL_SECONDS, 300, 86_400),
        // Seedream owns its billing envelope: these two variables are required, never defaulted.
        estimatedCostUsd: readRequiredPositiveUsd(readEnvironment('SEEDREAM_ESTIMATED_COST_PER_GENERATION')),
        maxEstimatedCostUsd: readRequiredPositiveUsd(readEnvironment('SEEDREAM_MAX_ESTIMATED_COST_PER_GENERATION')),
        structuralMutationsEnabled: readEnvironment('SEEDREAM_STRUCTURAL_MUTATIONS_ENABLED') === 'true',
        parameters: Object.freeze({ imageSize: Object.freeze({ ...FAL_SEEDREAM_IMAGE_SIZE }) }),
    })
}

function readVisualProgressionPolicy(readEnvironment: (name: string) => string | undefined) {
    return Object.freeze({
        enabled: readEnvironment('CREATURE_VISUAL_PROGRESSION_ENABLED') === 'true',
        productionGenerationEnabled: readEnvironment('CREATURE_VISUAL_PRODUCTION_GENERATION_ENABLED') === 'true',
        adoptionEnabled: readEnvironment('CREATURE_VISUAL_ADOPTION_ENABLED') === 'true',
        allowedProfileIds: readProfileIdSet(readEnvironment('CREATURE_VISUAL_PRODUCTION_PROFILE_IDS')),
        winsRequired: readCreatureVisualProgressionWinsRequired(readEnvironment('CREATURE_VISUAL_PROGRESSION_WINS_REQUIRED')),
    })
}

export function readCreatureEvolutionPolicy(readEnvironment: (name: string) => string | undefined): CreatureEvolutionPolicy {
    return Object.freeze({
        signedUrlTtlSeconds: readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_SIGNED_URL_TTL_SECONDS'), DEFAULT_SIGNED_URL_TTL_SECONDS, 60, 3600),
        dailyRequestLimit: readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_DAILY_REQUEST_LIMIT'), DEFAULT_DAILY_REQUEST_LIMIT, 1, 1000),
        dailyBudgetUsd: readBoundedUsd(readEnvironment('CREATURE_TRANSFORMATION_DAILY_BUDGET_USD'), DEFAULT_DAILY_BUDGET_USD, 10000),
        staleRequestSeconds: readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_STALE_REQUEST_SECONDS'), DEFAULT_STALE_REQUEST_SECONDS, 60, 86400),
        dailyRealImageLimit: readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_DAILY_REAL_IMAGE_LIMIT'), DEFAULT_DAILY_REAL_IMAGE_LIMIT, 1, 1000),
        globalDailyRealImageLimit: readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_GLOBAL_DAILY_REAL_IMAGE_LIMIT'), DEFAULT_GLOBAL_DAILY_REAL_IMAGE_LIMIT, 1, 1000),
        globalConcurrentRealImageLimit: readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_GLOBAL_CONCURRENT_REAL_IMAGE_LIMIT'), DEFAULT_GLOBAL_CONCURRENT_REAL_IMAGE_LIMIT, 1, 100),
        realImageCooldownSeconds: readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_REAL_IMAGE_COOLDOWN_SECONDS'), DEFAULT_REAL_IMAGE_COOLDOWN_SECONDS, 0, 86400),
        paidGenerationProfileIds: readProfileIdSet(readEnvironment('CREATURE_TRANSFORMATION_REAL_IMAGE_ALLOWED_PROFILE_IDS')),
        microConcept: readMicroConceptPolicy(readEnvironment),
        seedream: readSeedreamPolicy(readEnvironment),
        bodyPlanMutation: Object.freeze({ enabled: readEnvironment('CREATURE_EVOLUTION_BODY_PLAN_MUTATION_ENABLED') === 'true' }),
        visualProgression: readVisualProgressionPolicy(readEnvironment),
    })
}
