import type { GenerateConceptErrorResponse, GenerateConceptResponse } from '../../../shared/creature-transformations/api-contracts.ts'
import type { CreatureConceptGenerator } from '../../../shared/creature-transformations/concept-generator.ts'
import { generateValidatedCreatureConcept } from '../../../shared/creature-transformations/generate-validated-concept.ts'
import { composeCreatureTransformationPrompt, CREATURE_PROMPT_TEMPLATE_VERSION } from '../../../shared/creature-transformations/prompt-composer.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from '../../../shared/creature-transformations/render-specifications.ts'
import type { GenerateConceptRequest, CreatureIdentityResolver } from '../../../shared/creature-transformations/contracts.ts'
import { getEvolutionConstraints } from '../../../shared/creature-transformations/evolution-constraints.ts'
import { EVOLUTION_TARGET_BY_ID } from '../../../shared/creature-transformations/evolution-targets.ts'
import { VISUAL_TRAIT_BY_ID } from '../../../shared/creature-transformations/visual-traits.ts'

export type GeneratedConceptResponse = Omit<GenerateConceptResponse, 'requestPersistence'>

export type GenerateConceptServiceInput = Readonly<{
    profileId: string
    requestId: string
    request: GenerateConceptRequest
    resolver: CreatureIdentityResolver
    generator: CreatureConceptGenerator
    now?: () => number
    benchmarkConceptSeed?: string
}>

export async function generateConceptForAuthenticatedProfile(
    input: GenerateConceptServiceInput,
): Promise<GeneratedConceptResponse | GenerateConceptErrorResponse> {
    const now = input.now ?? (() => Date.now())
    const startedAt = now()
    const resolvedCreature = await input.resolver.resolve({
        profileId: input.profileId,
        creatureId: input.request.creatureId,
    })
    const visualTrait = VISUAL_TRAIT_BY_ID[input.request.visualTraitId]
    const evolutionTarget = input.request.evolutionTargetId ? EVOLUTION_TARGET_BY_ID[input.request.evolutionTargetId] : undefined

    if (!visualTrait) {
        return {
            success: false,
            requestId: input.requestId,
            code: 'INVALID_VISUAL_TRAIT',
            message: 'Il Visual Trait richiesto non e supportato.',
        }
    }
    if (input.request.evolutionTargetId) {
        if (!evolutionTarget) {
            return {
                success: false,
                requestId: input.requestId,
                code: 'INVALID_EVOLUTION_TARGET',
                message: 'Il target anatomico richiesto non e supportato.',
            }
        }
        const constraints = getEvolutionConstraints({
            evolutionTarget,
            visualTrait,
            evolutionFunction: input.request.evolutionFunction,
            intensity: input.request.intensity,
        })
        if (!constraints.isGeneratable) {
            return {
                success: false,
                requestId: input.requestId,
                code: 'CONCEPT_REJECTED',
                message: 'La direzione evolutiva non e generabile per il target anatomico scelto.',
                problems: constraints.structuralReasons.map((reason) => ({
                    code: reason.code === 'NO_ALLOWED_PRIMARY_BODY_AREA' ? 'BODY_AREA_NOT_ALLOWED' as const : 'INVALID_VISUAL_TRAIT' as const,
                    message: reason.message,
                })),
            }
        }
    }

    const generated = await generateValidatedCreatureConcept({
        generator: input.generator,
        input: {
            identity: resolvedCreature.identity,
            visualTrait,
            evolutionTarget,
            evolutionTargetId: input.request.evolutionTargetId,
            evolutionFunction: input.request.evolutionFunction,
            intensity: input.request.intensity,
            previousTransformations: resolvedCreature.previousTransformations,
            seed: input.benchmarkConceptSeed ?? [
                input.profileId,
                input.request.creatureId,
                input.request.visualTraitId,
                input.request.intensity,
                input.request.idempotencyKey,
            ].join(':'),
        },
        maxAttempts: 2,
    })

    if (!generated.success) {
        const problemCodes = [...new Set(generated.problems.map((problem) => problem.code))]
        return {
            success: false,
            requestId: input.requestId,
            code: 'CONCEPT_REJECTED',
            message: `Il concept non ha superato i controlli richiesti.${problemCodes.length ? ` Controlli: ${problemCodes.join(', ')}.` : ''}`,
            problems: generated.problems,
        }
    }

    return {
        success: true,
        requestId: input.requestId,
        identity: resolvedCreature.identity,
        concept: generated.concept,
        evaluation: generated.evaluation,
        prompt: composeCreatureTransformationPrompt({
            identity: resolvedCreature.identity,
            concept: generated.concept,
            renderSpecification: CURRENT_CREATURE_RENDER_SPECIFICATION,
            templateVersion: CREATURE_PROMPT_TEMPLATE_VERSION,
            previousTransformations: resolvedCreature.previousTransformations,
        }),
        generation: {
            generator: generated.metadata.generator,
            ...(generated.metadata.model ? { model: generated.metadata.model } : {}),
            isMock: generated.metadata.isMock,
            attempts: generated.attempts,
            latencyMs: Math.max(0, now() - startedAt),
        },
    }
}
