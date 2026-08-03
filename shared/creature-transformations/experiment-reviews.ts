import type { CreatureTransformationAssetReadiness } from './api-contracts.ts'
import type { CreaturePromptTemplateVersion } from './prompt-composer.ts'
import type { VisualTraitId } from './visual-traits.ts'

export const CREATURE_TRANSFORMATION_VISUAL_ISSUES = Object.freeze([
    'IDENTITY_LOST', 'FACE_CHANGED', 'EYES_CHANGED', 'POSE_CHANGED', 'SILHOUETTE_CHANGED', 'PALETTE_CHANGED',
    'UNREQUESTED_PALETTE_CHANGE', 'COLOR_EVOLUTION_TOO_WEAK', 'COLOR_EVOLUTION_INCOHERENT',
    'TRAIT_NOT_VISIBLE', 'TRAIT_TOO_STRONG', 'TRAIT_TOO_WEAK', 'ANATOMY_DEFORMED', 'EXTRA_LIMBS',
    'UNREQUESTED_OBJECT', 'BACKGROUND_INTRODUCED', 'STYLE_DRIFT', 'LOW_IMAGE_QUALITY', 'ALPHA_MISSING', 'CANVAS_INCORRECT',
] as const)

export type CreatureTransformationVisualIssue = (typeof CREATURE_TRANSFORMATION_VISUAL_ISSUES)[number]
export const EXPERIMENT_REVIEW_VERDICTS = Object.freeze(['REJECTED', 'PROMISING', 'ACCEPTABLE_EXPERIMENT', 'FINAL_ASSET_CANDIDATE'] as const)
export type ExperimentReviewVerdict = (typeof EXPERIMENT_REVIEW_VERDICTS)[number]
export type ExperimentReviewScore = 1 | 2 | 3 | 4 | 5
export type ExperimentReviewScores = Readonly<{
    identityPreservation: ExperimentReviewScore
    facePreservation: ExperimentReviewScore
    poseComposition: ExperimentReviewScore
    traitReadability: ExperimentReviewScore
    styleCoherence: ExperimentReviewScore
    anatomyQuality: ExperimentReviewScore
    technicalQuality: ExperimentReviewScore
    overall: ExperimentReviewScore
}>
export type ExperimentReviewClassification = 'PASS' | 'FAIL' | 'UNREVIEWED'
export type CreatureTransformationExperimentReview = Readonly<{
    transformationRequestId: string
    reviewerProfileId: string
    scores: ExperimentReviewScores
    verdict: ExperimentReviewVerdict
    issueFlags: readonly CreatureTransformationVisualIssue[]
    notes: string | null
    createdAt: string
    updatedAt: string
}>

export const DEFAULT_EXPERIMENT_REVIEW_CRITERIA = Object.freeze({
    identityPreservation: 4,
    facePreservation: 4,
    poseComposition: 4,
    traitReadability: 3,
    styleCoherence: 4,
    anatomyQuality: 4,
    overall: 4,
    blockingIssues: Object.freeze([
        'IDENTITY_LOST', 'FACE_CHANGED', 'ANATOMY_DEFORMED', 'EXTRA_LIMBS', 'UNREQUESTED_OBJECT',
        'UNREQUESTED_PALETTE_CHANGE', 'COLOR_EVOLUTION_TOO_WEAK', 'COLOR_EVOLUTION_INCOHERENT',
    ] as const),
})

const ISSUE_SET = new Set<string>(CREATURE_TRANSFORMATION_VISUAL_ISSUES)
const VERDICT_SET = new Set<string>(EXPERIMENT_REVIEW_VERDICTS)
const SCORE_FIELDS = Object.freeze(['identityPreservation', 'facePreservation', 'poseComposition', 'traitReadability', 'styleCoherence', 'anatomyQuality', 'technicalQuality', 'overall'] as const)

export function isExperimentReviewScore(value: unknown): value is ExperimentReviewScore {
    return value === 1 || value === 2 || value === 3 || value === 4 || value === 5
}

export function validateExperimentReviewInput(input: unknown): string | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return 'La review deve essere un oggetto.'
    const record = input as Record<string, unknown>
    if (!record.scores || typeof record.scores !== 'object' || Array.isArray(record.scores)) return 'I punteggi della review sono obbligatori.'
    const scores = record.scores as Record<string, unknown>
    if (Object.keys(scores).length !== SCORE_FIELDS.length || SCORE_FIELDS.some((field) => !isExperimentReviewScore(scores[field]))) return 'Ogni punteggio deve essere un intero da 1 a 5.'
    if (typeof record.verdict !== 'string' || !VERDICT_SET.has(record.verdict)) return 'Il verdict non e supportato.'
    if (!Array.isArray(record.issueFlags) || record.issueFlags.length > CREATURE_TRANSFORMATION_VISUAL_ISSUES.length || new Set(record.issueFlags).size !== record.issueFlags.length || !record.issueFlags.every((flag) => typeof flag === 'string' && ISSUE_SET.has(flag))) return 'Gli issue flag non appartengono al catalogo controllato.'
    if (record.notes !== undefined && (typeof record.notes !== 'string' || record.notes.trim().length > 2000)) return 'Le note devono contenere al massimo 2000 caratteri.'
    return null
}

