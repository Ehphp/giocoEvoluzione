import type { GenerateConceptErrorResponse, GenerateConceptResponse } from '../../../shared/creature-transformations/api-contracts.ts'
import type { CreatureConceptGenerator } from '../../../shared/creature-transformations/concept-generator.ts'
import { generateValidatedCreatureConcept } from '../../../shared/creature-transformations/generate-validated-concept.ts'
import { composeCreatureTransformationPrompt, CREATURE_PROMPT_TEMPLATE_VERSION } from '../../../shared/creature-transformations/prompt-composer.ts'
import { CURRENT_CREATURE_RENDER_SPECIFICATION } from '../../../shared/creature-transformations/render-specifications.ts'
import type { GenerateConceptRequest, CreatureIdentityResolver } from '../../../shared/creature-transformations/contracts.ts'
import { VISUAL_TRAIT_BY_ID } from '../../../shared/creature-transformations/visual-traits.ts'

export type GenerateConceptServiceInput = Readonly<{
    profileId: string
    requestId: string
    request: GenerateConceptRequest
    resolver: CreatureIdentityResolver
    generator: CreatureConceptGenerator
    now?: () => number
}>

export async function generateConceptForAuthenticatedProfile(
    input: GenerateConceptServiceInput,
): Promise<GenerateConceptResponse | GenerateConceptErrorResponse> {
    const now = input.now ?? (() => Date.now())
    const startedAt = now()
    const resolvedCreature = await input.resolver.resolve({
        profileId: input.profileId,
        creatureId: input.request.creatureId,
    })
    const visualTrait = VISUAL_TRAIT_BY_ID[input.request.visualTraitId]

    if (!visualTrait) {
        return {
            success: false,
            requestId: input.requestId,
            code: 'INVALID_VISUAL_TRAIT',
            message: 'Il Visual Trait richiesto non e supportato.',
        }
    }

    const generated = await generateValidatedCreatureConcept({
        generator: input.generator,
        input: {
            identity: resolvedCreature.identity,
            visualTrait,
            intensity: input.request.intensity,
            seed: [
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
        return {
            success: false,
            requestId: input.requestId,
            code: 'CONCEPT_REJECTED',
            message: 'Il concept non ha superato i controlli richiesti.',
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

