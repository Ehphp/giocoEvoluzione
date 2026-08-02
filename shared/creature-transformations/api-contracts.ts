import type { ConceptEvaluation } from './concept-evaluation.ts'
import type { ConceptProblem } from './concept-validation.ts'
import type { CreatureTransformationConcept } from './concepts.ts'
import type { CreatureSemanticIdentity } from './contracts.ts'
import type { ImageValidationProblem } from './image-validator.ts'
import type { ComposedCreatureTransformationPrompt } from './prompt-composer.ts'

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
}

export type CreatureTransformationErrorResponse = {
    success: false
    requestId: string
    code: string
    message: string
    problems?: Array<ConceptProblem | ImageValidationProblem>
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
}

export type GenerateImageErrorResponse = CreatureTransformationErrorResponse
export type GenerateImageApiResponse = GenerateImageResponse | GenerateImageErrorResponse
export type CreatureTransformationApiResponse = GenerateConceptApiResponse | GenerateImageApiResponse
