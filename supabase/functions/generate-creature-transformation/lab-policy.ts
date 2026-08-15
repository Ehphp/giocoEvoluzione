import { readCreatureVisualProgressionWinsRequired } from '../../../shared/creature-transformations/visual-progression.ts'
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
const DEFAULT_STALE_REQUEST_SECONDS = 900
const DEFAULT_DAILY_REAL_IMAGE_LIMIT = 3
const DEFAULT_GLOBAL_DAILY_REAL_IMAGE_LIMIT = 10
const DEFAULT_GLOBAL_CONCURRENT_REAL_IMAGE_LIMIT = 2
const DEFAULT_REAL_IMAGE_COOLDOWN_SECONDS = 60
const DEFAULT_FLUX_MODEL = 'fal-ai/bytedance/seedream/v4.5/edit'
const DEFAULT_FLUX_TIMEOUT_MS = 30_000

export type FluxPipelinePolicy = Readonly<{
    apiKey: string | null
    model: string
    timeoutMs: number
    promptTemplateVersion: FluxPromptTemplateVersion
    estimatedCostUsd: number | null
    maxEstimatedCostUsd: number | null
    microConceptApiKey: string | null
    microConceptModel: string | null
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
    flux: FluxPipelinePolicy
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
    return Object.freeze({
        apiKey: readEnvironment('FAL_FLUX_API_KEY')?.trim() || readEnvironment('FAL_KEY')?.trim() || null,
        model: readEnvironment('FAL_FLUX_MODEL')?.trim() || DEFAULT_FLUX_MODEL,
        timeoutMs: readBoundedInteger(readEnvironment('FAL_FLUX_TIMEOUT_MS'), DEFAULT_FLUX_TIMEOUT_MS, 1_000, 180_000),
        promptTemplateVersion: configuredPromptTemplateVersion === 'flux-minimal-v1' ? 'flux-minimal-v1' : 'flux-micro-v6',
        estimatedCostUsd: readRequiredPositiveUsd(readEnvironment('FAL_FLUX_ESTIMATED_COST_USD')),
        maxEstimatedCostUsd: readRequiredPositiveUsd(readEnvironment('FAL_FLUX_MAX_ESTIMATED_COST_USD')),
        microConceptApiKey: readEnvironment('OPENAI_API_KEY')?.trim() || null,
        microConceptModel: readEnvironment('FLUX_MICRO_CONCEPT_MODEL')?.trim() || readEnvironment('OPENAI_CONCEPT_MODEL')?.trim() || null,
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
        flux: readFluxPolicy(readEnvironment),
        bodyPlanMutation: Object.freeze({ enabled: readEnvironment('CREATURE_EVOLUTION_BODY_PLAN_MUTATION_ENABLED') === 'true' }),
        visualProgression: readVisualProgressionPolicy(readEnvironment),
    })
}
