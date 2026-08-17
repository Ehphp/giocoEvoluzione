import type { EvolutionTargetId } from './evolution-targets.ts'
import type { SeedreamDiagnosticVariantId } from './seedream-diagnostic-variants.ts'
import type { BodyPlanMutationId } from './flux-evolution/body-plan-mutations.ts'
import type { CreatureBodyPlan } from './flux-evolution/body-plan-registry.ts'
import type { CreatureVisualProgressTrack } from './visual-progression.ts'
import type { CurrentCreatureVisualResponse, CreatureVisualVersion, PreviousCreatureTransformationSummary } from './creature-visual-versions.ts'
import type { VisualInspection } from './visual-inspection.ts'

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
    /** Non-canonical server-side observation of the current rendered visual, when available. */
    visualInspection?: VisualInspection | null
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
    promptTemplateVersion?: 'flux-micro-v7' | 'flux-micro-v6' | 'flux-micro-v5' | 'flux-minimal-v1'
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

/**
 * Authenticated Lab-only Seedream parity replay. It never enters the productive adoption path.
 * Source bytes are provided explicitly so an exact Playground PNG or JPEG can be reproduced.
 */
export type RunSeedreamDiagnosticRequest = {
    operation: 'RUN_SEEDREAM_DIAGNOSTIC'
    creatureId: string
    evolutionTargetId: EvolutionTargetId
    idempotencyKey: string
    experimentMode: SeedreamDiagnosticVariantId
    chainMode: 'NONE' | 'RAW_PROVIDER_CHAIN' | 'NORMALIZED_PROJECT_CHAIN'
    source: {
        base64: string
        mimeType: 'image/png' | 'image/jpeg'
        sourceVisualVersionId?: string
    }
    seedream: {
        imageSize: 'square_hd' | 'square' | 'portrait_4_3' | 'portrait_16_9' | 'landscape_4_3' | 'landscape_16_9' | 'auto_2K' | 'auto_4K' | { width: number, height: number }
        numImages?: number
        maxImages?: number
        seed?: number
        syncMode?: boolean
        enableSafetyChecker?: boolean
    }
    /** Accepted only by this diagnostic operation, never by productive generation. */
    fixedFullPrompt?: string
    /** Bypasses the generator, while the real flux-micro-v7 composer stays in use. */
    fixedMicroConcept?: {
        conceptName: string
        mutationIdea: string
        visualDetails: string[]
        avoid?: string[]
    }
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
    | RunSeedreamDiagnosticRequest
    | SubmitBackgroundRemovalCandidateRequest
    | ListVisualBackgroundCleanupRequest
    | SubmitVisualBackgroundCleanupRequest
    | SelectCreatureVisualProgressTrackRequest
    | GetCreatureVisualProgressRequest
    | GetCurrentCreatureVisualRequest
    | GetGameCreatureVisualsRequest
    | AdoptCreatureTransformationRequest
    | RollbackCreatureVisualVersionRequest
