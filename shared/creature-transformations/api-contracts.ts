import type { ConceptEvaluation } from './concept-evaluation.ts'
import type { ConceptProblem } from './concept-validation.ts'
import type { CreatureTransformationConcept } from './concepts.ts'
import type { CreatureSemanticIdentity } from './contracts.ts'
import type { ImageValidationProblem } from './image-validator.ts'
import type { ComposedCreatureTransformationPrompt } from './prompt-composer.ts'
import type { TransformationRequestPersistence, TransformationRequestStatusPersistence } from './request-persistence.ts'
import type { CreatureTransformationBenchmarkCase } from './benchmark-plan.ts'
import type { CreatureImageGenerationProfile } from './image-generation-profiles.ts'
import type { CreatureTransformationBenchmarkMetrics, CreatureTransformationExperimentReview, ExperimentReviewClassification } from './experiment-reviews.ts'
import type { CurrentCreatureVisualResponse, CreatureVisualVersion, SelectableCreatureVisualVersion } from './creature-visual-versions.ts'
import type { CreatureVisualProgressTrack } from './visual-progression.ts'

export type CreatureTransformationAssetReadiness = 'FINAL_ASSET' | 'EXPERIMENT_ONLY'

export type GenerateConceptResponse = {
    success: true
    requestId: string
    identity: CreatureSemanticIdentity
    concept: CreatureTransformationConcept
    evaluation: ConceptEvaluation
    prompt: ComposedCreatureTransformationPrompt
    generation: {
        generator: string
        model?: string
        isMock: boolean
        attempts: number
        latencyMs: number
    }
    requestPersistence: TransformationRequestPersistence
}

export type CreatureTransformationErrorResponse = {
    success: false
    requestId: string
    code: string
    message: string
    problems?: Array<ConceptProblem | ImageValidationProblem>
    requestPersistence?: TransformationRequestPersistence
}

export type GenerateConceptErrorResponse = CreatureTransformationErrorResponse
export type GenerateConceptApiResponse = GenerateConceptResponse | GenerateConceptErrorResponse

export type GenerateImageResponse = {
    success: true
    requestId: string
    result: {
        signedUrl: string
        expiresAt: string
        mimeType: 'image/png'
        width: number
        height: number
        sha256: string
        assetReadiness: CreatureTransformationAssetReadiness
    }
    generation: {
        provider: string
        model: string
        isMock: boolean
        providerRequestId?: string
        latencyMs: number
        estimatedCostUsd?: number
    }
    validation: {
        warnings: string[]
    }
    requestPersistence: TransformationRequestPersistence
}

export type GenerateImageAcceptedResponse = {
    success: true
    accepted: true
    requestId: string
    requestPersistence: TransformationRequestPersistence
}

export type SubmitBackgroundRemovalCandidateResponse = {
    success: true
    requestId: string
    requestPersistence: TransformationRequestPersistence
    candidate: {
        assetReadiness: 'FINAL_ASSET'
        sha256: string
        mimeType: 'image/png'
        width: number
        height: number
        warnings: string[]
    }
}

export type ListVisualBackgroundCleanupResponse = {
    success: true
    requestId: string
    entries: Array<{
        visualVersionId: string
        creatureId: string
        profileId: string
        versionNumber: number
        signedUrl: string
        expiresAt: string
    }>
}

export type SubmitVisualBackgroundCleanupResponse = {
    success: true
    requestId: string
    visualVersionId: string
    creatureId: string
    versionNumber: number
}

export type SubmitExperimentReviewResponse = {
    success: true
    requestId: string
    review: CreatureTransformationExperimentReview
    classification: ExperimentReviewClassification
}
export type SubmitLineageComparisonReviewResponse = { success: true, requestId: string }

export type LineageComparisonReview = Readonly<{
    profileId: string
    creatureId: string
    lineageRequestId: string
    currentRequestId: string | null
    scores: { creativeSurprise: 1 | 2 | 3 | 4 | 5, targetTransformationStrength: 1 | 2 | 3 | 4 | 5, creatureContinuity: 1 | 2 | 3 | 4 | 5, lineagePreservation: 1 | 2 | 3 | 4 | 5, nonTargetStability: 1 | 2 | 3 | 4 | 5 }
    preferredResult: 'CURRENT' | 'LINEAGE_FIRST' | 'NONE'
    createdAt: string
    updatedAt: string
}>

export type GetLineageComparisonReviewsResponse = {
    success: true
    requestId: string
    reviews: readonly LineageComparisonReview[]
}

export type BenchmarkResultEntry = Readonly<{
    transformationRequestId: string
    benchmarkCaseId: string
    generationProfileId: string
    conceptSeed: string
    provider: string | null
    model: string | null
    quality: 'low' | 'medium' | 'high' | null
    promptTemplateVersion: string | null
    promptSha256: string | null
    visualTraitId: string | null
    intensity: number | null
    status: 'RESERVED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
    assetReadiness: CreatureTransformationAssetReadiness | null
    validationWarnings: string[]
    generationLatencyMs: number | null
    estimatedCostUsd: number | null
    actualCostUsd: number | null
    sourceSha256: string | null
    resultSha256: string | null
    result?: {
        signedUrl: string
        expiresAt: string
        mimeType: 'image/png'
        width: number
        height: number
    }
    review: CreatureTransformationExperimentReview | null
    classification: ExperimentReviewClassification
}>

