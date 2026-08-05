import type { CreatureTransformationConcept } from './concepts.ts'
import {
    type ConceptGenerationMetadata,
    type CreatureConceptGenerationInput,
    type CreatureConceptGenerator,
} from './concept-generator.ts'
import { evaluateCreatureTransformationConcept, type ConceptEvaluation } from './concept-evaluation.ts'
import { validateCreatureTransformationConcept, type ConceptProblem } from './concept-validation.ts'

export type GenerateValidatedCreatureConceptInput = Readonly<{
    generator: CreatureConceptGenerator
    input: CreatureConceptGenerationInput
    maxAttempts?: 1 | 2
}>

export type GenerateValidatedCreatureConceptResult =
    | {
        success: true
        concept: CreatureTransformationConcept
        evaluation: ConceptEvaluation
        metadata: ConceptGenerationMetadata
        attempts: number
    }
    | {
        success: false
        problems: ConceptProblem[]
        attempts: number
    }

function feedbackFromProblems(problems: readonly ConceptProblem[]): string[] {
    return problems.map((problem) => `${problem.code}: ${problem.message}`)
}

export async function generateValidatedCreatureConcept(
    request: GenerateValidatedCreatureConceptInput,
): Promise<GenerateValidatedCreatureConceptResult> {
    const maxAttempts = request.maxAttempts ?? 2
    let correctionFeedback = request.input.correctionFeedback ? [...request.input.correctionFeedback] : []
    let lastProblems: ConceptProblem[] = []

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const candidate = await request.generator.generateConcept({
            ...request.input,
            correctionFeedback,
        })
        const validation = validateCreatureTransformationConcept(candidate, {
            requestedVisualTrait: request.input.visualTrait,
            ...(request.input.evolutionTarget ? {
                requestedEvolutionTarget: request.input.evolutionTarget,
                requestedEvolutionFunction: request.input.evolutionFunction,
            } : {}),
            requestedIntensity: request.input.intensity,
            identity: request.input.identity,
            previousTransformations: request.input.previousTransformations,
        })
        if (!validation.valid) {
            lastProblems = validation.problems
            correctionFeedback = feedbackFromProblems(lastProblems)
            continue
        }

        const evaluation = evaluateCreatureTransformationConcept(validation.concept, { identity: request.input.identity })
        if (!evaluation.acceptable) {
            lastProblems = evaluation.problems
            correctionFeedback = feedbackFromProblems(lastProblems)
            continue
        }

        return {
            success: true,
            concept: validation.concept,
            evaluation,
            metadata: { ...request.generator.metadata, attempt },
            attempts: attempt,
        }
    }

    return {
        success: false,
        problems: lastProblems,
        attempts: maxAttempts,
    }
}
