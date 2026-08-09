import type { CreatureTransformationExperimentReview, ExperimentReviewScores, ExperimentReviewVerdict, CreatureTransformationVisualIssue } from '../../../shared/creature-transformations/experiment-reviews.ts'
import { validateExperimentReviewInput } from '../../../shared/creature-transformations/experiment-reviews.ts'
import type { CreatureTransformationAssetReadiness, LineageComparisonReview } from '../../../shared/creature-transformations/api-contracts.ts'
import type { TransformationRequestStatus } from '../../../shared/creature-transformations/request-persistence.ts'

type DatabaseError = { message?: string } | null
type SelectQuery = {
    eq(column: string, value: string): SelectQuery
    then<TResult1 = { data: unknown; error: DatabaseError }, TResult2 = never>(onfulfilled?: ((value: { data: unknown; error: DatabaseError }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2>
}

export interface ExperimentReviewRepositoryClient {
    rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: DatabaseError }>
    from(table: 'creature_transformation_experiment_reviews' | 'creature_transformation_lineage_comparison_reviews' | 'creature_transformation_requests'): {
        select(columns: string): SelectQuery
    }
}

export class ExperimentReviewRepositoryError extends Error {
    readonly code = 'EXPERIMENT_REVIEW_PERSISTENCE_FAILED'

    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options)
        this.name = 'ExperimentReviewRepositoryError'
    }
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readString(record: Record<string, unknown>, field: string, nullable = false): string | null {
    const value = record[field]
    if (value === null && nullable) return null
    return typeof value === 'string' ? value : null
}

function readScore(record: Record<string, unknown>, field: string): 1 | 2 | 3 | 4 | 5 | null {
    const value = record[field]
    return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : null
}

function mapReview(value: unknown): CreatureTransformationExperimentReview {
    const record = asRecord(Array.isArray(value) ? value[0] : value)
    if (!record) throw new ExperimentReviewRepositoryError('La review persistita non e valida.')
    const transformationRequestId = readString(record, 'transformation_request_id')
    const reviewerProfileId = readString(record, 'reviewer_profile_id')
    const verdict = readString(record, 'verdict') as ExperimentReviewVerdict | null
    const createdAt = readString(record, 'created_at')
    const updatedAt = readString(record, 'updated_at')
    const issueFlags = record.issue_flags
    const scores: ExperimentReviewScores | null = transformationRequestId && reviewerProfileId && verdict && createdAt && updatedAt
        ? {
            identityPreservation: readScore(record, 'identity_preservation_score')!, facePreservation: readScore(record, 'face_preservation_score')!,
            poseComposition: readScore(record, 'pose_composition_score')!, traitReadability: readScore(record, 'trait_readability_score')!,
            styleCoherence: readScore(record, 'style_coherence_score')!, anatomyQuality: readScore(record, 'anatomy_quality_score')!,
            technicalQuality: readScore(record, 'technical_quality_score')!, overall: readScore(record, 'overall_score')!,
        }
        : null
    if (!scores || Object.values(scores).some((score) => score === undefined) || !Array.isArray(issueFlags)) throw new ExperimentReviewRepositoryError('La review persistita non e completa.')
    const inputError = validateExperimentReviewInput({ scores, verdict, issueFlags, ...(readString(record, 'notes', true) ? { notes: readString(record, 'notes', true)! } : {}) })
    if (inputError) throw new ExperimentReviewRepositoryError('La review persistita non rispetta il contratto controllato.')
    return Object.freeze({ transformationRequestId, reviewerProfileId, scores, verdict, issueFlags: [...issueFlags] as CreatureTransformationVisualIssue[], notes: readString(record, 'notes', true), createdAt, updatedAt })
}

function mapLineageComparisonReview(value: unknown): LineageComparisonReview {
    const row = asRecord(value)
    const profileId = row ? readString(row, 'profile_id') : null
    const creatureId = row ? readString(row, 'creature_id') : null
    const lineageRequestId = row ? readString(row, 'lineage_request_id') : null
    const currentRequestId = row ? readString(row, 'current_request_id', true) : null
    const preferredResult = row ? readString(row, 'preferred_result') : null
    const createdAt = row ? readString(row, 'created_at') : null
    const updatedAt = row ? readString(row, 'updated_at') : null
    const scores = row ? {
        creativeSurprise: readScore(row, 'creative_surprise_score'), targetTransformationStrength: readScore(row, 'target_transformation_strength_score'),
        creatureContinuity: readScore(row, 'creature_continuity_score'), lineagePreservation: readScore(row, 'lineage_preservation_score'), nonTargetStability: readScore(row, 'non_target_stability_score'),
    } : null
    if (!profileId || !creatureId || !lineageRequestId || !createdAt || !updatedAt || !scores || Object.values(scores).some((score) => score === null) || !['CURRENT', 'LINEAGE_FIRST', 'NONE'].includes(preferredResult ?? '')) {
        throw new ExperimentReviewRepositoryError('La review A/B lineage-first persistita non e valida.')
    }
    return Object.freeze({ profileId, creatureId, lineageRequestId, currentRequestId, scores: scores as LineageComparisonReview['scores'], preferredResult: preferredResult as LineageComparisonReview['preferredResult'], createdAt, updatedAt })
}

export type SubmitExperimentReviewRepositoryInput = Readonly<{
    transformationRequestId: string
    reviewerProfileId: string
    scores: ExperimentReviewScores
    verdict: ExperimentReviewVerdict
    issueFlags: readonly CreatureTransformationVisualIssue[]
    notes?: string
}>

export type BenchmarkRequestRecord = Readonly<{
    id: string
    benchmarkCaseId: string
    generationProfileId: string
    conceptSeed: string
    provider: string | null
    model: string | null
    generationQuality: 'low' | 'medium' | 'high' | null
    promptTemplateVersion: string | null
    promptSha256: string | null
    visualTraitId: string | null
    intensity: number | null
    status: TransformationRequestStatus
    assetReadiness: CreatureTransformationAssetReadiness | null
    validationWarnings: string[]
    generationLatencyMs: number | null
    estimatedCostUsd: number | null
    actualCostUsd: number | null
    sourceSha256: string | null
    resultSha256: string | null
    resultPath: string | null
    resultMimeType: 'image/png' | null
    resultWidth: number | null
    resultHeight: number | null
}>

function readNumber(record: Record<string, unknown>, field: string, nullable = false): number | null {
    const value = record[field]
    if (value === null && nullable) return null
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
    return Number.isFinite(parsed) ? parsed : null
}

function mapBenchmarkRequest(value: unknown): BenchmarkRequestRecord | null {
    const record = asRecord(value)
    if (!record) return null
    const id = readString(record, 'id')
    const benchmarkCaseId = readString(record, 'benchmark_case_id', true)
    const generationProfileId = readString(record, 'generation_profile_id', true)
    const conceptSeed = readString(record, 'concept_seed', true)
    const status = readString(record, 'status') as TransformationRequestStatus | null
    if (!id || !benchmarkCaseId || !generationProfileId || !conceptSeed || !['RESERVED', 'RUNNING', 'SUCCEEDED', 'FAILED'].includes(status ?? '')) return null
    const warnings = Array.isArray(record.validation_warnings) && record.validation_warnings.every((warning) => typeof warning === 'string') ? [...record.validation_warnings] : []
    return Object.freeze({
        id, benchmarkCaseId, generationProfileId, conceptSeed, provider: readString(record, 'provider', true), model: readString(record, 'model', true),
        generationQuality: readString(record, 'generation_quality', true) as BenchmarkRequestRecord['generationQuality'],
        promptTemplateVersion: readString(record, 'prompt_template_version', true), promptSha256: readString(record, 'prompt_sha256', true),
        visualTraitId: readString(record, 'visual_trait_id', true), intensity: readNumber(record, 'intensity', true), status,
        assetReadiness: readString(record, 'asset_readiness', true) as CreatureTransformationAssetReadiness | null, validationWarnings: warnings,
        generationLatencyMs: readNumber(record, 'generation_latency_ms', true), estimatedCostUsd: readNumber(record, 'estimated_cost_usd', true), actualCostUsd: readNumber(record, 'actual_cost_usd', true),
        sourceSha256: readString(record, 'source_sha256', true), resultSha256: readString(record, 'result_sha256', true), resultPath: readString(record, 'result_path', true),
        resultMimeType: readString(record, 'result_mime_type', true) as 'image/png' | null, resultWidth: readNumber(record, 'result_width', true), resultHeight: readNumber(record, 'result_height', true),
    })
}

export class SupabaseExperimentReviewRepository {
    constructor(private readonly client: ExperimentReviewRepositoryClient) {}

    async upsert(input: SubmitExperimentReviewRepositoryInput): Promise<CreatureTransformationExperimentReview> {
        let response: { data: unknown; error: DatabaseError }
        try {
            response = await this.client.rpc('upsert_creature_transformation_experiment_review', {
                p_transformation_request_id: input.transformationRequestId, p_reviewer_profile_id: input.reviewerProfileId,
                p_identity_preservation_score: input.scores.identityPreservation, p_face_preservation_score: input.scores.facePreservation,
                p_pose_composition_score: input.scores.poseComposition, p_trait_readability_score: input.scores.traitReadability,
                p_style_coherence_score: input.scores.styleCoherence, p_anatomy_quality_score: input.scores.anatomyQuality,
                p_technical_quality_score: input.scores.technicalQuality, p_overall_score: input.scores.overall,
                p_verdict: input.verdict, p_issue_flags: [...input.issueFlags], p_notes: input.notes ?? null,
            })
        } catch (error) {
            throw new ExperimentReviewRepositoryError('Non e stato possibile salvare la review.', { cause: error })
        }
        if (response.error) throw new ExperimentReviewRepositoryError('Non e stato possibile salvare la review.', { cause: response.error })
        return mapReview(response.data)
    }

    async listForReviewer(profileId: string): Promise<CreatureTransformationExperimentReview[]> {
        let response: { data: unknown; error: DatabaseError }
        try {
            response = await this.client.from('creature_transformation_experiment_reviews').select('*').eq('reviewer_profile_id', profileId)
        } catch (error) {
            throw new ExperimentReviewRepositoryError('Non e stato possibile leggere le review.', { cause: error })
        }
        if (response.error || !Array.isArray(response.data)) throw new ExperimentReviewRepositoryError('Non e stato possibile leggere le review.', { cause: response.error ?? undefined })
        return response.data.map(mapReview)
    }

    async listRequestRecordsForProfile(profileId: string): Promise<BenchmarkRequestRecord[]> {
        let response: { data: unknown; error: DatabaseError }
        try {
            response = await this.client.from('creature_transformation_requests').select('*').eq('profile_id', profileId)
        } catch (error) {
            throw new ExperimentReviewRepositoryError('Non e stato possibile leggere i risultati benchmark.', { cause: error })
        }
        if (response.error || !Array.isArray(response.data)) throw new ExperimentReviewRepositoryError('Non e stato possibile leggere i risultati benchmark.', { cause: response.error ?? undefined })
        return response.data.flatMap((row) => {
            const record = mapBenchmarkRequest(row)
            return record ? [record] : []
        })
    }

    async upsertLineageComparison(input: { profileId: string, creatureId: string, lineageRequestId: string, currentRequestId?: string, scores: { creativeSurprise: number, targetTransformationStrength: number, creatureContinuity: number, lineagePreservation: number, nonTargetStability: number }, preferredResult: 'CURRENT' | 'LINEAGE_FIRST' | 'NONE' }): Promise<void> {
        const { error } = await this.client.rpc('upsert_creature_transformation_lineage_comparison_review', {
            p_profile_id: input.profileId, p_creature_id: input.creatureId, p_lineage_request_id: input.lineageRequestId, p_current_request_id: input.currentRequestId ?? null,
            p_creative_surprise_score: input.scores.creativeSurprise, p_target_transformation_strength_score: input.scores.targetTransformationStrength, p_creature_continuity_score: input.scores.creatureContinuity, p_lineage_preservation_score: input.scores.lineagePreservation, p_non_target_stability_score: input.scores.nonTargetStability, p_preferred_result: input.preferredResult,
        })
        if (error) throw new ExperimentReviewRepositoryError('Non e stato possibile salvare la review A/B lineage-first.', { cause: error })
    }

    async listLineageComparisons(): Promise<LineageComparisonReview[]> {
        let response: { data: unknown; error: DatabaseError }
        try {
            response = await this.client.from('creature_transformation_lineage_comparison_reviews').select('*')
        } catch (error) {
            throw new ExperimentReviewRepositoryError('Non e stato possibile leggere le review A/B lineage-first.', { cause: error })
        }
        if (response.error || !Array.isArray(response.data)) throw new ExperimentReviewRepositoryError('Non e stato possibile leggere le review A/B lineage-first.', { cause: response.error ?? undefined })
        return response.data.map(mapLineageComparisonReview).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    }
}
