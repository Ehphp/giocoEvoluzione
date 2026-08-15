import type { EvolutionTargetId } from './evolution-targets.ts'
import type { BodyPlanMutationId } from './flux-evolution/body-plan-mutations.ts'
import type { CreatureBodyPlan } from './flux-evolution/body-plan-registry.ts'
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
    /** Canonical topology: the starter body plan plus every adopted structural mutation. */
    bodyPlan: CreatureBodyPlan | null
    adoptedBodyPlanMutationIds: BodyPlanMutationId[]
}

export interface CreatureIdentityResolver {
    resolve(input: {
        profileId: string
        creatureId: string
    }): Promise<ResolvedCreatureSource>
}

export type GetTransformationRequestStatusRequest = {
    operation: 'GET_REQUEST_STATUS'
    transformationRequestId: string
}

export type GetCreatureTransformationLabUsageRequest = {
    operation: 'GET_LAB_USAGE'
}

/** Paged owner-only archive of completed generated images in the transformation lab. */
export type GetGeneratedImageCatalogRequest = {
    operation: 'GET_GENERATED_IMAGE_CATALOG'
    page?: number
}

export type GenerateUnlockedTransformationRequest = {
    operation: 'GENERATE_UNLOCKED_TRANSFORMATION'
    creatureId: string
    progressTrackId: string
    idempotencyKey: string
}

/**
 * Lab-only FLUX step. It runs the production pipeline without touching a visual track, so a
 * chain of generations can be inspected before anything is adopted. Sources are request/version
 * IDs deliberately resolved by the server; storage paths and prompts never cross the boundary.
 */
export type GenerateFluxEvolutionChainStepRequest = {
    operation: 'GENERATE_FLUX_EVOLUTION_CHAIN_STEP'
    creatureId: string
    evolutionTargetId: EvolutionTargetId
    /** Lab-only A/B selection between the two server-owned prompt templates. */
    promptTemplateVersion?: 'flux-micro-v6' | 'flux-minimal-v1'
    /** Structural mutation, allowed only when the server policy enables the capability. */
    bodyPlanMutationId?: BodyPlanMutationId
    /** Final, processed experimental output from the immediately preceding step. */
    experimentalSourceRequestId?: string
    /** Server-owned productive visual used only for the first step. */
    sourceVisualVersionId?: string
    /** Completed FLUX steps whose snapshots must be preserved by the next prompt. */
    previousStepRequestIds: string[]
    idempotencyKey: string
}

export type SubmitBackgroundRemovalCandidateRequest = {
    operation: 'SUBMIT_BACKGROUND_REMOVAL_CANDIDATE'
    transformationRequestId: string
    candidatePngBase64: string
    displayAssetWebpBase64?: string
}

export type ListVisualBackgroundCleanupRequest = {
    operation: 'LIST_VISUAL_BACKGROUND_CLEANUP'
}

export type SubmitVisualBackgroundCleanupRequest = {
    operation: 'SUBMIT_VISUAL_BACKGROUND_CLEANUP'
    visualVersionId: string
    candidatePngBase64: string
    displayAssetWebpBase64?: string
}

export type SelectCreatureVisualProgressTrackRequest = {
    operation: 'SELECT_VISUAL_PROGRESS_TRACK'
    creatureId: string
    evolutionTargetId: EvolutionTargetId
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

export type CreatureTransformationRequest =
    | GetTransformationRequestStatusRequest
    | GetCreatureTransformationLabUsageRequest
    | GetGeneratedImageCatalogRequest
    | GenerateUnlockedTransformationRequest
    | GenerateFluxEvolutionChainStepRequest
    | SubmitBackgroundRemovalCandidateRequest
    | ListVisualBackgroundCleanupRequest
    | SubmitVisualBackgroundCleanupRequest
    | SelectCreatureVisualProgressTrackRequest
    | GetCreatureVisualProgressRequest
    | GetCurrentCreatureVisualRequest
    | GetGameCreatureVisualsRequest
    | AdoptCreatureTransformationRequest
    | RollbackCreatureVisualVersionRequest
