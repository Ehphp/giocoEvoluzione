import type { CreatureTransformationConcept, TransformationIntensity } from './concepts.ts'
import type { VisualTraitId } from './visual-traits.ts'
import type { ExperimentReviewScores, ExperimentReviewVerdict, CreatureTransformationVisualIssue } from './experiment-reviews.ts'
import type { CreatureVisualProgressTrack } from './visual-progression.ts'
import type { CurrentCreatureVisualResponse, CreatureVisualVersion, PreviousCreatureTransformationSummary } from './creature-visual-versions.ts'

export type CreatureSemanticIdentity = {
    creatureId: string
    baseCreatureKey: string
    description: string
    /** Structural traits that must survive every evolution. */
    identityFeatures: string[]
    /** Current, intentionally mutable visual traits such as body colour and palette. */
    mutableVisualFeatures: string[]
    styleDefinition: string
}

export type ResolvedCreatureSource = {
    identity: CreatureSemanticIdentity
    sourceImagePath: string
    sourceSha256: string
    sourceIsBaseVersion: boolean
    currentVisualVersionId: string
    currentVersionNumber: number
    previousTransformations: PreviousCreatureTransformationSummary[]
}

export interface CreatureIdentityResolver {
    resolve(input: {
        profileId: string
        creatureId: string
    }): Promise<ResolvedCreatureSource>
}

export type GenerateConceptRequest = {
    operation: 'GENERATE_CONCEPT'
    creatureId: string
    visualTraitId: VisualTraitId
    intensity: TransformationIntensity
    conceptMode: 'MOCK' | 'AI'
    idempotencyKey: string
    benchmarkCaseId?: string
}

export type GenerateImageRequest = {
    operation: 'GENERATE_IMAGE'
    creatureId: string
    concept: CreatureTransformationConcept
    imageProviderMode: 'MOCK' | 'REAL'
    idempotencyKey: string
    benchmarkCaseId?: string
    generationProfileId?: string
}

export type GetTransformationRequestStatusRequest = {
    operation: 'GET_REQUEST_STATUS'
    transformationRequestId: string
}

export type SubmitExperimentReviewRequest = {
    operation: 'SUBMIT_EXPERIMENT_REVIEW'
    transformationRequestId: string
    scores: ExperimentReviewScores
    verdict: ExperimentReviewVerdict
    issueFlags: CreatureTransformationVisualIssue[]
    notes?: string
}

export type GetBenchmarkResultsRequest = {
    operation: 'GET_BENCHMARK_RESULTS'
}

export type GenerateUnlockedTransformationRequest = {
    operation: 'GENERATE_UNLOCKED_TRANSFORMATION'
    creatureId: string
    progressTrackId: string
    idempotencyKey: string
}

export type SubmitBackgroundRemovalCandidateRequest = {
    operation: 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE'
    transformationRequestId: string
    candidatePngBase64: string
}


export type SelectCreatureVisualProgressTrackRequest = {
    operation: 'SELECT_VISUAL_PROGRESS_TRACK'
    creatureId: string
    visualTraitId: VisualTraitId
}

export type GetCreatureVisualProgressRequest = {
    operation: 'GET_VISUAL_PROGRESS'
    creatureId: string
}

export type GetCurrentCreatureVisualRequest = {
    operation: 'GET_CURRENT_VISUAL'
    creatureId: string
}

export type GetGameCreatureVisualsRequest = {
    operation: 'GET_GAME_VISUALS'
    gameId: string
}

export type AdoptCreatureTransformationRequest = {
    operation: 'ADOPT_CREATURE_TRANSFORMATION'
    creatureId: string
    progressTrackId: string
    transformationRequestId: string
    expectedCurrentVisualVersionId: string
}

export type RollbackCreatureVisualVersionRequest = {
    operation: 'ROLLBACK_CREATURE_VISUAL_VERSION'
    creatureId: string
    targetVersionId: string
    expectedCurrentVisualVersionId: string
}

export type GetCreatureVisualProgressResponse = Readonly<{
    track: CreatureVisualProgressTrack | null
    currentVersion: Pick<CreatureVisualVersion, 'id' | 'versionNumber' | 'visualTraitId' | 'conceptName'>
    history: PreviousCreatureTransformationSummary[]
}>

export type GetCurrentCreatureVisualResponse = CurrentCreatureVisualResponse

export type CreatureTransformationRequest = GenerateConceptRequest | GenerateImageRequest | GetTransformationRequestStatusRequest | SubmitExperimentReviewRequest | GetBenchmarkResultsRequest | GenerateUnlockedTransformationRequest | SubmitBackgroundRemovalCandidateRequest | SelectCreatureVisualProgressTrackRequest | GetCreatureVisualProgressRequest | GetCurrentCreatureVisualRequest | GetGameCreatureVisualsRequest | AdoptCreatureTransformationRequest | RollbackCreatureVisualVersionRequest