export function classifyExperimentReview(review: Pick<CreatureTransformationExperimentReview, 'scores' | 'issueFlags'> | null): ExperimentReviewClassification {
    if (!review) return 'UNREVIEWED'
    const criteria = DEFAULT_EXPERIMENT_REVIEW_CRITERIA
    if (review.issueFlags.some((flag) => (criteria.blockingIssues as readonly string[]).includes(flag))) return 'FAIL'
    return review.scores.identityPreservation >= criteria.identityPreservation
        && review.scores.facePreservation >= criteria.facePreservation
        && review.scores.poseComposition >= criteria.poseComposition
        && review.scores.traitReadability >= criteria.traitReadability
        && review.scores.styleCoherence >= criteria.styleCoherence
        && review.scores.anatomyQuality >= criteria.anatomyQuality
        && review.scores.overall >= criteria.overall ? 'PASS' : 'FAIL'
}

export type CreatureTransformationBenchmarkMetricRecord = Readonly<{
    requestId: string
    benchmarkCaseId: string
    generationProfileId: string
    visualTraitId: VisualTraitId
    promptTemplateVersion: CreaturePromptTemplateVersion
    status: 'RESERVED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
    assetReadiness: CreatureTransformationAssetReadiness | null
    generationLatencyMs: number | null
    estimatedCostUsd: number | null
    actualCostUsd: number | null
    review: CreatureTransformationExperimentReview | null
}>

type NumericSummary = Readonly<{ mean: number | null, median: number | null, p95: number | null }>
export type CreatureTransformationBenchmarkMetrics = Readonly<{
    generated: number
    succeeded: number
    failed: number
    finalAssets: number
    experimentOnly: number
    scores: Readonly<Record<keyof ExperimentReviewScores, NumericSummary>>
    passRateByTrait: Readonly<Record<string, number | null>>
    passRateByGenerationProfile: Readonly<Record<string, number | null>>
    passRateByPromptTemplate: Readonly<Record<string, number | null>>
    latencyMs: NumericSummary
    estimatedCostUsdTotal: number
    actualCostUsdTotal: number | null
    estimatedCostUsdPerAcceptable: number | null
    issueFlagFrequency: Readonly<Record<string, number>>
}>

function numericSummary(values: readonly number[]): NumericSummary {
    if (!values.length) return { mean: null, median: null, p95: null }
    const sorted = [...values].sort((left, right) => left - right)
    const mean = values.reduce((total, value) => total + value, 0) / values.length
    const percentile = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))]
    return { mean, median: percentile(.5), p95: percentile(.95) }
}

function passRates(records: readonly CreatureTransformationBenchmarkMetricRecord[], key: (record: CreatureTransformationBenchmarkMetricRecord) => string): Record<string, number | null> {
    const groups = new Map<string, CreatureTransformationExperimentReview[]>()
    for (const record of records) {
        if (!record.review) continue
        const group = groups.get(key(record)) ?? []
        group.push(record.review)
        groups.set(key(record), group)
    }
    return Object.fromEntries([...groups.entries()].map(([group, reviews]) => [group, reviews.length ? reviews.filter((review) => classifyExperimentReview(review) === 'PASS').length / reviews.length : null]))
}

export function summarizeCreatureTransformationBenchmark(records: readonly CreatureTransformationBenchmarkMetricRecord[]): CreatureTransformationBenchmarkMetrics {
    const reviews = records.flatMap((record) => record.review ? [record.review] : [])
    const scoreSummary = Object.fromEntries(SCORE_FIELDS.map((field) => [field, numericSummary(reviews.map((review) => review.scores[field]))])) as Record<keyof ExperimentReviewScores, NumericSummary>
    const issueFlagFrequency: Record<string, number> = {}
    for (const review of reviews) for (const flag of review.issueFlags) issueFlagFrequency[flag] = (issueFlagFrequency[flag] ?? 0) + 1
    const estimatedCostUsdTotal = records.reduce((total, record) => total + (record.estimatedCostUsd ?? 0), 0)
    const actualCosts = records.flatMap((record) => record.actualCostUsd === null ? [] : [record.actualCostUsd])
    const acceptable = reviews.filter((review) => classifyExperimentReview(review) === 'PASS').length
    return {
        generated: records.length,
        succeeded: records.filter((record) => record.status === 'SUCCEEDED').length,
        failed: records.filter((record) => record.status === 'FAILED').length,
        finalAssets: records.filter((record) => record.assetReadiness === 'FINAL_ASSET').length,
        experimentOnly: records.filter((record) => record.assetReadiness === 'EXPERIMENT_ONLY').length,
        scores: scoreSummary,
        passRateByTrait: passRates(records, (record) => record.visualTraitId),
        passRateByGenerationProfile: passRates(records, (record) => record.generationProfileId),
        passRateByPromptTemplate: passRates(records, (record) => record.promptTemplateVersion),
        latencyMs: numericSummary(records.flatMap((record) => record.generationLatencyMs === null ? [] : [record.generationLatencyMs])),
        estimatedCostUsdTotal,
        actualCostUsdTotal: actualCosts.length ? actualCosts.reduce((total, value) => total + value, 0) : null,
        estimatedCostUsdPerAcceptable: acceptable ? estimatedCostUsdTotal / acceptable : null,
        issueFlagFrequency,
    }
}
