import type { ConceptEvaluation } from './concept-evaluation.ts'
import type { ConceptProblem } from './concept-validation.ts'
import type { CreatureTransformationConcept } from './concepts.ts'
import type { CreatureSemanticIdentity } from './contracts.ts'
import type { ImageValidationProblem } from './image-validator.ts'
import type { ComposedCreatureTransformationPrompt } from './prompt-composer.ts'
import type { TransformationRequestPersistence, TransformationRequestStatusPersistence } from './request-persistence.ts'

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
}

export type GenerateImageErrorResponse = CreatureTransformationErrorResponse
export type GenerateImageApiResponse = GenerateImageResponse | GenerateImageAcceptedResponse | GenerateImageErrorResponse
export type CreatureTransformationApiResponse = GenerateConceptApiResponse | GenerateImageApiResponse | TransformationRequestStatusResponse
