import type { EvolutionTargetId } from './evolution-targets.ts'
import type { BodyPlanId } from './flux-evolution/body-plan-registry.ts'
import type { BodyPlanMutationId, EvolutionCapability } from './flux-evolution/body-plan-mutations.ts'
import type { FluxMicroConcept } from './flux-evolution/micro-concept.ts'
import type { ImageValidationProblem } from './image-validator.ts'
import type { TransformationRequestPersistence, TransformationRequestStatusPersistence } from './request-persistence.ts'
import type { SeedreamDiagnosticConceptSource, SeedreamDiagnosticPromptStrategy, SeedreamDiagnosticVariantId } from './seedream-diagnostic-variants.ts'
import type { CurrentCreatureVisualResponse, CreatureVisualVersion, SelectableCreatureVisualVersion } from './creature-visual-versions.ts'
import type { CreatureVisualProgressTrack } from './visual-progression.ts'

export type CreatureTransformationAssetReadiness = 'FINAL_ASSET' | 'EXPERIMENT_ONLY'

export type CreatureTransformationErrorResponse = {
    success: false
    requestId: string
    code: string
    message: string
    problems?: ImageValidationProblem[]
    requestPersistence?: TransformationRequestPersistence
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

export type CreatureVisualProgressResponse = Readonly<{
    success: true
    requestId: string
    track: CreatureVisualProgressTrack | null
    lastExperiment: { requestId: string; warnings: string[] } | null
    lastFailure: { requestId: string; code: string; message: string } | null
    currentVersion: Pick<CreatureVisualVersion, 'id' | 'versionNumber' | 'visualTraitId' | 'conceptName'> & Readonly<{
        /** Derived from the current version's persisted visual inspection; absent for legacy versions. */
        shortDescription?: string | null
    }>
    history: readonly SelectableCreatureVisualVersion[]
    /** Canonical anatomical state and the targets it offers. */
    bodyPlan: {
        id: BodyPlanId
        label: string
        availableEvolutionTargets: readonly EvolutionTargetId[]
        adoptedBodyPlanMutationIds: readonly BodyPlanMutationId[]
    } | null
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
    /** The canonical body plan after adoption; a structural mutation changes it. */
    bodyPlanId: BodyPlanId | null
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
    /** Available only for experimental Lab requests owned by the authenticated profile. */
    prompt?: {
        text: string
        sha256: string
    }
    /** Full metadata for an isolated Seedream diagnostic, stored with its result. */
    diagnostic?: {
        variantId: SeedreamDiagnosticVariantId
        conceptSource: SeedreamDiagnosticConceptSource
        promptStrategy: SeedreamDiagnosticPromptStrategy
        target: EvolutionTargetId
        concept: FluxMicroConcept | null
        /** Requested Seedream seed, when the diagnostic supplied one. */
        seed?: number
    }
    result?: {
        signedUrl: string
        expiresAt: string
        width: number
        height: number
        mimeType: 'image/png' | 'image/jpeg'
        sha256: string
        assetReadiness: CreatureTransformationAssetReadiness
        warnings: string[]
    }
    rawResult?: {
        signedUrl: string
        expiresAt: string
        width: number
        height: number
        mimeType: 'image/png' | 'image/jpeg'
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
    /** Metadata of the FLUX evolution behind this request. */
    fluxSnapshot?: {
        conceptName: string
        mutationIdea: string
        evolutionTargetId: EvolutionTargetId
        evolutionFunction: string
        capability: EvolutionCapability
        bodyPlanMutationId?: BodyPlanMutationId
        resultBodyPlanId?: BodyPlanId
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
        provider: string | null
        model: string | null
        promptTemplateVersion: string | null
        assetReadiness: CreatureTransformationAssetReadiness | null
        prompt: { text: string, sha256: string | null } | null
        result: {
            signedUrl: string
            expiresAt: string
            mimeType: 'image/png' | 'image/jpeg'
            width: number
            height: number
            sha256: string
        }
    }[]
}>

export type GenerateImageApiResponse = GenerateImageAcceptedResponse | CreatureTransformationErrorResponse

export type CreatureTransformationApiResponse =
    | GenerateImageApiResponse
    | TransformationRequestStatusResponse
    | CreatureTransformationLabUsageResponse
    | GeneratedImageCatalogResponse
    | SubmitBackgroundRemovalCandidateResponse
    | ListVisualBackgroundCleanupResponse
    | SubmitVisualBackgroundCleanupResponse
    | CreatureVisualProgressResponse
    | CurrentCreatureVisualApiResponse
    | GameCreatureVisualsResponse
    | AdoptCreatureTransformationResponse
    | RollbackCreatureVisualVersionResponse
