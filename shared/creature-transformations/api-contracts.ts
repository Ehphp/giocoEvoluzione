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
import type { CurrentCreatureVisualResponse, CreatureVisualVersion, PreviousCreatureTransformationSummary } from './creature-visual-versions.ts'
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

export type SubmitExperimentReviewResponse = {
    success: true
    requestId: string
    review: CreatureTransformationExperimentReview
    classification: ExperimentReviewClassification
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
    currentVersion: Pick<CreatureVisualVersion, 'id' | 'versionNumber' | 'visualTraitId' | 'conceptName'>
    history: readonly PreviousCreatureTransformationSummary[]
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
}

export type GenerateImageErrorResponse = CreatureTransformationErrorResponse
export type GenerateImageApiResponse = GenerateImageResponse | GenerateImageAcceptedResponse | GenerateImageErrorResponse
export type CreatureTransformationApiResponse = GenerateConceptApiResponse | GenerateImageApiResponse | TransformationRequestStatusResponse | SubmitExperimentReviewResponse | GetBenchmarkResultsResponse | CreatureVisualProgressResponse | CurrentCreatureVisualApiResponse | GameCreatureVisualsResponse | AdoptCreatureTransformationResponse | RollbackCreatureVisualVersionResponse
