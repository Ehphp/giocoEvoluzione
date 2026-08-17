import { readCreatureVisualProgressionWinsRequired } from '../../../shared/creature-transformations/visual-progression.ts'
import { DEFAULT_FAL_FLUX_MODEL, FAL_SEEDREAM_IMAGE_SIZE, FAL_SEEDREAM_MODEL } from './fal-flux-image-provider.ts'
import type { FluxPromptTemplateVersion } from './flux-image-generation-service.ts'

/**
 * Server-side policy of the FLUX evolution pipeline.
 *
 * There is one production pipeline, so there is no pipeline switch here. What the policy still
 * owns is access (who may spend money), the cost and quota envelope, and whether the structural
 * `BODY_PLAN_MUTATION` capability may be used at all — off by default, so normal gameplay can
 * never produce one.
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
const DEFAULT_FLUX_TIMEOUT_MS = 30_000
const DEFAULT_FAL_SUBMISSION_SOURCE_URL_TTL_SECONDS = 3_600

export type FluxPipelinePolicy = Readonly<{
    apiKey: string | null
    model: string
    timeoutMs: number
    submissionSourceUrlTtlSeconds: number
    promptTemplateVersion: FluxPromptTemplateVersion
    estimatedCostUsd: number | null
    maxEstimatedCostUsd: number | null
    microConceptApiKey: string | null
    microConceptModel: string | null
}>

export type CreatureEvolutionImagePipeline = 'flux' | 'seedream'

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

export type CreatureTransformationLabPolicy = Readonly<{
    enabled: boolean
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
    /** Profiles allowed to reach the internal Lab operations. A VITE flag is never sufficient. */
    labProfileIds: ReadonlySet<string>
    /** Defaults to FLUX so Seedream remains opt-in until production validation is complete. */
    imagePipeline: CreatureEvolutionImagePipeline
    flux: FluxPipelinePolicy
    seedream: SeedreamPipelinePolicy
    /** Structural topology changes. Disabled in production gameplay by default. */
    bodyPlanMutation: Readonly<{ enabled: boolean }>
    visualProgression: Readonly<{
        enabled: boolean
        productionGenerationEnabled: boolean
        adoptionEnabled: boolean
        backgroundCleanupEnabled: boolean
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

function readFluxPolicy(readEnvironment: (name: string) => string | undefined): FluxPipelinePolicy {
    const configuredPromptTemplateVersion = readEnvironment('FLUX_PROMPT_TEMPLATE_VERSION')
    const promptTemplateVersion: FluxPromptTemplateVersion = configuredPromptTemplateVersion === 'flux-minimal-v1'
        ? 'flux-minimal-v1'
        : configuredPromptTemplateVersion === 'flux-micro-v5'
            ? 'flux-micro-v5'
            : configuredPromptTemplateVersion === 'flux-micro-v6' ? 'flux-micro-v6' : 'flux-micro-v7'
    return Object.freeze({
        apiKey: readEnvironment('FAL_FLUX_API_KEY')?.trim() || readEnvironment('FAL_KEY')?.trim() || null,
        model: readEnvironment('FAL_FLUX_MODEL')?.trim() || DEFAULT_FAL_FLUX_MODEL,
        timeoutMs: readBoundedInteger(readEnvironment('FAL_FLUX_TIMEOUT_MS'), DEFAULT_FLUX_TIMEOUT_MS, 1_000, 180_000),
        submissionSourceUrlTtlSeconds: readBoundedInteger(readEnvironment('FAL_SUBMISSION_SOURCE_URL_TTL_SECONDS'), DEFAULT_FAL_SUBMISSION_SOURCE_URL_TTL_SECONDS, 300, 86_400),
        promptTemplateVersion,
        estimatedCostUsd: readRequiredPositiveUsd(readEnvironment('FAL_FLUX_ESTIMATED_COST_USD')),
        maxEstimatedCostUsd: readRequiredPositiveUsd(readEnvironment('FAL_FLUX_MAX_ESTIMATED_COST_USD')),
        microConceptApiKey: readEnvironment('OPENAI_API_KEY')?.trim() || null,
        microConceptModel: readEnvironment('FLUX_MICRO_CONCEPT_MODEL')?.trim() || readEnvironment('OPENAI_CONCEPT_MODEL')?.trim() || null,
    })
}

function readSeedreamPolicy(readEnvironment: (name: string) => string | undefined): SeedreamPipelinePolicy {
    return Object.freeze({
        apiKey: readEnvironment('FAL_SEEDREAM_API_KEY')?.trim() || readEnvironment('FAL_FLUX_API_KEY')?.trim() || readEnvironment('FAL_KEY')?.trim() || null,
        model: FAL_SEEDREAM_MODEL,
        timeoutMs: readBoundedInteger(readEnvironment('FAL_SEEDREAM_TIMEOUT_MS'), DEFAULT_FLUX_TIMEOUT_MS, 1_000, 180_000),
        submissionSourceUrlTtlSeconds: readBoundedInteger(readEnvironment('FAL_SEEDREAM_SUBMISSION_SOURCE_URL_TTL_SECONDS') ?? readEnvironment('FAL_SUBMISSION_SOURCE_URL_TTL_SECONDS'), DEFAULT_FAL_SUBMISSION_SOURCE_URL_TTL_SECONDS, 300, 86_400),
        // Seedream has its own billing envelope. Never borrow the FLUX estimate here.
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
        backgroundCleanupEnabled: readEnvironment('CREATURE_VISUAL_BACKGROUND_CLEANUP_ENABLED') === 'true',
        allowedProfileIds: readProfileIdSet(readEnvironment('CREATURE_VISUAL_PRODUCTION_PROFILE_IDS')),
        winsRequired: readCreatureVisualProgressionWinsRequired(readEnvironment('CREATURE_VISUAL_PROGRESSION_WINS_REQUIRED')),
    })
}

export function readCreatureTransformationLabPolicy(readEnvironment: (name: string) => string | undefined): CreatureTransformationLabPolicy {
    const configuredImagePipeline = readEnvironment('CREATURE_EVOLUTION_IMAGE_PIPELINE')?.trim().toLowerCase()
    return Object.freeze({
        enabled: readEnvironment('CREATURE_TRANSFORMATION_LAB_ENABLED') === 'true',
        signedUrlTtlSeconds: readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_SIGNED_URL_TTL_SECONDS'), DEFAULT_SIGNED_URL_TTL_SECONDS, 60, 3600),
        dailyRequestLimit: readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_DAILY_REQUEST_LIMIT'), DEFAULT_DAILY_REQUEST_LIMIT, 1, 1000),
        dailyBudgetUsd: readBoundedUsd(readEnvironment('CREATURE_TRANSFORMATION_DAILY_BUDGET_USD'), DEFAULT_DAILY_BUDGET_USD, 10000),
        staleRequestSeconds: readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_STALE_REQUEST_SECONDS'), DEFAULT_STALE_REQUEST_SECONDS, 60, 86400),
        dailyRealImageLimit: readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_DAILY_REAL_IMAGE_LIMIT'), DEFAULT_DAILY_REAL_IMAGE_LIMIT, 1, 1000),
        globalDailyRealImageLimit: readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_GLOBAL_DAILY_REAL_IMAGE_LIMIT'), DEFAULT_GLOBAL_DAILY_REAL_IMAGE_LIMIT, 1, 1000),
        globalConcurrentRealImageLimit: readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_GLOBAL_CONCURRENT_REAL_IMAGE_LIMIT'), DEFAULT_GLOBAL_CONCURRENT_REAL_IMAGE_LIMIT, 1, 100),
        realImageCooldownSeconds: readBoundedInteger(readEnvironment('CREATURE_TRANSFORMATION_REAL_IMAGE_COOLDOWN_SECONDS'), DEFAULT_REAL_IMAGE_COOLDOWN_SECONDS, 0, 86400),
        paidGenerationProfileIds: readProfileIdSet(readEnvironment('CREATURE_TRANSFORMATION_REAL_IMAGE_ALLOWED_PROFILE_IDS')),
        // The deployed variable is still the one that gated the internal experiments.
        labProfileIds: readProfileIdSet(readEnvironment('CREATURE_TRANSFORMATION_LAB_PROFILE_IDS') ?? readEnvironment('CREATURE_TRANSFORMATION_LINEAGE_EXPERIMENT_PROFILE_IDS')),
        imagePipeline: configuredImagePipeline === 'seedream' ? 'seedream' : 'flux',
        flux: readFluxPolicy(readEnvironment),
        seedream: readSeedreamPolicy(readEnvironment),
        bodyPlanMutation: Object.freeze({ enabled: readEnvironment('CREATURE_EVOLUTION_BODY_PLAN_MUTATION_ENABLED') === 'true' }),
        visualProgression: readVisualProgressionPolicy(readEnvironment),
    })
}
