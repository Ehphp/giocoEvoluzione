import type { BodyPlanMutationId } from './flux-evolution/body-plan-mutations.ts'
import type { CreatureBodyPlan } from './flux-evolution/body-plan-registry.ts'
import type { CreatureVisualProgressTrack } from './visual-progression.ts'
import type {
    CurrentCreatureVisualResponse,
    CreatureVisualVersion,
    PreviousCreatureTransformationSummary,
} from './creature-visual-versions.ts'
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
    /** Canonical biological height captured before generating the next visual version. */
    heightMeters: number
    previousTransformations: PreviousCreatureTransformationSummary[]
    /** Canonical topology: the starter body plan plus every adopted structural mutation. */
    bodyPlan: CreatureBodyPlan | null
    adoptedBodyPlanMutationIds: BodyPlanMutationId[]
    /** Non-canonical server-side observation of the current rendered visual, when available. */
    visualInspection?: VisualInspection | null
}

export interface CreatureIdentityResolver {
    resolve(input: { profileId: string; creatureId: string }): Promise<ResolvedCreatureSource>
}

export type GetTransformationRequestStatusRequest = {
    operation: 'GET_REQUEST_STATUS'
    transformationRequestId: string
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
    displayAssetWebpBase64?: string
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

/**
 * Rifiuta la proposta generata e chiude il percorso, restituendo le vittorie al contatore.
 * Senza questa operazione un percorso in `GENERATED` resta aperto per sempre e blocca ogni
 * evoluzione successiva della creatura.
 */
export type DiscardCreatureTransformationRequest = {
    operation: 'DISCARD_CREATURE_TRANSFORMATION'
    creatureId: string
    progressTrackId: string
    transformationRequestId: string
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
    | GenerateUnlockedTransformationRequest
    | SubmitBackgroundRemovalCandidateRequest
    | GetCreatureVisualProgressRequest
    | GetCurrentCreatureVisualRequest
    | GetGameCreatureVisualsRequest
    | AdoptCreatureTransformationRequest
    | DiscardCreatureTransformationRequest
    | RollbackCreatureVisualVersionRequest