export type GetBenchmarkResultsResponse = {
    success: true
    requestId: string
    catalog: {
        cases: readonly CreatureTransformationBenchmarkCase[]
        profiles: readonly CreatureImageGenerationProfile[]
        maxRealImageEstimatedCostUsd: number | null
    }
    entries: readonly BenchmarkResultEntry[]
    metrics: CreatureTransformationBenchmarkMetrics
}

export type CreatureVisualProgressResponse = Readonly<{
    success: true
    requestId: string
    track: CreatureVisualProgressTrack | null
    lastExperiment: { requestId: string; warnings: string[] } | null
    lastFailure: { requestId: string; code: string; message: string } | null
    currentVersion: Pick<CreatureVisualVersion, 'id' | 'versionNumber' | 'visualTraitId' | 'conceptName'>
    history: readonly SelectableCreatureVisualVersion[]
}>

export type CurrentCreatureVisualApiResponse = Readonly<{
    success: true
    requestId: string
    visual: CurrentCreatureVisualResponse
}>

export type GameCreatureVisualsResponse = Readonly<{
    success: true
    requestId: string
    player: CurrentCreatureVisualResponse
    opponent: CurrentCreatureVisualResponse | null
}>

export type AdoptCreatureTransformationResponse = Readonly<{
    success: true
    requestId: string
    version: Pick<CreatureVisualVersion, 'id' | 'versionNumber' | 'visualTraitId' | 'conceptName'>
}>

export type RollbackCreatureVisualVersionResponse = AdoptCreatureTransformationResponse

export type TransformationRequestStatusResponse = {
    success: true
    requestId: string
    requestPersistence: TransformationRequestStatusPersistence
    generation?: {
        provider: string
        model: string
        providerRequestId?: string
        latencyMs?: number
        estimatedCostUsd?: number
        actualCostUsd?: number
    }
    /** Available only for experimental A/B requests owned by the authenticated profile. */
    prompt?: {
        text: string
        sha256: string
    }
    result?: {
        signedUrl: string
        expiresAt: string
        width: number
        height: number
        mimeType: 'image/png'
        sha256: string
        assetReadiness: CreatureTransformationAssetReadiness
        warnings: string[]
    }
    rawResult?: {
        signedUrl: string
        expiresAt: string
        width: number
        height: number
        mimeType: 'image/png'
        sha256: string
    }
    error?: {
        code: string
        message: string
    }
    productPreview?: {
        progressTrackId: string
        sourceVisualVersionId: string
        visualTraitId: string
        conceptName: string
        evolutionaryFunction: string
        warnings: string[]
    }
    /** Lab-only metadata for an isolated FLUX step. */
    fluxSnapshot?: {
        conceptName: string
        mutationIdea: string
        evolutionTargetId: string
        evolutionFunction: string
    }
}

export type CreatureTransformationLabUsageResponse = Readonly<{
    success: true
    requestId: string
    usage: {
        requestCount: number
        requestLimit: number
        realImageCount: number
        realImageLimit: number
        globalRealImageCount: number
        globalRealImageLimit: number
        spentUsd: number
        budgetUsd: number
    }
}>

export type GeneratedImageCatalogResponse = Readonly<{
    success: true
    requestId: string
    page: number
    hasMore: boolean
    entries: readonly {
        transformationRequestId: string
        creatureId: string
        createdAt: string
        completedAt: string | null
        imageProviderMode: 'MOCK' | 'REAL' | null
        provider: string | null
        model: string | null
        promptTemplateVersion: string | null
        assetReadiness: CreatureTransformationAssetReadiness | null
        prompt: { text: string, sha256: string | null } | null
        result: {
            signedUrl: string
            expiresAt: string
            mimeType: 'image/png'
            width: number
            height: number
            sha256: string
        }
    }[]
}>

export type GenerateImageErrorResponse = CreatureTransformationErrorResponse
export type GenerateImageApiResponse = GenerateImageResponse | GenerateImageAcceptedResponse | GenerateImageErrorResponse
export type CreatureTransformationApiResponse = GenerateConceptApiResponse | GenerateImageApiResponse | TransformationRequestStatusResponse | CreatureTransformationLabUsageResponse | GeneratedImageCatalogResponse | SubmitBackgroundRemovalCandidateResponse | ListVisualBackgroundCleanupResponse | SubmitVisualBackgroundCleanupResponse | SubmitExperimentReviewResponse | SubmitLineageComparisonReviewResponse | GetLineageComparisonReviewsResponse | GetBenchmarkResultsResponse | CreatureVisualProgressResponse | CurrentCreatureVisualApiResponse | GameCreatureVisualsResponse | AdoptCreatureTransformationResponse | RollbackCreatureVisualVersionResponse
