import type { ConceptEvaluation } from './concept-evaluation.ts'
import type { ConceptProblem } from './concept-validation.ts'
import type { CreatureTransformationConcept } from './concepts.ts'
import type { CreatureSemanticIdentity } from './contracts.ts'
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

export type GenerateConceptErrorResponse = {
    success: false
    requestId: string
    code: string
    message: string
    problems?: ConceptProblem[]
}

export type GenerateConceptApiResponse = GenerateConceptResponse | GenerateConceptErrorResponse

